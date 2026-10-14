"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface Checkin {
  id: string;
  post_url: string;
  post_type: "feed" | "story" | "reel" | "carousel" | "outro";
  caption: string | null;
  posted_at: string;
  points_awarded: number;
  streak_at_time: number;
  approved: boolean;
  invalidated_at: string | null;
  invalidated_reason: string | null;
  metadata: {
    provider?: string;
    shortcode?: string | null;
    embed_url?: string | null;
  } | null;
}
interface Stats {
  total_points: number;
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
}
interface Badge {
  kind:
    | "post_10" | "post_30" | "post_100"
    | "streak_7" | "streak_30" | "streak_100"
    | "top1_semana" | "top1_mes"
    | "semana_cheia" | "produtor_reel" | "convertor";
  awarded_at: string;
}
interface RankingRow {
  id: string;
  full_name: string | null;
  photo_url: string | null;
  city: string | null;
  pontos_semana?: number;
  posts_semana?: number;
  reels_semana?: number;
  pontos_mes?: number;
  posts_mes?: number;
  total_points?: number;
  current_streak?: number;
  longest_streak?: number;
}
interface Reward {
  id: string;
  titulo: string;
  descricao: string | null;
  scope: "semanal" | "mensal" | "anual" | "conquista";
  posicao_min: number | null;
  pontos_min: number | null;
  valor: string | null;
  ativo: boolean;
}

const POST_TYPE_LABEL: Record<Checkin["post_type"], string> = {
  feed: "Feed",
  story: "Story",
  reel: "Reel",
  carousel: "Carrossel",
  outro: "Outro",
};

/** Pontuação base por tipo — espelha o backend em /api/checkins */
const PONTOS_POR_TIPO: Record<Checkin["post_type"], number> = {
  reel: 15,
  carousel: 12,
  feed: 10,
  outro: 8,
  story: 5,
};

const BADGE_META: Record<Badge["kind"], { icon: string; label: string; descr: string }> = {
  post_10:        { icon: "📸", label: "10 posts",     descr: "Primeiros 10 check-ins aprovados" },
  post_30:        { icon: "📷", label: "30 posts",     descr: "Consistência: 30 posts totais" },
  post_100:        { icon: "🎞️", label: "100 posts",    descr: "Lenda — 100 posts aprovados" },
  streak_7:        { icon: "⚡", label: "7 dias",       descr: "Streak de 7 dias" },
  streak_30:       { icon: "🏆", label: "30 dias",      descr: "Streak de 30 dias" },
  streak_100:      { icon: "💎", label: "100 dias",     descr: "Streak de 100 dias — invicto" },
  top1_semana:     { icon: "🥇", label: "Top 1 semana", descr: "Foi #1 no ranking semanal" },
  top1_mes:        { icon: "👑", label: "Top 1 mês",    descr: "Foi #1 no ranking mensal" },
  semana_cheia:    { icon: "📅", label: "Semana cheia", descr: "7 posts em 7 dias seguidos" },
  produtor_reel:   { icon: "🎬", label: "Produtor Reel", descr: "20 reels publicados" },
  convertor:       { icon: "💰", label: "Convertor",    descr: "Posts que viraram vendas no CRM" },
};

type Scope = "semanal" | "mensal" | "all";

