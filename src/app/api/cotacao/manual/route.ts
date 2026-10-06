import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { quoteFromText, HubError } from "@/lib/loog-hub";
import { registrarInteracaoCRM } from "@/lib/crm/registrar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || rec.resetAt < now) { HITS.set(ip, { count: 1, resetAt: now + windowMs }); return false; }
  rec.count += 1;
  return rec.count > limit;
}

const Body = z.object({
  marca: z.string().trim().min(2).max(60),
  modelo: z.string().trim().min(2).max(120),
  ano: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  combustivel: z.string().trim().max(30).optional(),
  placa: z.string().trim().max(10).optional(), // placa opcional (pra constar na proposta)
  cliente: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(8).max(20),
  }),
  leadId: z.string().optional(),
});

/**
 * Fallback de Cotação Rápida: quando o lookup de placa falhou (404/401/etc),
 * o consultor informa marca+modelo+ano manualmente e a cotação sobe via
 * /v1/quote/from-text no Hub. Útil pra Mercosul novo, zero-km, ou placa
 * fora da base do provedor.
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

  const telDig = parsed.data.cliente.telefone.replace(/[^0-9]/g, "");
  if (telDig.length < 10) {
    return NextResponse.json({ error: "telefone_invalido", message: "Telefone precisa ter DDD + número." }, { status: 400 });
  }
  const customerPhone = telDig.startsWith("55") ? telDig : `55${telDig}`;

  try {
    const result = await quoteFromText({
      brand: parsed.data.marca,
      model: parsed.data.modelo,
      modelYear: parsed.data.ano,
      fuel: parsed.data.combustivel,
      plate: parsed.data.placa,
      customerName: parsed.data.cliente.nome,
      customerPhone,
      leadId: parsed.data.leadId ?? (consultorId ? `loogstudio:${consultorId}` : undefined),
    });

    if (consultorId) {
      void registrarInteracaoCRM({
        ownerId: consultorId,
        groupId,
        tipo: "cotacao_rapida",
        nome: parsed.data.cliente.nome,
        telefone: parsed.data.cliente.telefone,
        payload: {
          via: "manual",
          placa: parsed.data.placa ?? null,
          marca: parsed.data.marca,
          modelo: parsed.data.modelo,
          ano: parsed.data.ano,
          vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
          valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? null,
          quoteId: (result as { quoteId?: string }).quoteId ?? null,
        },
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof HubError) {
      console.error("[cotacao/manual] HubError:", { status: err.status, code: err.code, message: err.message, payload: err.payload });
      const user = err.status === 429
        ? "Muitas consultas. Aguarde e tente novamente."
        : err.status >= 500
          ? "Sistema interno LOOG indisponível. Tente em alguns segundos."
          : `Falha ao criar cotação manual (${err.status}): ${err.message}`;
      return NextResponse.json({ error: err.code ?? "hub_error", message: user, status: err.status }, { status: err.status >= 400 && err.status < 500 ? err.status : 502 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cotacao/manual] falha:", msg);
    return NextResponse.json({ error: "falha", message: msg }, { status: 500 });
  }
}
