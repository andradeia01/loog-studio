import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getElevenLabsKey, synthesizeSpeech, VOICES, estimateVoiceCost } from "@/lib/ai/elevenlabs";
import { checkQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  text: z.string().trim().min(1).max(3000),
  voice_id: z.string().min(1),
  stability: z.number().min(0).max(1).optional(),
  similarity_boost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });

  const chars = parsed.data.text.length;
  const quota = await checkQuota(auth.auth.userId, auth.auth.role, "voice_chars", chars);
  if (!quota.ok) return NextResponse.json({ error: quota.reason, quota }, { status: 429 });

  const key = await getElevenLabsKey();
  if (!key) return NextResponse.json({ error: "ElevenLabs não configurado. Peça pro admin adicionar a chave em /admin/config." }, { status: 503 });

  const started = Date.now();
  try {
    const buf = await synthesizeSpeech(key, parsed.data.voice_id, parsed.data.text, {
      stability: parsed.data.stability,
      similarity_boost: parsed.data.similarity_boost,
      style: parsed.data.style,
    });
    const durationMs = Date.now() - started;
    const cost = estimateVoiceCost(chars);

    const admin = createSupabaseAdmin();
    if (admin) {
      await admin.from("ai_generations").insert({
        profile_id: auth.auth.userId,
        type: "voice",
        model: `elevenlabs-multilingual-v2:${parsed.data.voice_id}`,
        prompt: parsed.data.text.slice(0, 5000),
        result: { chars, voice_id: parsed.data.voice_id },
        cost_usd: cost,
        duration_ms: durationMs,
      });
    }

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "no-store",
        "X-Cost-USD": String(cost),
        "X-Chars": String(chars),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const admin = createSupabaseAdmin();
    if (admin) {
      await admin.from("ai_generations").insert({
        profile_id: auth.auth.userId,
        type: "voice",
        model: parsed.data.voice_id,
        prompt: parsed.data.text.slice(0, 5000),
        error: msg.slice(0, 500),
      });
    }
    return NextResponse.json({ error: "Falha ElevenLabs: " + msg }, { status: 500 });
  }
}

/** GET — lista vozes disponíveis. */
export async function GET() {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  return NextResponse.json({ voices: VOICES });
}