export function FidelityDashboard({ myId }: { myId: string | null }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [scope, setScope] = useState<Scope>("semanal");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ post_url: "", post_type: "reel" as Checkin["post_type"], caption: "" });
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showAllRanking, setShowAllRanking] = useState(false);

  useEffect(() => { load(); }, []);
  useEffect(() => { loadRanking(scope); }, [scope]);

  async function load() {
    setLoading(true);
    try {
      const [c, rw] = await Promise.all([
        fetch("/api/checkins", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/fidelity/rewards", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setCheckins(c.checkins ?? []);
      setStats(c.stats ?? null);
      setBadges(c.badges ?? []);
      setRewards(rw.rewards ?? []);
      await loadRanking(scope);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function loadRanking(s: Scope) {
    try {
      const r = await fetch(`/api/fidelity/ranking?scope=${s}`, { cache: "no-store" }).then((r) => r.json());
      setRanking(r.rows ?? []);
    } catch (e) { console.error(e); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.post_url.trim()) return;
    setSaving(true); setErr(null); setFlash(null);
    try {
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_url: form.post_url.trim(),
          post_type: form.post_type,
          caption: form.caption.trim() || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && j.error === "post_duplicado") {
          throw new Error(j.message || "Essa URL já foi registrada antes.");
        }
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setFlash(
        j.already_today
          ? `✓ Registrado! Você já pontuou hoje — este post conta como atividade extra.`
          : `+${j.points_awarded} pontos! Streak: ${j.stats?.current_streak} dia(s) 🔥`,
      );
      setForm({ post_url: "", post_type: "reel", caption: "" });
      await load();
      setTimeout(() => setFlash(null), 7000);
    } catch (e) { setErr(e instanceof Error ? e.message : "Falha ao registrar"); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este check-in? Os pontos serão recalculados.")) return;
    const r = await fetch(`/api/checkins/${id}`, { method: "DELETE" });
    if (r.ok) await load();
  }

  // ─── Meta semanal ─────────────────────────────────────────────────────────
  const META_SEMANAL_POSTS = 5;   // meta padrão: 5 posts/semana
  const META_SEMANAL_PONTOS = 60; // meta padrão: 60 pontos/semana
  const myWeek = ranking.find((r) => r.id === myId);
  const postsSemana = myWeek?.posts_semana ?? 0;
  const pontosSemana = myWeek?.pontos_semana ?? 0;

  const myRankIdx = useMemo(() => ranking.findIndex((r) => r.id === myId), [ranking, myId]);
  const heatmap = useMemo(() => buildHeatmap(checkins.filter((c) => c.approved && !c.invalidated_at)), [checkins]);

  const badgeKinds = new Set(badges.map((b) => b.kind));

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pontos totais" value={stats?.total_points ?? 0} icon="⭐" />
        <StatCard label="Streak atual" value={stats?.current_streak ?? 0} suffix={stats?.current_streak === 1 ? "dia" : "dias"} icon="🔥" />
        <StatCard label="Melhor streak" value={stats?.longest_streak ?? 0} suffix="dias" icon="🏆" />
        <StatCard
          label={scope === "semanal" ? "Rank semanal" : scope === "mensal" ? "Rank mês" : "Rank geral"}
          value={myRankIdx >= 0 ? `#${myRankIdx + 1}` : "—"}
          suffix={ranking.length ? `de ${ranking.length}` : ""}
          icon="🎯"
        />
      </div>

      {/* Meta semanal */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Meta semanal</h3>
          <span className="text-xs text-loog-muted">
            {postsSemana}/{META_SEMANAL_POSTS} posts · {pontosSemana}/{META_SEMANAL_PONTOS}pt
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <ProgressBar label="Posts da semana" current={postsSemana} target={META_SEMANAL_POSTS} />
          <ProgressBar label="Pontos da semana" current={pontosSemana} target={META_SEMANAL_PONTOS} />
        </div>
      </div>

      {/* Registrar novo check-in */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Registrar post do dia</h3>
        <p className="mt-1 text-xs text-loog-muted/80">
          Cole o link do post. Formatos pontuam diferente: <b>Reel 15pt · Carrossel 12pt · Feed 10pt · Outro 8pt · Story 5pt</b>. Bônus de streak somam em cima.
        </p>
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
          <input
            className="input"
            placeholder="https://instagram.com/p/..."
            value={form.post_url}
            onChange={(e) => setForm({ ...form, post_url: e.target.value })}
            required
            type="url"
          />
          <select
            className="input"
            value={form.post_type}
            onChange={(e) => setForm({ ...form, post_type: e.target.value as Checkin["post_type"] })}
          >
            {(Object.keys(POST_TYPE_LABEL) as Checkin["post_type"][]).map((k) => (
              <option key={k} value={k}>
                {POST_TYPE_LABEL[k]} ({PONTOS_POR_TIPO[k]}pt)
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary !py-3 !text-xs" disabled={saving}>
            {saving ? "Registrando…" : `Pontuar +${PONTOS_POR_TIPO[form.post_type]}pt ✓`}
          </button>
        </form>
        <input
          className="input mt-3"
          placeholder="Descrição rápida do post (opcional)"
          maxLength={200}
          value={form.caption}
          onChange={(e) => setForm({ ...form, caption: e.target.value })}
        />
        {err && <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
        {flash && <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{flash}</div>}
      </div>

      {/* Badges V2 */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Suas conquistas</h3>
          <span className="text-xs text-loog-muted">{badges.length}/{Object.keys(BADGE_META).length}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11">
          {(Object.keys(BADGE_META) as Badge["kind"][]).map((k) => {
            const meta = BADGE_META[k];
            const unlocked = badgeKinds.has(k);
            return (
              <div
                key={k}
                title={`${meta.label}: ${meta.descr}${unlocked ? " — ✓ desbloqueada" : " — bloqueada"}`}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-2 text-center",
                  unlocked
                    ? "border-loog-brand2 bg-loog-brand/10"
                    : "border-loog-border bg-loog-panel/40 opacity-40 grayscale",
                )}
              >
                <span className="text-2xl">{meta.icon}</span>
                <span className="text-[10px] font-semibold uppercase tracking-tight text-loog-muted">
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recompensas */}
      {rewards.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">🎁 Recompensas em jogo</h3>
          <p className="mt-1 text-xs text-loog-muted/80">O que você pode ganhar essa semana / esse mês / esse ano.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {rewards.map((r) => (
              <div key={r.id} className="rounded-lg border border-loog-border bg-loog-panel/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-loog-brand/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-loog-brand2">
                    {r.scope}
                  </span>
                  {r.valor && <span className="text-xs font-bold text-emerald-300">{r.valor}</span>}
                </div>
                <h4 className="mt-2 text-sm font-semibold">{r.titulo}</h4>
                {r.descricao && <p className="mt-1 text-xs text-loog-muted">{r.descricao}</p>}
                <div className="mt-2 flex gap-3 text-[10px] text-loog-muted/80">
                  {r.posicao_min != null && <span>Top {r.posicao_min}</span>}
                  {r.pontos_min != null && <span>{r.pontos_min}+ pontos</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap 30 dias */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Últimos 30 dias</h3>
        <p className="mt-1 text-xs text-loog-muted/80">Cada quadradinho é um dia. Verde = você postou; cinza = faltou.</p>
        <div className="mt-4 grid gap-1" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
          {heatmap.map((cell) => (
            <div
              key={cell.date}
              title={`${cell.date}: ${cell.count} post(s)`}
              className={cn(
                "aspect-square rounded",
                cell.count === 0
                  ? "bg-white/5"
                  : cell.count === 1
                    ? "bg-loog-brand/60"
                    : cell.count === 2
                      ? "bg-loog-brand"
                      : "bg-loog-brand2",
              )}
            />
          ))}
        </div>
      </div>

      {/* Ranking (abas) + Histórico em duas colunas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Ranking 🏅</h3>
            <button type="button" onClick={() => setShowAllRanking((v) => !v)} className="text-xs text-loog-muted hover:text-white">
              {showAllRanking ? "esconder" : "ver top 50"}
            </button>
          </div>
          <div className="mt-3 flex gap-1 border-b border-loog-border/40">
            {(["semanal", "mensal", "all"] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn(
                  "border-b-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition",
                  scope === s ? "border-loog-brand2 text-white" : "border-transparent text-loog-muted hover:text-white",
                )}
              >
                {s === "semanal" ? "Semana" : s === "mensal" ? "Mês" : "Geral"}
              </button>
            ))}
          </div>
          <ol className="mt-3 space-y-2">
            {(showAllRanking ? ranking : ranking.slice(0, 10)).map((r, i) => {
              const isMe = r.id === myId;
              const pontos = scope === "semanal" ? r.pontos_semana ?? 0 : scope === "mensal" ? r.pontos_mes ?? 0 : r.total_points ?? 0;
              const sub = scope === "semanal"
                ? `${r.posts_semana ?? 0} posts · ${r.reels_semana ?? 0} reels`
                : scope === "mensal"
                  ? `${r.posts_mes ?? 0} posts no mês`
                  : `streak ${r.current_streak ?? 0}d · recorde ${r.longest_streak ?? 0}d`;
              return (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2",
                    isMe ? "border-loog-brand2 bg-loog-brand/10" : "border-loog-border",
                  )}
                >
                  <span className="w-8 text-center font-bold text-loog-muted">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.full_name || "Consultor"}{isMe && " (você)"}</div>
                    <div className="text-xs text-loog-muted">{sub}</div>
                  </div>
                  <span className="text-sm font-bold text-loog-brand2">{pontos}pt</span>
                </li>
              );
            })}
            {ranking.length === 0 && !loading && (
              <li className="rounded-lg border border-dashed border-loog-border p-4 text-center text-xs text-loog-muted">
                Sem dados nessa aba ainda.
              </li>
            )}
          </ol>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Seus últimos posts</h3>
          <ul className="mt-3 space-y-2">
            {checkins.slice(0, 12).map((c) => {
              const invalid = c.invalidated_at || !c.approved;
              const embed = c.metadata?.embed_url;
              return (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-loog-border p-2",
                    invalid && "opacity-50",
                  )}
                >
                  {embed ? (
                    // thumbnail inline do Instagram (iframe discreto)
                    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded border border-loog-border">
                      <iframe
                        src={embed}
                        className="pointer-events-none h-32 w-32 origin-top-left scale-[0.375]"
                        title={c.post_url}
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-loog-panel/50 text-lg">
                      {c.post_type === "reel" ? "🎬" : c.post_type === "carousel" ? "🎠" : c.post_type === "story" ? "📖" : "📸"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-loog-panel/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-loog-muted">
                        {POST_TYPE_LABEL[c.post_type]}
                      </span>
                      <span className="text-[10px] text-loog-muted">
                        {new Date(c.posted_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <a href={c.post_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-loog-brand2 hover:underline">
                      {c.post_url}
                    </a>
                    {invalid && c.invalidated_reason && (
                      <div className="text-[10px] text-red-300/80">⚠ {c.invalidated_reason}</div>
                    )}
                  </div>
                  <span className="text-xs font-bold">
                    {invalid ? "—" : `+${c.points_awarded}pt`}
                  </span>
                  <button type="button" onClick={() => remove(c.id)} className="text-xs text-red-400 hover:text-red-300" title="Excluir">
                    ×
                  </button>
                </li>
              );
            })}
            {checkins.length === 0 && !loading && (
              <li className="rounded-lg border border-dashed border-loog-border p-4 text-center text-xs text-loog-muted">
                Nenhum check-in ainda. Cole seu primeiro post aí em cima!
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix, icon }: { label: string; value: number | string; suffix?: string; icon: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-loog-muted">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{value}</span>
        {suffix && <span className="text-xs text-loog-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function ProgressBar({ label, current, target }: { label: string; current: number; target: number }) {
  const pct = Math.min(100, Math.round((current / Math.max(1, target)) * 100));
  const atGoal = current >= target;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-loog-muted">{label}</span>
        <span className={cn("font-semibold", atGoal ? "text-emerald-300" : "text-white")}>
          {current}/{target} {atGoal && "✓"}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className={cn("h-full rounded-full transition-all", atGoal ? "bg-emerald-400" : "bg-loog-brand2")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function buildHeatmap(checkins: Checkin[]): { date: string; count: number }[] {
  const cells: { date: string; count: number }[] = [];
  const byDate: Record<string, number> = {};
  for (const c of checkins) {
    const d = new Date(c.posted_at);
    const key = d.toISOString().slice(0, 10);
    byDate[key] = (byDate[key] ?? 0) + 1;
  }
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, count: byDate[key] ?? 0 });
  }
  return cells;
}
