import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireApproved } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import sharp from "sharp";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

const MetaSchema = z.object({
  title: z.string().trim().min(2).max(80),
  category: z.enum(["institucional", "vendas", "protecao", "recrutamento", "stories", "feed"]),
  format: z.enum(["feed-1x1", "feed-4x5", "story-9x16"]),
});

/**
 * GET /api/ready-arts → consultores aprovados leem lista de artes prontas.
 */
export async function GET() {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("ready_arts")
    .select("id, title, category, format, image_url, thumbnail_url, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ readyArts: data ?? [] });
}

/**
 * POST /api/ready-arts (admin) — multipart:
 *   file: File PNG/JPG/WEBP
 *   title, category, format: strings
 * Sobe pra bucket "ready-arts" e cria a row.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const form = await req.formData();
  const file = form.get("file");
  const meta = MetaSchema.safeParse({
    title: form.get("title"),
    category: form.get("category"),
    format: form.get("format"),
  });
  if (!meta.success) {
    return NextResponse.json({ error: "metadados inválidos", details: meta.error.flatten() }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "tipo não suportado" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "arquivo muito grande" }, { status: 413 });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  const fullPng = await sharp(raw).png({ compressionLevel: 9 }).toBuffer();
  const thumbJpg = await sharp(raw)
    .resize({ width: 720, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const supabase = await createSupabaseServer();
  const slug = slugify(meta.data.title);
  const stamp = Date.now();
  const fullPath = `${slug}-${stamp}.png`;
  const thumbPath = `${slug}-${stamp}.thumb.jpg`;

  const up1 = await supabase.storage.from("ready-arts").upload(fullPath, fullPng, {
    contentType: "image/png",
    upsert: true,
  });
  if (up1.error) return NextResponse.json({ error: up1.error.message }, { status: 500 });

  const up2 = await supabase.storage.from("ready-arts").upload(thumbPath, thumbJpg, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up2.error) return NextResponse.json({ error: up2.error.message }, { status: 500 });

  const { data: fullPub } = supabase.storage.from("ready-arts").getPublicUrl(fullPath);
  const { data: thumbPub } = supabase.storage.from("ready-arts").getPublicUrl(thumbPath);

  const { data, error } = await supabase
    .from("ready_arts")
    .insert({
      title: meta.data.title,
      category: meta.data.category,
      format: meta.data.format,
      image_url: fullPub.publicUrl,
      thumbnail_url: thumbPub.publicUrl,
      created_by: auth.auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ readyArt: data }, { status: 201 });
}
