import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ranking — top 50 consultores por pontos totais. */
export async function GET() {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("consultant_ranking")
    .select("id, full_name, photo_url, city, total_points, current_streak, longest_streak, last_checkin_date, total_posts")
    .order("total_points", { ascending: false })
    .order("current_streak", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ranking: data ?? [] });
}
