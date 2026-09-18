import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/consultants?status=pending|approved|rejected|all
 * Lista consultores para o admin.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "all";
  const supabase = await createSupabaseServer();

  let q = supabase
    .from("profiles")
    .select("id, email, full_name, phone, instagram, city, photo_url, role, status, created_at, approved_at, rejected_reason")
    .order("created_at", { ascending: false });

  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ consultants: data ?? [] });
}
