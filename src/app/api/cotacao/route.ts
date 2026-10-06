import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { quoteFromPlate, quoteFromText, HubError } from "@/lib/loog-hub";
import { registrarInteracaoCRM } from "@/lib/crm/registrar";
import { consultarPlaca } from "@/lib/placafipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 60_000;
function rateLimited(ip: string) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || rec.resetAt < now) { HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  rec.count += 1;
  return rec.count > LIMIT;
}

const Body = z.object({
  placa: z.string().min(7).max(10),
  cliente: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(8).max(20),
  }),
  leadId: z.string().optional(),
});

/**
 * Rota única: recebe placa + cliente, chama Hub `/v1/quote/from-plate`,
 * devolve cotação oficial LOOG (valor mensal, adesão, pdfUrl, whatsappMessage).
 *
 * O Hub cuida de: lookup placa → FIPE → cadeia Sivisweb → PDF proxy.
 * O LOOG Studio não calcula nada por conta própria.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let consultorId: string | undefined;
  let groupId: string | null | undefined;
  if (supabaseConfigured()) {
    const auth = await requireApproved();
    if (!auth.ok) return auth.res;
    consultorId = auth.auth.userId;
    groupId = auth.auth.groupId;
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  const telefoneDigits = parsed.data.cliente.telefone.replace(/[^0-9]/g, "");
  if (telefoneDigits.length < 10) {
    return NextResponse.json({ error: "telefone_invalido", message: "Telefone precisa ter DDD + número (10 ou 11 dígitos)." }, { status: 400 });
  }
  // Hub espera E.164 BR (55DDNNNNNNNNN); se já veio com 55, mantém, senão prefixa.
  const customerPhone = telefoneDigits.startsWith("55") ? telefoneDigits : `55${telefoneDigits}`;
  const leadIdFinal = parsed.data.leadId ?? (consultorId ? `loogstudio:${consultorId}` : undefined);

  // ========================================================================
  // CAMINHO PRIMÁRIO: PlacaFIPE (API paga configurada no admin) → quoteFromText
  // ========================================================================
  // Mais confiável que o provider interno do Hub pra placas Mercosul.
  // Se a PlacaFIPE tiver o veículo + FIPE, montamos o payload e enviamos
  // diretamente pelo endpoint from-text do Hub, pulando o lookup interno.
  let viaPrimario: "placafipe" | null = null;
  try {
    const placafipe = await consultarPlaca(parsed.data.placa);
    if (placafipe.ok && placafipe.veiculo.marca && placafipe.veiculo.modelo) {
      const v = placafipe.veiculo;
      const fipe = placafipe.fipe_recomendado;
      const anoModelo = Number(v.ano_modelo || v.ano || fipe?.ano_modelo || 0);

      if (anoModelo >= 1980 && v.marca && v.modelo) {
        viaPrimario = "placafipe";
        const result = await quoteFromText({
          brand: v.marca,
          model: v.modelo,
          modelYear: anoModelo,
          fuel: v.combustivel ?? fipe?.combustivel ?? undefined,
          plate: parsed.data.placa,
          customerName: parsed.data.cliente.nome,
          customerPhone,
          leadId: leadIdFinal,
        });

        if (consultorId) {
          void registrarInteracaoCRM({
            ownerId: consultorId,
            groupId,
            tipo: "cotacao_rapida",
            nome: parsed.data.cliente.nome,
            telefone: parsed.data.cliente.telefone,
            payload: {
              via: "placafipe+from-text",
              placa: parsed.data.placa,
              marca: v.marca, modelo: v.modelo, ano: anoModelo,
              cor: v.cor, uf: v.uf, municipio: v.municipio,
              fipeCodigo: fipe?.codigo_fipe ?? null,
              fipeValor: fipe?.valor_formatado ?? null,
              vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
              valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? fipe?.valor_formatado ?? null,
              quoteId: (result as { quoteId?: string }).quoteId ?? null,
            },
          });
        }

        return NextResponse.json({ ok: true, via: "placafipe", ...result });
      }
    } else if (!placafipe.ok) {
      // Log só pra observabilidade — não derruba, cai no fallback
      console.warn("[cotacao] PlacaFIPE falhou (seguindo pra Hub direto):", placafipe.status, placafipe.message);
    }
  } catch (pfErr) {
    console.warn("[cotacao] PlacaFIPE erro inesperado:", pfErr instanceof Error ? pfErr.message : pfErr);
  }

  // ========================================================================
  // FALLBACK: provider interno do Hub (quoteFromPlate)
  // ========================================================================
  try {
    const result = await quoteFromPlate({
      plate: parsed.data.placa,
      customerName: parsed.data.cliente.nome,
      customerPhone,
      leadId: leadIdFinal,
    });

    if (consultorId) {
      void registrarInteracaoCRM({
        ownerId: consultorId,
        groupId,
        tipo: "cotacao_rapida",
        nome: parsed.data.cliente.nome,
        telefone: parsed.data.cliente.telefone,
        payload: {
          via: "hub-from-plate",
          placa: parsed.data.placa,
          vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
          valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? null,
          quoteId: (result as { quoteId?: string }).quoteId ?? null,
        },
      });
    }

    return NextResponse.json({ ok: true, via: "hub-from-plate", ...result });
  } catch (err) {
    void viaPrimario; // evita unused warning
    if (err instanceof HubError) {
      // Log DETALHADO pra diagnóstico (nunca vaza pro cliente, só pros Function Logs)
      console.error("[cotacao] HubError:", {
        status: err.status,
        code: err.code,
        message: err.message,
        placa: parsed.data.placa,
        payload: err.payload,
      });

      // Mensagem específica por status — ajuda o consultor entender e sugere caminho
      let user: string;
      let canFallbackManual = false;
      switch (err.status) {
        case 401:
          user = "Chave do sistema LOOG inválida ou sessão expirada. Fale com o admin pra renovar — enquanto isso, use cotação manual (marca/modelo/ano).";
          canFallbackManual = true;
          break;
        case 403:
          user = "Esta placa está bloqueada no provedor LOOG (pode ser restrição comercial da base). Tente cotação manual.";
          canFallbackManual = true;
          break;
        case 404:
          user = "Placa não encontrada no provedor LOOG. Verifique se digitou certo — se tiver certeza da placa, use cotação manual (informa marca/modelo/ano).";
          canFallbackManual = true;
          break;
        case 429:
          user = "Muitas consultas em pouco tempo. Aguarde ~30s e tente novamente.";
          break;
        case 408:
        case 504:
          user = "O provedor LOOG demorou demais pra responder. Tente de novo.";
          break;
        case 502:
        case 503:
          user = "Sistema interno LOOG indisponível no momento. Tente em alguns segundos.";
          break;
        default:
          user = `Erro ao consultar placa (status ${err.status}). ${err.message}`;
      }
      return NextResponse.json(
        { error: err.code ?? "hub_error", message: user, status: err.status, canFallbackManual },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cotacao] falha nao-Hub:", msg);
    return NextResponse.json({ error: "falha", message: msg }, { status: 500 });
  }
}
