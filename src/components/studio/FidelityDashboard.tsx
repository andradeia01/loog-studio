"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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
}
interface Stats {
  total_points: number;
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
}
interface RankingRow {
  id: string;
  full_name: string | null;
  photo_url: string | null;
  city: string | null;
  total_points: number;
  current_streak: number;
  total_posts: number;
}

const POST_TYPE_LABEL: Record<Checkin["post_type"], string> = {
  feed: "Feed",
  story: "Story",
  reel: "Reel",
  carousel: "Carrossel",
  outro: "Outro",
};

const BADGES: { min: number; label: string; icon: string }[] = [
  { min: 3, label: "3 dias", icon: "🔥" },
  { min: 7, label: "1 semana", icon: "⚡" },
  { min: 14, label: "2 semanas", icon: "💪" },
  { min: 30, label: "1 mês", icon: "🏆" },
  { min: 60, label: "2 meses", icon: "🌟" },
  { min: 100, label: "100 dias", icon: "💎" },
];

export function FidelityDashboard({ myId }: { myId: string | null }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ post_url: "", post_type: "feed" as Checkin["post_type"], caption: "" });
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showRanking, setShowRanking] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([
        fetch("/api/checkins", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/ranking", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setCheckins(c.checkins ?? []);
      setStats(c.stats ?? null);
      setRanking(r.ranking ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.post_url.trim()) return;
    setSaving(true);
    setErr(null);
    setFlash(null);
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
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setFlash(
        j.already_today
          ? `Registrado! Você já pontuou hoje. Este post conta como atividade extra.`
          : `+${j.points_awarded} pontos! Streak: ${j.stats?.current_streak} dia(s) 🔥`,
      );
      setForm({ post_url: "", post_type: "feed", caption: "" });
      await load();
      setTimeout(() => setFlash(null), 6000);
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "Falha ao registrar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este check-in? Os pontos serão recalculados.")) return;
    const r = await fetch(`/api/checkins/${id}`, { method: "DELETE" });
    if (r.ok) await load();
  }

  const badgesUnlocked = BADGES.filter((b) => (stats?.longest_streak ?? 0) >= b.min);
  const nextBadge = BADGES.find((b) => (stats?.longest_streak ?? 0) < b.min);
  const myRank = ranking.findIndex((r) => r.id === myId);
  const heatmap = buildHeatmap(checkins.filter((c) => c.approved && !c.invalidated_at));

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pontos totais" value={stats?.total_points ?? 0} icon="⭐" />
        <StatCard label="Streak atual" value={stats?.current_streak ?? 0} suffix={stats?.current_streak === 1 ? "dia" : "dias"} icon="🔥" />
        <StatCard label="Melhor streak" value={stats?.longest_streak ?? 0} suffix="dias" icon="🏆" />
        <StatCard
          label="Meu ranking"
          value={myRank >= 0 ? `#${myRank + 1}` : "—"}
          suffix={ranking.length ? `de ${ranking.length}` : ""}
          icon="🎯"
        />
      </div>

      {/* Registrar novo check-in */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Registrar post do dia</h3>
        <p className="mt-1 text-xs text-loog-muted/80">
          Colou o post lá no Instagram? Cola o link aqui pra pontuar. Cada post vale <b>10 pontos</b>, com bônus por sequência.
        </p>
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto]">
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
              <option key={k} value={k}>{POST_TYPE_LABEL[k]}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary !py-3 !text-xs" disabled={saving}>
            {saving ? "Registrando…" : "Pontuar ✓"}
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

      {/* Badges */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Suas conquistas</h3>
          {nextBadge && (
            <span className="text-xs text-loog-muted">
              Próxima: {nextBadge.icon} {nextBadge.label} ({(stats?.longest_streak ?? 0)}/{nextBadge.min})
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {BADGES.map((b) => {
            const unlocked = badgesUnlocked.includes(b);
            return (
              <div
                key={b.min}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                  unlocked
                    ? "border-loog-brand2 bg-loog-brand/10 text-white"
                    : "border-loog-border bg-loog-panel/40 text-loog-muted/60 opacity-50",
                )}
              >
                <span className="text-base">{b.icon}</span>
                <span>{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Heatmap 30 dias */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Últimos 30 dias</h3>
        <p className="mt-1 text-xs text-loog-muted/80">Cada quadradinho é um dia. Verde = você postou; cinza = faltou.</p>
        <div className="mt-4 grid grid-cols-15 gap-1 sm:grid-cols-30" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
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

      {/* Ranking + Histórico em duas colunas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Ranking geral 🏅</h3>
            <button type="button" onClick={() => setShowRanking((v) => !v)} className="text-xs text-loog-muted hover:text-white">
              {showRanking ? "esconder" : "ver top 50"}
            </button>
          </div>
          <ol className="mt-3 space-y-2">
            {(showRanking ? ranking : ranking.slice(0, 10)).map((r, i) => {
              const isMe = r.id === myId;
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
                    <div className="text-xs text-loog-muted">{r.total_posts} posts · streak {r.current_streak}d</div>
                  </div>
                  <span className="text-sm font-bold text-loog-brand2">{r.total_points}pt</span>
                </li>
              );
            })}
            {ranking.length === 0 && !loading && (
              <li className="rounded-lg border border-dashed border-loog-border p-4 text-center text-xs text-loog-muted">
                Sem consultores no ranking ainda. Seja o primeiro!
              </li>
            )}
          </ol>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Seus últimos posts</h3>
          <ul className="mt-3 space-y-2">
            {checkins.slice(0, 10).map((c) => {
              const invalid = c.invalidated_at || !c.approved;
              return (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-loog-border px-3 py-2",
                    invalid && "opacity-50",
                  )}
                >
                  <span className="text-xs opacity-70">{POST_TYPE_LABEL[c.post_type]}</span>
                  <a href={c.post_url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-loog-brand2 hover:underline">
                    {c.post_url}
                  </a>
                  <span className="text-xs font-bold">
                    {invalid ? "—" : `+${c.points_awarded}pt`}
                  </span>
                  <button type="button" onClick={() => remove(c.id)} className="text-xs text-red-400 hover:text-red-300">
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
