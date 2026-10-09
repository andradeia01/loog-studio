import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { quoteFromPlate, quoteFromText, HubError } from "@/lib/loog-hub";
import { registrarInteracaoCRM } from "@/lib/crm/registrar";
import { consultarPlaca, variantesPlaca, inferirTipoVeiculo } from "@/lib/placafipe";

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
  tipo_veiculo: z.enum(["carro", "moto", "utilitario", "eletrico"]).optional(),
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

      // IMPORTANTE: a PlacaFIPE retorna 2 descrições do veículo:
      //   - informacoes_veiculo.modelo   = texto curto/abreviado (ex "PALIO WK ADVEN FLEX")
      //   - fipe[].modelo                = texto COMPLETO do catálogo FIPE (ex "Palio Weekend Adventure LOCKER 1.8 Flex")
      // O Hub faz matching por similaridade no catálogo FIPE, então usar o
      // texto curto gera MATCH ERRADO (ex: casa com "Palio ELX 1.0 Fire"
      // que não é o veículo real). Preferir SEMPRE o texto do FIPE quando houver.
      const marcaFinal = fipe?.marca || v.marca;
      const modeloFinal = fipe?.modelo || v.modelo;
      const anoModelo = Number(fipe?.ano_modelo || v.ano_modelo || v.ano || 0);

      if (anoModelo >= 1980 && marcaFinal && modeloFinal) {
        viaPrimario = "placafipe";
        const placaPraHub = placafipe.veiculo.placa_alternativa ?? parsed.data.placa;

        // Tipo de veículo: usuário manda explícito OU inferimos do segmento/combustível
        const tipoInferido = inferirTipoVeiculo({
          segmento: v.segmento, sub_segmento: v.sub_segmento, combustivel: fipe?.combustivel ?? v.combustivel,
        });
        const vehicleTypeFinal = parsed.data.tipo_veiculo ?? tipoInferido ?? "carro";

        const result = await quoteFromText({
          brand: marcaFinal,
          model: modeloFinal,
          modelYear: anoModelo,
          fuel: fipe?.combustivel ?? v.combustivel ?? undefined,
          // Código FIPE oficial — se o Hub suportar, pula totalmente o matching
          // por string e usa a FIPE exata (ex: "001255-6" = Palio WK Adventure)
          fipeCode: fipe?.codigo_fipe ?? undefined,
          vehicleType: vehicleTypeFinal,
          plate: placaPraHub,
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
              marcaCurta: v.marca, modeloCurto: v.modelo,
              marca: marcaFinal, modelo: modeloFinal, ano: anoModelo,
              cor: v.cor, uf: v.uf, municipio: v.municipio,
              fipeCodigo: fipe?.codigo_fipe ?? null,
              fipeValor: fipe?.valor_formatado ?? null,
              fipeSimilaridade: fipe?.similaridade ?? null,
              vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
              valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? fipe?.valor_formatado ?? null,
              quoteId: (result as { quoteId?: string }).quoteId ?? null,
              monthlyValueCents: (result as { monthlyValueCents?: number }).monthlyValueCents ?? null,
              whatsappMessage: (result as { whatsappMessage?: string }).whatsappMessage ?? null,
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
  // Tenta variantes de placa (Mercosul ↔ antiga) sequencialmente — o Hub
  // pode conhecer uma mas não a outra (ex: SIVIS historicamente usa antiga).
  // ========================================================================
  const placasPraTentar = variantesPlaca(parsed.data.placa);
  let ultimoErro: unknown = null;

  for (const placaVariante of placasPraTentar) {
    try {
      const result = await quoteFromPlate({
        plate: placaVariante,
        vehicleType: parsed.data.tipo_veiculo,
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
            via: placaVariante !== parsed.data.placa ? "hub-from-plate+variant" : "hub-from-plate",
            placa: parsed.data.placa,
            placaUsada: placaVariante,
            vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
            valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? null,
            quoteId: (result as { quoteId?: string }).quoteId ?? null,
            monthlyValueCents: (result as { monthlyValueCents?: number }).monthlyValueCents ?? null,
            whatsappMessage: (result as { whatsappMessage?: string }).whatsappMessage ?? null,
          },
        });
      }

      return NextResponse.json({ ok: true, via: "hub-from-plate", placaUsada: placaVariante, ...result });
    } catch (err) {
      ultimoErro = err;
      // Se for 404 (placa não encontrada), vale tentar a próxima variante.
      // Se for outro erro (401/403/500), também vale tentar — o Hub pode se comportar diferente.
      if (err instanceof HubError) {
        console.warn(`[cotacao] Hub falhou pra ${placaVariante}: ${err.status} ${err.message}`);
        continue;
      }
      // Erro não-Hub: aborta
      break;
    }
  }

  // Se chegou aqui, nenhuma variante funcionou. Processa o último erro.
  {
    const err = ultimoErro;
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
