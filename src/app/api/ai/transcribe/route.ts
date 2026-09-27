import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/ai/openai";
import { checkQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MAX_BYTES = 25 * 1024 * 1024; // Whisper limite

/** POST multipart: file (audio/video) → JSON com texto transcrito + segmentos. */
export async function POST(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const form = await req.formData();
  const file = form.get("file");
  const language = (form.get("language") as string | null) ?? "pt";
  if (!(file instanceof File)) return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "arquivo > 25MB" }, { status: 413 });

  // quota (aproximação: 1 min = 1 unidade; sem duração aqui, usamos tamanho como proxy — 1MB ~ 1min de mp3 128kbps)
  const estMin = Math.max(1, Math.round(file.size / (1024 * 1024)));
  const quota = await checkQuota(auth.auth.userId, auth.auth.role, "transcribe_min", estMin);
  if (!quota.ok) return NextResponse.json({ error: quota.reason, quota }, { status: 429 });

  const openai = await getOpenAI();
  if (!openai) return NextResponse.json({ error: "OpenAI não configurado. Peça pro admin adicionar a chave em /admin/config." }, { status: 503 });

  const started = Date.now();
  try {
    const res = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language,
      response_format: "verbose_json",
      timestamp_granularities: ["segment", "word"],
    });
    const durationMs = Date.now() - started;
    // Whisper: $0.006/min
    const cost = estMin * 0.006;

    const admin = createSupabaseAdmin();
    if (admin) {
      await admin.from("ai_generations").insert({
        profile_id: auth.auth.userId,
        type: "transcribe",
        model: "whisper-1",
        prompt: `[audio ${file.size} bytes, ${language}]`,
        result: res as never,
        cost_usd: cost,
        duration_ms: durationMs,
      });
    }

    return NextResponse.json({
      text: res.text,
      language: res.language,
      duration: res.duration,
      segments: res.segments ?? [],
      words: (res as { words?: unknown[] }).words ?? [],
      cost_usd: cost,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const admin = createSupabaseAdmin();
    if (admin) {
      await admin.from("ai_generations").insert({
        profile_id: auth.auth.userId,
        type: "transcribe",
        model: "whisper-1",
        error: msg.slice(0, 500),
      });
    }
    return NextResponse.json({ error: "Falha Whisper: " + msg }, { status: 500 });
  }
}
