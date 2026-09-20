import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POST_TYPES = ["feed", "story", "reel", "carousel", "outro"] as const;

const CreateSchema = z.object({
  post_url: z.string().url("URL inválida"),
  post_type: z.enum(POST_TYPES).default("feed"),
  caption: z.string().max(500).optional().nullable(),
  posted_at: z.string().datetime({ offset: true }).optional(),
});

/**
 * POST /api/checkins — consultor aprovado marca um post.
 * Regras de pontuação:
 *   - 10 pontos por post
 *   - +5 se streak ≥ 3
 *   - +10 se streak ≥ 7
 *   - +25 se streak ≥ 30
 *   - Máximo 1 checkin com pontos por dia (extras contam post mas 0 pontos extras)
 */
export async function POST(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServer();

  // busca profile pra calcular pontos
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, current_streak, last_checkin_date, total_points")
    .eq("id", auth.auth.userId)
    .maybeSingle();
  if (pErr || !profile) {
    return NextResponse.json({ error: "profile não encontrado" }, { status: 404 });
  }

  const now = new Date();
  const postedAt = parsed.data.posted_at ? new Date(parsed.data.posted_at) : now;

  // hoje em SP timezone (aproximação: usa offset -3)
  const todaySP = formatDateSP(postedAt);
  const alreadyToday = profile.last_checkin_date === todaySP;

  // streak que teremos após esse checkin
  let projectedStreak = profile.current_streak ?? 0;
  if (!alreadyToday) {
    const yesterday = new Date(postedAt);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdaySP = formatDateSP(yesterday);
    if (profile.last_checkin_date === yesterdaySP) {
      projectedStreak += 1;
    } else if (!profile.last_checkin_date || profile.last_checkin_date < yesterdaySP) {
      projectedStreak = 1;
    } else {
      projectedStreak = 1;
    }
  }

  let points = 10;
  if (alreadyToday) {
    points = 0; // já contou hoje — vale como atividade, mas não pontua extra
  } else {
    if (projectedStreak >= 30) points += 25;
    else if (projectedStreak >= 7) points += 10;
    else if (projectedStreak >= 3) points += 5;
  }

  const { data, error } = await supabase
    .from("checkins")
    .insert({
      consultant_id: auth.auth.userId,
      post_url: parsed.data.post_url,
      post_type: parsed.data.post_type,
      caption: parsed.data.caption ?? null,
      posted_at: postedAt.toISOString(),
      points_awarded: points,
      streak_at_time: projectedStreak,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // pega stats atualizados (trigger já rodou)
  const { data: after } = await supabase
    .from("profiles")
    .select("total_points, current_streak, longest_streak, last_checkin_date")
    .eq("id", auth.auth.userId)
    .maybeSingle();

  return NextResponse.json(
    {
      checkin: data,
      points_awarded: points,
      already_today: alreadyToday,
      stats: after,
    },
    { status: 201 },
  );
}

/** GET — lista checkins do próprio consultor (últimos 90 dias). */
export async function GET() {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();
  const ninetyAgo = new Date();
  ninetyAgo.setDate(ninetyAgo.getDate() - 90);

  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase
      .from("checkins")
      .select("id, post_url, post_type, caption, posted_at, points_awarded, streak_at_time, approved, invalidated_at, invalidated_reason, created_at")
      .eq("consultant_id", auth.auth.userId)
      .gte("posted_at", ninetyAgo.toISOString())
      .order("posted_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("total_points, current_streak, longest_streak, last_checkin_date")
      .eq("id", auth.auth.userId)
      .maybeSingle(),
  ]);

  return NextResponse.json({ checkins: rows ?? [], stats: profile ?? null });
}

function formatDateSP(d: Date): string {
  // 'YYYY-MM-DD' em America/Sao_Paulo
  const utcMs = d.getTime();
  const spOffset = -3 * 60; // -180 min
  // Aproximação: SP é UTC-3 sem DST em 2024+. Se voltar horário de verão, ajustar.
  const local = new Date(utcMs + (spOffset + d.getTimezoneOffset()) * 60_000);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
