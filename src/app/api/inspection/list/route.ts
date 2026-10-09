import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/inspection/list
 * Retorna as vistorias do consultor logado (todas se admin/consultant_sdr).
 */
export async function GET(req: Request) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "supabase admin indisponível" }, { status: 500 });

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "mine"; // mine | all
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  let q = admin
    .from("inspections")
    .select("id, placa, marca, modelo, nome_associado, mode, status, ai_approved, ai_reason, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (scope === "mine" || (auth.auth.role !== "admin" && auth.auth.role !== "consultant_sdr")) {
    q = q.eq("owner_id", auth.auth.userId);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inspections: data ?? [] });
}
