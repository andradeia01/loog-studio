import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/inspections — ADMIN ONLY
 * Lista todas as vistorias de todos os consultores, com dados do operador e
 * resultado resumido da IA. Suporta filtros ?status=APPROVED e ?days=30.
 */
export async function GET(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, error: "supabase_disabled" }, { status: 503 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const days = Number(sp.get("days") ?? "0");
  const limit = Math.min(Number(sp.get("limit") ?? "100"), 500);

  const supabase = await createSupabaseServer();
  let q = supabase
    .from("inspections")
    .select(`
      id, owner_id, placa, marca, modelo, ano, cor, fipe_valor,
      nome_associado, telefone_associado, tipo_vistoria, mode, status,
      ai_approved, ai_reason, ai_processed_at, ai_result,
      gps_lat, gps_lng, created_at, updated_at, completed_at,
      profiles!inspections_owner_id_fkey(full_name, email)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);
  if (days > 0) {
    const after = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    q = q.gte("created_at", after);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Totais pra o header do admin
  const totais = {
    total: data?.length ?? 0,
    aprovadas: data?.filter((r) => r.status === "APPROVED").length ?? 0,
    rejeitadas: data?.filter((r) => r.status === "REJECTED").length ?? 0,
    revisao: data?.filter((r) => r.status === "NEEDS_REVIEW").length ?? 0,
    processando: data?.filter((r) => r.status === "PROCESSING").length ?? 0,
  };

  return NextResponse.json({ ok: true, data, totais });
}
