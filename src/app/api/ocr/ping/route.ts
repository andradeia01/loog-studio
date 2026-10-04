import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { getAnthropic, MODEL_OCR } from "@/lib/ai/anthropic";
import { getApiKeys } from "@/lib/admin-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnóstico Anthropic — só admin. Faz 1 call minúscula só pra ver o erro cru da API.
 * Nunca vaza a chave, só mascara.
 */
export async function GET() {
  if (supabaseConfigured()) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.res;
  }

  const keys = await getApiKeys();
  const rawKey = keys.anthropic ?? "";
  const keyInfo = {
    presente: !!rawKey,
    length: rawKey.length,
    prefix: rawKey.slice(0, 12),
    sufix: rawKey.slice(-6),
    tipo: rawKey.startsWith("sk-ant-api03-") ? "api"
         : rawKey.startsWith("sk-ant-admin") ? "admin"
         : rawKey.startsWith("sk-ant-usr-") ? "usr"
         : "desconhecido",
  };

  const client = await getAnthropic();
  if (!client) {
    return NextResponse.json({ ok: false, step: "no_client", key: keyInfo });
  }

  try {
    const t0 = Date.now();
    const res = await client.messages.create({
      model: MODEL_OCR,
      max_tokens: 20,
      messages: [{ role: "user", content: "Diga apenas: OK" }],
    });
    const txt = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
    return NextResponse.json({
      ok: true,
      step: "ok",
      model: MODEL_OCR,
      key: keyInfo,
      ms: Date.now() - t0,
      resposta: txt,
      tokens: { in: res.usage.input_tokens, out: res.usage.output_tokens },
    });
  } catch (err) {
    const e = err as { status?: number; message?: string; error?: unknown; name?: string };
    return NextResponse.json({
      ok: false,
      step: "api_call",
      key: keyInfo,
      model: MODEL_OCR,
      error: {
        name: e.name,
        status: e.status,
        message: e.message,
        payload: e.error,
      },
    }, { status: 200 });
  }
}
