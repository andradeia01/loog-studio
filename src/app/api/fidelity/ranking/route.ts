import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = ["semanal", "mensal", "all"] as const;
type Scope = (typeof SCOPES)[number];

/**
 * GET /api/fidelity/ranking?scope=semanal|mensal|all
 * - semanal: view v_ranking_semanal (segunda → agora, SP timezone)
 * - mensal: view v_ranking_mensal (dia 1 → agora)
 * - all: ranking histórico (profiles.total_points)
 */
export async function GET(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const scopeRaw = (url.searchParams.get("scope") ?? "semanal") as Scope;
  const scope: Scope = SCOPES.includes(scopeRaw) ? scopeRaw : "semanal";

  const supabase = await createSupabaseServer();

  if (scope === "semanal") {
    const { data, error } = await supabase.from("v_ranking_semanal").select("*").limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ scope, rows: data ?? [] });
  }

  if (scope === "mensal") {
    const { data, error } = await supabase.from("v_ranking_mensal").select("*").limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ scope, rows: data ?? [] });
  }

  // all — histórico via profiles direto
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, photo_url, city, total_points, current_streak, longest_streak")
    .in("role", ["consultant", "consultant_sdr"])
    .eq("status", "approved")
    .order("total_points", { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scope: "all", rows: data ?? [] });
}
