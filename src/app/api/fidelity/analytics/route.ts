import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fidelity/analytics (admin)
 * Retorna correlação posts × leads × vendas (30 dias) + totais globais +
 * check-ins suspeitos (muitos posts no mesmo minuto, URL com padrão estranho).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();

  // 1) Correlação posts × vendas (view v_fidelity_vendas)
  const correlPromise = supabase
    .from("v_fidelity_vendas")
    .select("*")
    .order("fechamentos_30d", { ascending: false });

  // 2) Totais globais
  const nowIso = new Date().toISOString();
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const totalPostsPromise = supabase
    .from("checkins")
    .select("id, post_type, approved, invalidated_at", { count: "exact", head: false })
    .gte("posted_at", thirtyAgo)
    .is("invalidated_at", null);

  // 3) Suspeitos: mais de 3 check-ins no mesmo minuto (= automação) OU URL repetida que já foi invalidada
  const suspeitosPromise = supabase
    .from("checkins")
    .select("id, consultant_id, post_url, post_type, posted_at, invalidated_reason, invalidated_at")
    .not("invalidated_at", "is", null)
    .gte("posted_at", thirtyAgo)
    .order("posted_at", { ascending: false })
    .limit(50);

  // 4) Badges concedidos no período (contagem por tipo)
  const badgesPromise = supabase
    .from("fidelity_badges")
    .select("kind, awarded_at");

  const [correl, totalPosts, suspeitos, badges] = await Promise.all([
    correlPromise,
    totalPostsPromise,
    suspeitosPromise,
    badgesPromise,
  ]);

  if (correl.error) return NextResponse.json({ error: correl.error.message }, { status: 500 });

  // Agregações no servidor
  const postsPorTipo: Record<string, number> = {};
  for (const row of totalPosts.data ?? []) {
    if (!row.approved) continue;
    postsPorTipo[row.post_type] = (postsPorTipo[row.post_type] ?? 0) + 1;
  }

  const badgesPorTipo: Record<string, number> = {};
  for (const b of badges.data ?? []) {
    badgesPorTipo[b.kind] = (badgesPorTipo[b.kind] ?? 0) + 1;
  }

  return NextResponse.json({
    correlacao: correl.data ?? [],
    posts_30d_por_tipo: postsPorTipo,
    badges_por_tipo: badgesPorTipo,
    suspeitos: suspeitos.data ?? [],
    gerado_em: nowIso,
  });
}
