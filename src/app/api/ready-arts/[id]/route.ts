import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  title: z.string().trim().min(2).max(80).optional(),
  category: z.enum(["institucional", "vendas", "protecao", "recrutamento", "stories", "feed"]).optional(),
  format: z.enum(["feed-1x1", "feed-4x5", "story-9x16"]).optional(),
  active: z.boolean().optional(),
  folder_id: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requisição inválida" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("ready_arts")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ readyArt: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const supabase = await createSupabaseServer();

  // pega URL pra descobrir os paths e limpar Storage
  const { data: row } = await supabase
    .from("ready_arts")
    .select("image_url, thumbnail_url")
    .eq("id", id)
    .maybeSingle();

  if (row) {
    const paths = [row.image_url, row.thumbnail_url]
      .filter(Boolean)
      .map((u) => extractBucketPath(u as string, "ready-arts"))
      .filter((p): p is string => Boolean(p));
    if (paths.length > 0) await supabase.storage.from("ready-arts").remove(paths);
  }

  const { error } = await supabase.from("ready_arts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function extractBucketPath(publicUrl: string, bucket: string): string | null {
  const m = publicUrl.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`));
  return m ? decodeURIComponent(m[1]!) : null;
}
