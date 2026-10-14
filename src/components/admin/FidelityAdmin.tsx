"use client";

import { useEffect, useMemo, useState } from "react";
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

interface Analytics {
  correlacao: {
    id: string;
    full_name: string | null;
    email: string;
    posts_30d: number;
    leads_30d: number;
    fechamentos_30d: number;
  }[];
  posts_30d_por_tipo: Record<string, number>;
  badges_por_tipo: Record<string, number>;
  suspeitos: {
    id: string;
    consultant_id: string;
    post_url: string;
    post_type: string;
    posted_at: string;
    invalidated_reason: string | null;
    invalidated_at: string | null;
  }[];
  gerado_em: string;
}

const POST_TYPE_LABEL: Record<RecentCheckin["post_type"], string> = {
  feed: "Feed",
  story: "Story",
  reel: "Reel",
  carousel: "Carrossel",
  outro: "Outro",
};

const SCOPES = ["semanal", "mensal", "anual", "conquista"] as const;

type Tab = "ranking" | "recent" | "analytics" | "rewards";

export function FidelityAdmin({
  initialRanking,
  initialRecent,
}: {
  initialRanking: RankingRow[];
  initialRecent: RecentCheckin[];
}) {
  const [ranking, setRanking] = useState(initialRanking);
  const [recent, setRecent] = useState(initialRecent);
  const [tab, setTab] = useState<Tab>("ranking");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);

  useEffect(() => {
    if (tab === "analytics" && !analytics) loadAnalytics();
    if (tab === "rewards" && rewards.length === 0) loadRewards();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAnalytics() {
    try {
      const r = await fetch("/api/fidelity/analytics", { cache: "no-store" }).then((r) => r.json());
      setAnalytics(r as Analytics);
    } catch (e) { console.error(e); }
  }

  async function loadRewards() {
    try {
      const r = await fetch("/api/fidelity/rewards?all=1", { cache: "no-store" }).then((r) => r.json());
      setRewards((r.rewards ?? []) as Reward[]);
    } catch (e) { console.error(e); }
  }

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
      setRecent((rs) =>
        rs.map((x) =>
          x.id === id
            ? { ...x, invalidated_at: !currently ? new Date().toISOString() : null, invalidated_reason: !currently ? reason : null, approved: currently }
            : x,
        ),
      );
      const rk = await fetch("/api/ranking").then((r) => r.json());
      if (rk.ranking) setRanking(rk.ranking as RankingRow[]);
    } catch (e) { console.error(e); alert("Falha ao atualizar check-in."); }
    finally { setBusyId(null); }
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
      <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-loog-border bg-loog-panel p-1">
        {(["ranking", "recent", "analytics", "rewards"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === t ? "bg-loog-brand text-white" : "text-loog-muted hover:text-white",
            )}
          >
            {t === "ranking" ? "Ranking" : t === "recent" ? "Check-ins" : t === "analytics" ? "📊 Analytics" : "🎁 Recompensas"}
          </button>
        ))}
      </div>

      {tab === "ranking" && (
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-3">
            <input className="input flex-1" placeholder="Buscar por nome, email ou cidade…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="text-xs text-loog-muted">{filtered.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-loog-border/60 text-left text-[10px] uppercase tracking-wider text-loog-muted">
                  <th className="py-2">#</th><th className="py-2">Consultor</th><th className="py-2">Cidade</th>
                  <th className="py-2 text-right">Posts</th><th className="py-2 text-right">Streak</th>
                  <th className="py-2 text-right">Melhor</th><th className="py-2 text-right">Pontos</th>
                  <th className="py-2 text-right">Último post</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className="border-b border-loog-border/30">
                    <td className="py-2 text-loog-muted">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</td>
                    <td className="py-2"><div className="font-semibold">{r.full_name || "—"}</div><div className="text-[11px] text-loog-muted">{r.email}</div></td>
                    <td className="py-2 text-loog-muted">{r.city ?? "—"}</td>
                    <td className="py-2 text-right">{r.total_posts}</td>
                    <td className="py-2 text-right">{r.current_streak}d</td>
                    <td className="py-2 text-right">{r.longest_streak}d</td>
                    <td className="py-2 text-right font-bold text-loog-brand2">{r.total_points}</td>
                    <td className="py-2 text-right text-[11px] text-loog-muted">{r.last_checkin_date ? formatDate(r.last_checkin_date) : "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-loog-muted">Nenhum consultor encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "recent" && (
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">Últimos 50 check-ins</h3>
          <ul className="space-y-2">
            {recent.map((c) => {
              const invalid = c.invalidated_at || !c.approved;
              return (
                <li key={c.id} className={cn("grid gap-2 rounded-lg border border-loog-border p-3 sm:grid-cols-[1fr_auto_auto]", invalid && "opacity-50")}>
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
                  <button type="button" onClick={() => invalidate(c.id, !!invalid)} disabled={busyId === c.id}
                    className={cn("self-center rounded-lg px-3 py-1.5 text-xs",
                      invalid ? "border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" : "border border-red-500/40 text-red-300 hover:bg-red-500/10")}>
                    {invalid ? "Reativar" : "Invalidar"}
                  </button>
                </li>
              );
            })}
            {recent.length === 0 && <li className="rounded-lg border border-dashed border-loog-border p-6 text-center text-xs text-loog-muted">Nenhum check-in registrado ainda.</li>}
          </ul>
        </div>
      )}

      {tab === "analytics" && <AnalyticsPane data={analytics} onReload={loadAnalytics} />}
      {tab === "rewards" && <RewardsPane rewards={rewards} onChange={loadRewards} />}
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsPane({ data, onReload }: { data: Analytics | null; onReload: () => void }) {
  if (!data) return <div className="card p-5 text-center text-xs text-loog-muted">Carregando analytics…</div>;

  const tiposLabel: Record<string, string> = {
    reel: "Reels", carousel: "Carrosséis", feed: "Feed", story: "Stories", outro: "Outros",
  };

  // Rankeia correlação por fechamentos
  const topConversores = [...data.correlacao]
    .filter((r) => r.posts_30d > 0 || r.fechamentos_30d > 0)
    .sort((a, b) => b.fechamentos_30d - a.fechamentos_30d);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">
          📊 Analytics (últimos 30 dias) — gerado {formatDateTime(data.gerado_em)}
        </h3>
        <button type="button" onClick={onReload} className="text-xs text-loog-muted hover:text-white">↻ atualizar</button>
      </div>

      {/* Distribuição de tipos */}
      <div className="card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-loog-muted">Posts por tipo (30d)</h4>
        <div className="space-y-2">
          {Object.entries(data.posts_30d_por_tipo).map(([tipo, n]) => {
            const total = Object.values(data.posts_30d_por_tipo).reduce((a, b) => a + b, 0) || 1;
            const pct = Math.round((n / total) * 100);
            return (
              <div key={tipo}>
                <div className="flex items-center justify-between text-xs">
                  <span>{tiposLabel[tipo] ?? tipo}</span>
                  <span className="text-loog-muted">{n} ({pct}%)</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-loog-brand2" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {Object.keys(data.posts_30d_por_tipo).length === 0 && (
            <div className="text-xs text-loog-muted">Nenhum post nos últimos 30 dias.</div>
          )}
        </div>
      </div>

      {/* Correlação posts × vendas */}
      <div className="card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-loog-muted">
          Posts × Leads × Fechamentos (30d) — quem está convertendo
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-loog-border/60 text-left text-[10px] uppercase tracking-wider text-loog-muted">
                <th className="py-2">Consultor</th>
                <th className="py-2 text-right">Posts</th>
                <th className="py-2 text-right">Leads</th>
                <th className="py-2 text-right">Fechamentos</th>
                <th className="py-2 text-right">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {topConversores.map((r) => {
                const taxa = r.leads_30d > 0 ? Math.round((r.fechamentos_30d / r.leads_30d) * 100) : 0;
                return (
                  <tr key={r.id} className="border-b border-loog-border/30">
                    <td className="py-2">
                      <div className="font-semibold">{r.full_name || "—"}</div>
                      <div className="text-[11px] text-loog-muted">{r.email}</div>
                    </td>
                    <td className="py-2 text-right">{r.posts_30d}</td>
                    <td className="py-2 text-right">{r.leads_30d}</td>
                    <td className="py-2 text-right font-bold text-emerald-300">{r.fechamentos_30d}</td>
                    <td className="py-2 text-right text-loog-brand2">{taxa}%</td>
                  </tr>
                );
              })}
              {topConversores.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-xs text-loog-muted">Sem dados ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Badges concedidos */}
      <div className="card p-5">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-loog-muted">Badges distribuídos (histórico)</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.badges_por_tipo).map(([k, n]) => (
            <div key={k} className="rounded-full border border-loog-border bg-loog-panel/40 px-3 py-1 text-xs">
              <b>{n}</b> × {k.replace(/_/g, " ")}
            </div>
          ))}
          {Object.keys(data.badges_por_tipo).length === 0 && <div className="text-xs text-loog-muted">Nenhum badge concedido ainda.</div>}
        </div>
      </div>

      {/* Suspeitos */}
      {data.suspeitos.length > 0 && (
        <div className="card border-red-500/30 bg-red-500/5 p-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-300">
            ⚠ Check-ins invalidados nos últimos 30 dias ({data.suspeitos.length})
          </h4>
          <ul className="space-y-1 text-xs">
            {data.suspeitos.slice(0, 20).map((s) => (
              <li key={s.id} className="rounded border border-red-500/20 bg-red-500/5 p-2">
                <a href={s.post_url} target="_blank" rel="noopener noreferrer" className="truncate text-loog-brand2 hover:underline">
                  {s.post_url}
                </a>
                <div className="text-[10px] text-loog-muted">
                  {formatDateTime(s.posted_at)} · {s.post_type} · {s.invalidated_reason ?? "sem motivo"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Rewards CRUD ─────────────────────────────────────────────────────────────
function RewardsPane({ rewards, onChange }: { rewards: Reward[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Partial<Reward> | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    if (!editing.titulo || editing.titulo.trim().length < 2) { alert("Título obrigatório"); return; }
    setBusy(true);
    try {
      const isNew = !editing.id;
      const url = "/api/fidelity/rewards";
      const method = isNew ? "POST" : "PATCH";
      const body = isNew ? editing : { ...editing, id: editing.id };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      setEditing(null);
      onChange();
    } catch (e) { console.error(e); alert("Erro ao salvar."); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Excluir essa recompensa?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/fidelity/rewards?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      onChange();
    } catch (e) { console.error(e); alert("Erro ao excluir."); }
    finally { setBusy(false); }
  }

  async function toggle(r: Reward) {
    setBusy(true);
    try {
      await fetch("/api/fidelity/rewards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, ativo: !r.ativo }),
      });
      onChange();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">🎁 Recompensas configuradas</h3>
        <button type="button" onClick={() => setEditing({ scope: "mensal", ativo: true })} className="btn-primary !py-2 !text-xs">+ Nova</button>
      </div>

      {editing && (
        <div className="card border-loog-brand2/50 p-5">
          <h4 className="mb-3 text-sm font-semibold">{editing.id ? "Editar" : "Nova"} recompensa</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="input" placeholder="Título" value={editing.titulo ?? ""} onChange={(e) => setEditing({ ...editing, titulo: e.target.value })} />
            <select className="input" value={editing.scope ?? "mensal"} onChange={(e) => setEditing({ ...editing, scope: e.target.value as Reward["scope"] })}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="input" placeholder="Valor (R$ 500, Jantar, 5% comissão...)" value={editing.valor ?? ""} onChange={(e) => setEditing({ ...editing, valor: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input" type="number" min={1} placeholder="Posição mínima (ex: 1 = top 1)" value={editing.posicao_min ?? ""} onChange={(e) => setEditing({ ...editing, posicao_min: e.target.value ? Number(e.target.value) : null })} />
              <input className="input" type="number" min={1} placeholder="Pontos mínimos" value={editing.pontos_min ?? ""} onChange={(e) => setEditing({ ...editing, pontos_min: e.target.value ? Number(e.target.value) : null })} />
            </div>
          </div>
          <textarea className="input mt-3 min-h-[80px]" placeholder="Descrição da recompensa" value={editing.descricao ?? ""} onChange={(e) => setEditing({ ...editing, descricao: e.target.value })} />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="btn-primary !py-2 !text-xs">{busy ? "Salvando…" : "Salvar"}</button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-loog-border px-3 py-2 text-xs text-loog-muted hover:text-white">Cancelar</button>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {rewards.map((r) => (
          <div key={r.id} className={cn("rounded-lg border p-4", r.ativo ? "border-loog-border" : "border-loog-border/40 opacity-60")}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-loog-brand/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-loog-brand2">{r.scope}</span>
                  {!r.ativo && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">inativa</span>}
                </div>
                <h4 className="mt-2 text-sm font-semibold">{r.titulo}</h4>
                {r.descricao && <p className="mt-1 text-xs text-loog-muted">{r.descricao}</p>}
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-loog-muted">
                  {r.valor && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">{r.valor}</span>}
                  {r.posicao_min != null && <span>Top {r.posicao_min}</span>}
                  {r.pontos_min != null && <span>{r.pontos_min}+pt</span>}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              <button type="button" onClick={() => setEditing(r)} className="text-loog-brand2 hover:underline">editar</button>
              <button type="button" onClick={() => toggle(r)} className="text-loog-muted hover:text-white">{r.ativo ? "desativar" : "ativar"}</button>
              <button type="button" onClick={() => remove(r.id)} className="text-red-400 hover:text-red-300">excluir</button>
            </div>
          </div>
        ))}
        {rewards.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-loog-border p-6 text-center text-xs text-loog-muted">
            Nenhuma recompensa configurada. Clique em <b>+ Nova</b> pra criar a primeira.
          </div>
        )}
      </div>
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
