import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { quoteFromPlate, HubError } from "@/lib/loog-hub";
import { registrarInteracaoCRM } from "@/lib/crm/registrar";

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

  try {
    const result = await quoteFromPlate({
      plate: parsed.data.placa,
      customerName: parsed.data.cliente.nome,
      customerPhone,
      leadId: parsed.data.leadId ?? (consultorId ? `loogstudio:${consultorId}` : undefined),
    });

    // CRM hook — side-effect, não derruba a cotação se falhar
    if (consultorId) {
      void registrarInteracaoCRM({
        ownerId: consultorId,
        groupId,
        tipo: "cotacao_rapida",
        nome: parsed.data.cliente.nome,
        telefone: parsed.data.cliente.telefone,
        payload: {
          placa: parsed.data.placa,
          vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
          valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? null,
          quoteId: (result as { quoteId?: string }).quoteId ?? null,
        },
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof HubError) {
      const user = err.status === 404
        ? "Placa não encontrada ou FIPE não resolvida — verifique a placa e tente novamente."
        : err.status === 502 || err.status === 503
          ? "Sistema interno LOOG indisponível no momento. Tente em alguns segundos."
          : err.message;
      return NextResponse.json({ error: err.code ?? "hub_error", message: user, status: err.status }, { status: err.status >= 400 && err.status < 500 ? err.status : 502 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cotacao] falha:", msg);
    return NextResponse.json({ error: "falha", message: msg }, { status: 500 });
  }
}
