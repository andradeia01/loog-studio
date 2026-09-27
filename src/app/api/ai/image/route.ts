import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getOpenAI, IMAGE_PRICING } from "@/lib/ai/openai";
import { checkQuota } from "@/lib/ai/quota";
import { IMAGE_PRESETS, type ImagePresetKey } from "@/lib/ai/prompts";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const BodySchema = z.object({
  preset: z.string().optional(),
  prompt_extra: z.string().max(500).optional(),
  size: z.enum(["1024x1024", "1024x1792", "1792x1024"]).default("1024x1024"),
  quality: z.enum(["standard", "hd"]).default("standard"),
});

export async function POST(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });

  const quota = await checkQuota(auth.auth.userId, auth.auth.role, "image");
  if (!quota.ok) return NextResponse.json({ error: quota.reason, quota }, { status: 429 });

  const openai = await getOpenAI();
  if (!openai) return NextResponse.json({ error: "OpenAI não configurado. Peça pro admin adicionar a chave em /admin/config." }, { status: 503 });

  const presetKey = parsed.data.preset as ImagePresetKey | undefined;
  const preset = presetKey ? IMAGE_PRESETS[presetKey] : null;
  const basePrompt = preset?.prompt ?? "";
  const fullPrompt = [basePrompt, parsed.data.prompt_extra].filter(Boolean).join(" ").trim();
  if (!fullPrompt) return NextResponse.json({ error: "sem prompt (defina preset ou prompt_extra)" }, { status: 400 });

  const started = Date.now();
  try {
    const res = await openai.images.generate({
      model: "dall-e-3",
      prompt: fullPrompt,
      size: parsed.data.size,
      quality: parsed.data.quality,
      response_format: "b64_json",
      n: 1,
    });
    const durationMs = Date.now() - started;
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("sem imagem no retorno");

    // salvar no Storage bucket ready-arts (privado do usuário? Vamos usar consultant-photos pra evitar acesso público de tudo)
    // Optar por bucket público 'ready-arts' pra facilitar preview no cliente
    const admin = createSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: "no supabase" }, { status: 500 });

    const filename = `ai-${slugify(presetKey ?? "custom")}-${auth.auth.userId.slice(0, 8)}-${Date.now()}.png`;
    const buf = Buffer.from(b64, "base64");
    const up = await admin.storage.from("ready-arts").upload(filename, buf, {
      contentType: "image/png",
      upsert: false,
    });
    let publicUrl: string | null = null;
    if (!up.error) {
      publicUrl = admin.storage.from("ready-arts").getPublicUrl(filename).data.publicUrl;
    }

    const cost =
      parsed.data.quality === "hd"
        ? IMAGE_PRICING["dall-e-3-1024-hd"]
        : parsed.data.size === "1024x1024"
          ? IMAGE_PRICING["dall-e-3-1024"]
          : IMAGE_PRICING["dall-e-3-1024x1792"];

    await admin.from("ai_generations").insert({
      profile_id: auth.auth.userId,
      type: "image",
      model: "dall-e-3",
      prompt: fullPrompt.slice(0, 5000),
      result: { url: publicUrl, size: parsed.data.size, preset: presetKey ?? null },
      cost_usd: cost,
      duration_ms: durationMs,
    });

    return NextResponse.json({
      url: publicUrl,
      b64: publicUrl ? null : b64, // fallback se storage falhou
      revised_prompt: res.data?.[0]?.revised_prompt,
      cost_usd: cost,
      quota,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const admin = createSupabaseAdmin();
    if (admin) {
      await admin.from("ai_generations").insert({
        profile_id: auth.auth.userId,
        type: "image",
        model: "dall-e-3",
        prompt: fullPrompt.slice(0, 5000),
        error: msg.slice(0, 500),
      });
    }
    return NextResponse.json({ error: "Falha DALL-E: " + msg }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const list = Object.entries(IMAGE_PRESETS).map(([k, v]) => ({
    key: k,
    label: v.label,
    description: v.description,
    prompt: v.prompt,
  }));
  return NextResponse.json({ presets: list });
}
