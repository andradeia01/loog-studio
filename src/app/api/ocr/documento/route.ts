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
  // aceita data URL de imagem OU PDF
  imageDataUrl: z.string()
    .max(12_000_000) // ~9MB após base64
    .refine((s) => s.startsWith("data:image/") || s.startsWith("data:application/pdf"), {
      message: "Precisa ser data URL de imagem ou PDF",
    }),
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
    const result = await extrairDocumento(parsed.data.tipo as DocumentoTipo, String(parsed.data.imageDataUrl));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ocr/documento] erro:", msg);
    const low = msg.toLowerCase();

    if (low.includes("anthropic não configurado") || low.includes("não configurado")) {
      return NextResponse.json({
        error: "anthropic_nao_configurado",
        message: "A chave da Anthropic não está cadastrada. Admin: /admin/config → API Keys → Anthropic.",
        acao: "manual",
      }, { status: 503 });
    }
    if (low.includes("credit") || low.includes("insufficient") || low.includes("balance")) {
      return NextResponse.json({
        error: "sem_creditos",
        message: "A conta Anthropic está sem créditos. Peça pro admin recarregar em console.anthropic.com/settings/billing.",
        acao: "manual",
      }, { status: 503 });
    }
    if (low.includes("401") || low.includes("invalid_api_key") || low.includes("authentication") || low.includes("authorization")) {
      return NextResponse.json({
        error: "key_invalida",
        message: "A chave da Anthropic está inválida ou expirou. Admin: atualize em /admin/config → API Keys.",
        acao: "manual",
      }, { status: 503 });
    }
    if (low.includes("rate limit") || low.includes("rate_limit") || low.includes("429")) {
      return NextResponse.json({ error: "rate_limit", message: "Muitas leituras agora. Tenta em alguns segundos." }, { status: 429 });
    }
    return NextResponse.json({ error: "ocr_falhou", message: msg, acao: "manual" }, { status: 500 });
  }
}
