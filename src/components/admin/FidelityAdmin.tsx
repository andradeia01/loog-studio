"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface RankingRow {
  id: string;
  full_name: string | null;
  email: string;
  photo_url: string | null;
  city: string | null;
  total_points: number;
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
  total_posts: number;
}

interface RecentCheckin {
  id: string;
  consultant_id: string;
  post_url: string;
  post_type: "feed" | "story" | "reel" | "carousel" | "outro";
  posted_at: string;
  points_awarded: number;
  streak_at_time: number;
  approved: boolean;
  invalidated_at: string | null;
  invalidated_reason: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string; photo_url: string | null } | null;
}

const POST_TYPE_LABEL: Record<RecentCheckin["post_type"], string> = {
  feed: "Feed",
  story: "Story",
  reel: "Reel",
  carousel: "Carrossel",
  outro: "Outro",
};

export function FidelityAdmin({
  initialRanking,
  initialRecent,
}: {
  initialRanking: RankingRow[];
  initialRecent: RecentCheckin[];
}) {
  const [ranking, setRanking] = useState(initialRanking);
  const [recent, setRecent] = useState(initialRecent);
  const [tab, setTab] = useState<"ranking" | "recent">("ranking");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return ranking;
    return ranking.filter((r) =>
      (r.full_name ?? "").toLowerCase().includes(term) ||
      r.email.toLowerCase().includes(term) ||
      (r.city ?? "").toLowerCase().includes(term),
    );
  }, [ranking, q]);

  const totals = useMemo(() => {
    const total = ranking.length;
    const active = ranking.filter((r) => r.current_streak > 0).length;
    const posts = ranking.reduce((s, r) => s + r.total_posts, 0);
    const points = ranking.reduce((s, r) => s + r.total_points, 0);
    return { total, active, posts, points };
  }, [ranking]);

  async function invalidate(id: string, currently: boolean) {
    const reason = currently ? null : (prompt("Motivo da invalidação (opcional):") ?? null);
    setBusyId(id);
    try {
      const r = await fetch(`/api/checkins/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalidated: !currently, reason }),
      });
      if (!r.ok) throw new Error(await r.text());
      // atualiza lista local
      setRecent((rs) =>
        rs.map((x) =>
          x.id === id
            ? {
                ...x,
                invalidated_at: !currently ? new Date().toISOString() : null,
                invalidated_reason: !currently ? reason : null,
                approved: currently,
              }
            : x,
        ),
      );
      // recarrega ranking (server recalcula stats)
      const rk = await fetch("/api/ranking").then((r) => r.json());
      if (rk.ranking) setRanking(rk.ranking as RankingRow[]);
    } catch (e) {
      console.error(e);
      alert("Falha ao atualizar check-in.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats gerais */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Consultores aprovados" value={totals.total} icon="👥" />
        <Stat label="Ativos (streak > 0)" value={totals.active} icon="🔥" />
        <Stat label="Posts totais" value={totals.posts} icon="📸" />
        <Stat label="Pontos distribuídos" value={totals.points} icon="⭐" />
      </div>

      {/* Abas */}
      <div className="inline-flex rounded-2xl border border-loog-border bg-loog-panel p-1">
        <button
          type="button"
          onClick={() => setTab("ranking")}
          className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition", tab === "ranking" ? "bg-loog-brand text-white" : "text-loog-muted hover:text-white")}
        >
          Ranking
        </button>
        <button
          type="button"
          onClick={() => setTab("recent")}
          className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition", tab === "recent" ? "bg-loog-brand text-white" : "text-loog-muted hover:text-white")}
        >
          Check-ins recentes
        </button>
      </div>

      {tab === "ranking" ? (
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-3">
            <input
              className="input flex-1"
              placeholder="Buscar por nome, email ou cidade…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="text-xs text-loog-muted">{filtered.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-loog-border/60 text-left text-[10px] uppercase tracking-wider text-loog-muted">
                  <th className="py-2">#</th>
                  <th className="py-2">Consultor</th>
                  <th className="py-2">Cidade</th>
                  <th className="py-2 text-right">Posts</th>
                  <th className="py-2 text-right">Streak</th>
                  <th className="py-2 text-right">Melhor</th>
                  <th className="py-2 text-right">Pontos</th>
                  <th className="py-2 text-right">Último post</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className="border-b border-loog-border/30">
                    <td className="py-2 text-loog-muted">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                    </td>
                    <td className="py-2">
                      <div className="font-semibold">{r.full_name || "—"}</div>
                      <div className="text-[11px] text-loog-muted">{r.email}</div>
                    </td>
                    <td className="py-2 text-loog-muted">{r.city ?? "—"}</td>
                    <td className="py-2 text-right">{r.total_posts}</td>
                    <td className="py-2 text-right">{r.current_streak}d</td>
                    <td className="py-2 text-right">{r.longest_streak}d</td>
                    <td className="py-2 text-right font-bold text-loog-brand2">{r.total_points}</td>
                    <td className="py-2 text-right text-[11px] text-loog-muted">
                      {r.last_checkin_date ? formatDate(r.last_checkin_date) : "—"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-loog-muted">
                      Nenhum consultor encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">
            Últimos 50 check-ins
          </h3>
          <ul className="space-y-2">
            {recent.map((c) => {
              const invalid = c.invalidated_at || !c.approved;
              return (
                <li
                  key={c.id}
                  className={cn(
                    "grid gap-2 rounded-lg border border-loog-border p-3 sm:grid-cols-[1fr_auto_auto]",
                    invalid && "opacity-50",
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{c.profiles?.full_name || c.profiles?.email || "Consultor"}</div>
                    <a href={c.post_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-loog-brand2 hover:underline">
                      {POST_TYPE_LABEL[c.post_type]}: {c.post_url}
                    </a>
                    <div className="text-[10px] text-loog-muted">
                      {formatDateTime(c.posted_at)} · {invalid ? "invalidado" : `+${c.points_awarded}pt (streak ${c.streak_at_time})`}
                      {c.invalidated_reason && ` · ${c.invalidated_reason}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => invalidate(c.id, !!invalid)}
                    disabled={busyId === c.id}
                    className={cn(
                      "self-center rounded-lg px-3 py-1.5 text-xs",
                      invalid
                        ? "border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                        : "border border-red-500/40 text-red-300 hover:bg-red-500/10",
                    )}
                  >
                    {invalid ? "Reativar" : "Invalidar"}
                  </button>
                </li>
              );
            })}
            {recent.length === 0 && (
              <li className="rounded-lg border border-dashed border-loog-border p-6 text-center text-xs text-loog-muted">
                Nenhum check-in registrado ainda.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-loog-muted">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
