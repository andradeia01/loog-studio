import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { getAnthropic } from "@/lib/ai/anthropic";
import { getApiKeys } from "@/lib/admin-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnóstico profundo da chave Anthropic:
 *   1) lista modelos acessíveis (GET /v1/models)
 *   2) tenta criar message no 1º modelo listado
 * Admin only. Nunca vaza a chave.
 */
export async function GET() {
  if (supabaseConfigured()) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.res;
  }

  const keys = await getApiKeys();
  const rawKey = (keys.anthropic ?? "").trim();
  const keyInfo = {
    presente: !!rawKey,
    length: rawKey.length,
    prefix: rawKey.slice(0, 12),
    sufix: rawKey.slice(-6),
    temEspaco: /\s/.test(rawKey),
  };

  if (!rawKey) return NextResponse.json({ ok: false, step: "no_key", key: keyInfo });

  // 1) GET /v1/models — lista o que a conta vê
  let modelsList: unknown = null;
  let modelsErr: unknown = null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": rawKey,
        "anthropic-version": "2023-06-01",
      },
    });
    const txt = await r.text();
    try { modelsList = { status: r.status, body: JSON.parse(txt) }; }
    catch { modelsList = { status: r.status, raw: txt.slice(0, 500) }; }
  } catch (e) {
    modelsErr = { message: (e as Error).message };
  }

  // 2) tenta uma mensagem mínima no primeiro modelo listado (se houver)
  const client = await getAnthropic();
  const ml = modelsList as { body?: { data?: Array<{ id: string }> } } | null;
  const primeiroModelo = ml?.body?.data?.[0]?.id;
  let messageTest: unknown = null;
  if (client && primeiroModelo) {
    try {
      const res = await client.messages.create({
        model: primeiroModelo,
        max_tokens: 10,
        messages: [{ role: "user", content: "OK" }],
      });
      messageTest = {
        ok: true,
        model: primeiroModelo,
        tokens: { in: res.usage.input_tokens, out: res.usage.output_tokens },
      };
    } catch (e) {
      const err = e as { status?: number; message?: string; error?: unknown };
      messageTest = { ok: false, model: primeiroModelo, status: err.status, message: err.message, payload: err.error };
    }
  }

  return NextResponse.json({
    key: keyInfo,
    modelsList,
    modelsErr,
    primeiroModelo,
    messageTest,
  });
}
