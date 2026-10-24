import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/inspections/[id]/captures — ADMIN ONLY
 * Lista todos os captures de uma vistoria + gera signed URLs (válidas 1h)
 * pra admin ver o vídeo, selfie, fotos de odômetro/chassi/motor direto do browser.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, error: "supabase_disabled" }, { status: 503 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "service_role_ausente" }, { status: 503 });

  const { id } = await ctx.params;

  const { data: captures, error } = await admin
    .from("inspection_captures")
    .select("id, kind, storage_path, mime_type, size_bytes, metadata, created_at")
    .eq("inspection_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Pra cada capture, gera uma signed URL (válida 1h) pro bucket 'inspection-media'
  // (bucket real criado na migration-006; antes estava com nome errado 'inspections')
  const withUrls = await Promise.all(
    (captures ?? []).map(async (c) => {
      const { data: urlData } = await admin.storage
        .from("inspection-media")
        .createSignedUrl(c.storage_path, 60 * 60);
      return { ...c, signed_url: urlData?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ ok: true, data: withUrls });
}
