import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { extrairDocumento, type DocumentoTipo } from "@/lib/ai/ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  tipo: z.enum(["crlv", "cnh", "residencia"]),
  imageDataUrl: z.string().startsWith("data:image/").max(12_000_000), // ~9MB após base64
});

const HITS = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 30;
const WINDOW_MS = 60_000;
function rateLimited(ip: string) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || rec.resetAt < now) { HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  rec.count += 1;
  return rec.count > LIMIT;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  if (supabaseConfigured()) {
    const auth = await requireApproved();
    if (!auth.ok) return auth.res;
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await extrairDocumento(parsed.data.tipo as DocumentoTipo, parsed.data.imageDataUrl);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ocr/documento] erro:", msg);
    const low = msg.toLowerCase();
    if (low.includes("insufficient_quota") || low.includes("credit_balance_exhausted")) {
      return NextResponse.json({ error: "openai_sem_creditos", message: "A conta OpenAI está sem créditos. Peça pro admin recarregar." }, { status: 503 });
    }
    return NextResponse.json({ error: "ocr_falhou", message: msg }, { status: 500 });
  }
}
