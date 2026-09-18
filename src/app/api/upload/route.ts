import { NextRequest, NextResponse } from "next/server";
import { writeTemplateAsset } from "@/lib/templates";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const form = await req.formData();
  const file = form.get("file");
  const slugRaw = String(form.get("slug") ?? "");
  const kind = String(form.get("kind") ?? "background") as
    | "background"
    | "foreground"
    | "thumbnail";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "tipo não suportado" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "arquivo muito grande" }, { status: 413 });
  }
  const slug = slugify(slugRaw);
  if (!slug) return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  if (!["background", "foreground", "thumbnail"].includes(kind))
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const isThumb = kind === "thumbnail";
  const processed = isThumb
    ? await sharp(buf).resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
    : await sharp(buf).png({ compressionLevel: 9 }).toBuffer();

  const filename = isThumb ? "thumbnail.jpg" : `${kind}.png`;
  const url = await writeTemplateAsset(slug, filename, processed);
  const meta = await sharp(processed).metadata();
  return NextResponse.json({ url, width: meta.width ?? 0, height: meta.height ?? 0 });
}
