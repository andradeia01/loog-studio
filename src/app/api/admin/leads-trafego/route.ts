import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/leads-trafego
 * Agrega leads por fonte de tráfego (UTM source/medium/campaign).
 *
 * Query params:
 *   ?days=30 → filtra últimos N dias (default: tudo)
 *   ?group=source → agrupa só por source (default: source+medium+campaign)
 */
export async function GET(req: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, error: "supabase_disabled" }, { status: 503 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "0");
  const supabase = await createSupabaseServer();

  let q = supabase
    .from("crm_contacts")
    .select("utm_source, utm_medium, utm_campaign, status_ciclo, temperatura, created_at, fbclid, gclid")
    .limit(10000);
  if (days > 0) {
    const after = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    q = q.gte("created_at", after);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  type Row = {
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
    status_ciclo: string; temperatura: string; created_at: string;
    fbclid: string | null; gclid: string | null;
  };
  const rows = (data ?? []) as Row[];
  const buckets = new Map<string, { source: string; medium: string; campaign: string; total: number; fechados: number; perdidos: number; ativos: number; quentes: number; }>();

  rows.forEach((r) => {
    const source = r.utm_source || (r.fbclid ? "facebook" : r.gclid ? "google" : "direto");
    const medium = r.utm_medium || (r.fbclid || r.gclid ? "cpc" : "—");
    const campaign = r.utm_campaign || "—";
    const key = `${source}|${medium}|${campaign}`;
    const b = buckets.get(key) ?? { source, medium, campaign, total: 0, fechados: 0, perdidos: 0, ativos: 0, quentes: 0 };
    b.total += 1;
    if (r.status_ciclo === "cliente") b.fechados += 1;
    else if (r.status_ciclo === "perdido") b.perdidos += 1;
    else b.ativos += 1;
    if (r.temperatura === "quente") b.quentes += 1;
    buckets.set(key, b);
  });

  const breakdown = Array.from(buckets.values())
    .map((b) => ({
      ...b,
      taxa_conversao: b.total > 0 ? Math.round(10000 * b.fechados / b.total) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const totais = {
    leads: rows.length,
    fechados: rows.filter((r) => r.status_ciclo === "cliente").length,
    perdidos: rows.filter((r) => r.status_ciclo === "perdido").length,
    ativos: rows.filter((r) => r.status_ciclo === "ativo").length,
    quentes: rows.filter((r) => r.temperatura === "quente").length,
    por_facebook: rows.filter((r) => !!r.fbclid || r.utm_source?.toLowerCase().includes("facebook") || r.utm_source?.toLowerCase().includes("meta") || r.utm_source?.toLowerCase().includes("instagram")).length,
    por_google: rows.filter((r) => !!r.gclid || r.utm_source?.toLowerCase().includes("google")).length,
    direto_organico: rows.filter((r) => !r.utm_source && !r.fbclid && !r.gclid).length,
  };

  return NextResponse.json({
    ok: true,
    totais,
    breakdown,
    periodo_dias: days > 0 ? days : "todos",
    gerado_em: new Date().toISOString(),
  });
}
