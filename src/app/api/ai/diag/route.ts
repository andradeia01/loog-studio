/**
 * GET /api/ai/diag — diagnóstico das chaves AI (Anthropic + OpenAI).
 *
 * Só admin acessa. NUNCA retorna a chave em claro — apenas:
 *  - fonte: "db" (admin_settings) | "env" (ANTHROPIC_API_KEY) | "none"
 *  - prefix: primeiros 12 chars (ex: "sk-ant-svc-1...") pra identificar formato
 *  - len: tamanho total
 *  - ping: tenta chamada simples pra API e retorna status/erro
 */
import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { getApiKeys } from "@/lib/admin-settings";
import { getAnthropicKeySource, MODEL_OCR as CLAUDE_MODEL } from "@/lib/ai/anthropic";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await requireApproved();
  if (!r.ok) return r.res;
  if (r.auth.role !== "admin") {
    return NextResponse.json({ error: "forbidden", message: "Só admin pode diagnosticar chaves" }, { status: 403 });
  }

  const dbKeys = await getApiKeys();
  const envAnthropic = process.env.ANTHROPIC_API_KEY || "";
  const envOpenai = process.env.OPENAI_API_KEY || "";
  const anthroKey = dbKeys.anthropic || envAnthropic || "";
  const anthroSrc = await getAnthropicKeySource();

  const diag: Record<string, unknown> = {
    anthropic: {
      source: anthroSrc,
      db_present: !!dbKeys.anthropic,
      db_len: dbKeys.anthropic?.length ?? 0,
      db_prefix: dbKeys.anthropic ? dbKeys.anthropic.slice(0, 12) + "..." : null,
      env_present: !!envAnthropic,
      env_len: envAnthropic.length,
      env_prefix: envAnthropic ? envAnthropic.slice(0, 12) + "..." : null,
      effective_prefix: anthroKey ? anthroKey.slice(0, 12) + "..." : null,
      effective_len: anthroKey.length,
      model: CLAUDE_MODEL,
      ping: null as unknown,
    },
    openai: {
      db_present: !!dbKeys.openai,
      db_len: dbKeys.openai?.length ?? 0,
      db_prefix: dbKeys.openai ? dbKeys.openai.slice(0, 12) + "..." : null,
      env_present: !!envOpenai,
      env_len: envOpenai.length,
    },
  };

  // Ping Anthropic — chamada minima pra ver se a chave que o server EFETIVAMENTE usa funciona
  if (anthroKey) {
    try {
      const client = new Anthropic({ apiKey: anthroKey });
      const res = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      });
      const txt = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      (diag.anthropic as Record<string, unknown>).ping = { ok: true, response: txt.slice(0, 80), tokens: res.usage };
    } catch (err) {
      const e = err as { status?: number; message?: string; error?: unknown };
      (diag.anthropic as Record<string, unknown>).ping = {
        ok: false,
        status: e.status ?? null,
        message: (e.message || "unknown").slice(0, 300),
        anthropic_error: e.error ?? null,
      };
    }
  }

  return NextResponse.json(diag);
}
