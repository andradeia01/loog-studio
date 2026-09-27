import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireApproved } from "@/lib/auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]);

const MetaSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.enum(["institucional", "vendas", "protecao", "recrutamento", "stories", "feed"]),
  format: z.enum(["reel-9x16", "square-1x1", "landscape-16x9"]),
  folder_id: z.string().uuid().nullable().optional(),
  duration_sec: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/ready-videos → consultor aprovado lê lista.
 * Suporta ?folder=<id>|none pra filtro.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const folderQ = req.nextUrl.searchParams.get("folder");
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("ready_videos")
    .select("id, title, category, format, video_url, thumbnail_url, folder_id, duration_sec, size_bytes, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (folderQ === "none") query = query.is("folder_id", null);
  else if (folderQ) query = query.eq("folder_id", folderQ);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ readyVideos: data ?? [] });
}

/** POST — admin publica vídeo. multipart: file + title + category + format + folder_id? + thumbnail? */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const form = await req.formData();
  const file = form.get("file");
  const thumbFile = form.get("thumbnail");
  const folderRaw = form.get("folder_id");
  const meta = MetaSchema.safeParse({
    title: form.get("title"),
    category: form.get("category"),
    format: form.get("format"),
    folder_id: typeof folderRaw === "string" && folderRaw !== "" ? folderRaw : null,
    duration_sec: form.get("duration_sec") ?? undefined,
  });
  if (!meta.success) return NextResponse.json({ error: "metadados inválidos", details: meta.error.flatten() }, { status: 400 });

  if (!(file instanceof File)) return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: `tipo não suportado: ${file.type}` }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `arquivo muito grande (max 100MB)` }, { status: 413 });

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase" }, { status: 500 });

  const slug = slugify(meta.data.title);
  const stamp = Date.now();
  const ext = file.name.split(".").pop() ?? "mp4";
  const videoPath = `${slug}-${stamp}.${ext}`;

  const videoBuf = Buffer.from(await file.arrayBuffer());
  const upV = await admin.storage.from("ready-videos").upload(videoPath, videoBuf, {
    contentType: file.type,
    upsert: true,
  });
  if (upV.error) return NextResponse.json({ error: upV.error.message }, { status: 500 });

  let thumbUrl: string | null = null;
  if (thumbFile instanceof File && thumbFile.size > 0) {
    const thumbBuf = Buffer.from(await thumbFile.arrayBuffer());
    const thumbPath = `${slug}-${stamp}.thumb.jpg`;
    const upT = await admin.storage.from("ready-videos").upload(thumbPath, thumbBuf, {
      contentType: thumbFile.type || "image/jpeg",
      upsert: true,
    });
    if (!upT.error) {
      thumbUrl = admin.storage.from("ready-videos").getPublicUrl(thumbPath).data.publicUrl;
    }
  }

  const videoUrl = admin.storage.from("ready-videos").getPublicUrl(videoPath).data.publicUrl;

  const { data, error } = await admin
    .from("ready_videos")
    .insert({
      title: meta.data.title,
      category: meta.data.category,
      format: meta.data.format,
      folder_id: meta.data.folder_id ?? null,
      video_url: videoUrl,
      thumbnail_url: thumbUrl,
      duration_sec: meta.data.duration_sec ?? null,
      size_bytes: file.size,
      created_by: auth.auth.userId,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ readyVideo: data }, { status: 201 });
}
