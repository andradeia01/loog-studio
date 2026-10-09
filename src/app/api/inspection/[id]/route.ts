import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/inspection/[id] — retorna a vistoria + captures. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "supabase admin indisponível" }, { status: 500 });

  const { id } = await ctx.params;
  const { data: insp, error } = await admin.from("inspections").select("*").eq("id", id).single();
  if (error || !insp) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  if (insp.owner_id !== auth.auth.userId && auth.auth.role !== "admin" && auth.auth.role !== "consultant_sdr") {
    return NextResponse.json({ error: "não autorizado" }, { status: 403 });
  }
  const { data: caps } = await admin.from("inspection_captures").select("*").eq("inspection_id", id).order("created_at");
  return NextResponse.json({ inspection: insp, captures: caps ?? [] });
}
