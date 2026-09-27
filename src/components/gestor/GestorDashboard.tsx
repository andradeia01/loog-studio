"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface Consultant {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  status: "pending" | "approved" | "rejected";
  total_points: number;
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
  photo_url: string | null;
}
interface PendingConsultant {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  created_at: string;
}
interface CheckIn {
  id: string;
  consultant_id: string;
  post_url: string;
  post_type: string;
  posted_at: string;
  points_awarded: number;
  approved: boolean;
  invalidated_at: string | null;
  profiles?: { full_name: string | null } | null;
}

type Tab = "consultores" | "pendentes" | "checkins";

export function GestorDashboard({
  hasGroup,
  consultants: initialCons,
  pending: initialPending,
  checkins: initialCheckins,
}: {
  hasGroup: boolean;
  consultants: Consultant[];
  pending: PendingConsultant[];
  checkins: CheckIn[];
}) {
  const [tab, setTab] = useState<Tab>("consultores");
  const [consultants, setConsultants] = useState(initialCons);
  const [pending, setPending] = useState(initialPending);
  const [checkins] = useState(initialCheckins);
  const [busyId, setBusyId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const active = consultants.filter((c) => c.current_streak > 0).length;
    const totalPoints = consultants.reduce((s, c) => s + c.total_points, 0);
    return {
      total: consultants.length,
      approved: consultants.filter((c) => c.status === "approved").length,
      active,
      totalPoints,
    };
  }, [consultants]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/gestores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (r.ok) {
        const promoted = pending.find((p) => p.id === id);
        setPending((ps) => ps.filter((p) => p.id !== id));
        if (promoted) {
          setConsultants((cs) => [
            ...cs,
            {
              id: promoted.id,
              full_name: promoted.full_name,
              email: promoted.email,
              phone: promoted.phone,
              city: promoted.city,
              status: "approved",
              total_points: 0,
              current_streak: 0,
              longest_streak: 0,
              last_checkin_date: null,
              photo_url: null,
            },
          ]);
        }
      }
    } finally { setBusyId(null); }
  }
  async function reject(id: string) {
    if (!confirm("Rejeitar esse cadastro?")) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/gestores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      if (r.ok) setPending((ps) => ps.filter((p) => p.id !== id));
    } finally { setBusyId(null); }
  }

  if (!hasGroup) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-lg font-semibold">Sem grupo atribuído</h2>
        <p className="mt-2 text-loog-muted">
          Peça pro admin te vincular a um grupo em <code>/admin/config</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Consultores" value={stats.total} icon="👥" />
        <Stat label="Pendentes" value={pending.length} icon="⏳" highlight={pending.length > 0} />
        <Stat label="Ativos hoje (streak)" value={stats.active} icon="🔥" />
        <Stat label="Pontos do grupo" value={stats.totalPoints} icon="⭐" />
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-2xl border border-loog-border bg-loog-panel p-1">
        {(
          [
            ["consultores", `Consultores (${consultants.length})`],
            ["pendentes", `Pendentes ${pending.length > 0 ? `(${pending.length})` : ""}`],
            ["checkins", "Check-ins recentes"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === k ? "bg-loog-brand text-white" : "text-loog-muted hover:text-white")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "consultores" && (
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">Ranking do grupo</h3>
          {consultants.length === 0 ? (
            <div className="rounded-lg border border-dashed border-loog-border p-8 text-center text-loog-muted">
              Nenhum consultor aprovado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-loog-border text-left text-[10px] uppercase text-loog-muted">
                    <th className="py-2">#</th>
                    <th className="py-2">Consultor</th>
                    <th className="py-2">Cidade</th>
                    <th className="py-2 text-right">Streak</th>
                    <th className="py-2 text-right">Melhor</th>
                    <th className="py-2 text-right">Pontos</th>
                    <th className="py-2 text-right">Último post</th>
                  </tr>
                </thead>
                <tbody>
                  {consultants.map((c, i) => (
                    <tr key={c.id} className="border-b border-loog-border/30">
                      <td className="py-2 text-loog-muted">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</td>
                      <td className="py-2">
                        <div className="font-semibold">{c.full_name || "—"}</div>
                        <div className="text-[11px] text-loog-muted">{c.email}</div>
                      </td>
                      <td className="py-2 text-loog-muted">{c.city ?? "—"}</td>
                      <td className="py-2 text-right">{c.current_streak}d</td>
                      <td className="py-2 text-right">{c.longest_streak}d</td>
                      <td className="py-2 text-right font-bold text-loog-brand2">{c.total_points}</td>
                      <td className="py-2 text-right text-[11px] text-loog-muted">{c.last_checkin_date ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "pendentes" && (
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">Aprovações pendentes</h3>
          {pending.length === 0 ? (
            <div className="rounded-lg border border-dashed border-loog-border p-8 text-center text-loog-muted">
              Nenhum cadastro pendente. 🎉
            </div>
          ) : (
            <ul className="space-y-2">
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-loog-border p-3">
                  <div>
                    <div className="text-sm font-semibold">{p.full_name || "—"}</div>
                    <div className="text-[11px] text-loog-muted">
                      {p.email}{p.phone && ` · ${p.phone}`}{p.city && ` · ${p.city}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => reject(p.id)} disabled={busyId === p.id}
                      className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10">
                      Rejeitar
                    </button>
                    <button type="button" onClick={() => approve(p.id)} disabled={busyId === p.id}
                      className="btn-primary !py-1.5 !text-xs">
                      Aprovar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "checkins" && (
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">Últimos check-ins do grupo</h3>
          {checkins.length === 0 ? (
            <div className="rounded-lg border border-dashed border-loog-border p-8 text-center text-loog-muted">
              Sem check-ins ainda.
            </div>
          ) : (
            <ul className="space-y-2">
              {checkins.map((c) => (
                <li key={c.id} className={cn("rounded-lg border border-loog-border p-3", (c.invalidated_at || !c.approved) && "opacity-50")}>
                  <div className="text-sm font-semibold">{c.profiles?.full_name || "Consultor"}</div>
                  <a href={c.post_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-loog-brand2 hover:underline">
                    {c.post_type}: {c.post_url}
                  </a>
                  <div className="text-[10px] text-loog-muted">
                    {new Date(c.posted_at).toLocaleString("pt-BR")} · +{c.points_awarded}pt
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, highlight }: { label: string; value: number | string; icon: string; highlight?: boolean }) {
  return (
    <div className={cn("card p-4", highlight && "ring-2 ring-loog-brand2")}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-loog-muted">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}
