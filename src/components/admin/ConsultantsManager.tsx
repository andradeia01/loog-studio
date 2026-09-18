"use client";

import { useMemo, useState } from "react";
import { cn, formatInstagram, formatPhoneBR } from "@/lib/utils";

export interface ConsultantRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  instagram: string | null;
  city: string | null;
  photo_url: string | null;
  role: "admin" | "consultant";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
  rejected_reason: string | null;
}

type Filter = "pending" | "approved" | "rejected" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pendentes" },
  { key: "approved", label: "Aprovados" },
  { key: "rejected", label: "Rejeitados" },
  { key: "all", label: "Todos" },
];

export function ConsultantsManager({ initial }: { initial: ConsultantRow[] }) {
  const [rows, setRows] = useState<ConsultantRow[]>(initial);
  const [filter, setFilter] = useState<Filter>(
    initial.some((r) => r.status === "pending") ? "pending" : "all",
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [filter, rows],
  );

  async function act(id: string, action: "approve" | "reject" | "revoke" | "promote" | "demote", reason?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/consultants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { profile } = await res.json();
      setRows((r) => r.map((x) => (x.id === id ? { ...x, ...profile } : x)));
    } catch (err) {
      console.error(err);
      alert("Não foi possível executar a ação.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Excluir permanentemente ${name}? Essa ação não pode ser desfeita.`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/consultants/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      console.error(err);
      alert("Não foi possível excluir.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={filter === f.key ? "chip-active" : "chip"}>
            {f.label}
            {" "}
            <span className="ml-1 text-loog-muted">
              {f.key === "all" ? rows.length : rows.filter((r) => r.status === f.key).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
          Ninguém aqui.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const busy = busyId === r.id;
            return (
              <div key={r.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-3">
                  {r.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo_url} alt="" className="h-12 w-12 rounded-full border border-loog-border object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-loog-border bg-loog-panel text-sm font-bold text-loog-muted">
                      {(r.full_name || r.email).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {r.full_name || <span className="italic text-loog-muted">sem nome</span>}
                      {r.role === "admin" && (
                        <span className="ml-2 rounded-full border border-loog-brand2/40 bg-loog-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase text-loog-brand2">admin</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-loog-muted">
                      {r.email} · {r.phone ? formatPhoneBR(r.phone) : "—"}
                      {r.instagram && <> · {formatInstagram(r.instagram)}</>}
                      {r.city && <> · {r.city}</>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-widest">
                      <StatusPill status={r.status} />
                      <span className="text-loog-muted">
                        cadastro em {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {r.status === "rejected" && r.rejected_reason && (
                      <div className="mt-1 text-[11px] text-red-300">Motivo: {r.rejected_reason}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {r.status !== "approved" && (
                    <button className="btn-primary !py-2 !text-xs" onClick={() => act(r.id, "approve")} disabled={busy}>Aprovar</button>
                  )}
                  {r.status !== "rejected" && (
                    <button
                      className="btn-ghost !py-2 !text-xs !text-red-300"
                      onClick={() => {
                        const reason = prompt("Motivo da rejeição (opcional):") ?? undefined;
                        act(r.id, "reject", reason);
                      }}
                      disabled={busy}
                    >
                      Rejeitar
                    </button>
                  )}
                  {r.status === "approved" && (
                    <button className="btn-ghost !py-2 !text-xs" onClick={() => act(r.id, "revoke")} disabled={busy}>Suspender</button>
                  )}
                  {r.role === "consultant" ? (
                    <button className="btn-ghost !py-2 !text-xs" onClick={() => act(r.id, "promote")} disabled={busy}>Promover a admin</button>
                  ) : (
                    <button className="btn-ghost !py-2 !text-xs" onClick={() => act(r.id, "demote")} disabled={busy}>Rebaixar</button>
                  )}
                  <button className="btn-ghost !py-2 !text-xs !text-red-400" onClick={() => remove(r.id, r.full_name || r.email)} disabled={busy}>Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function StatusPill({ status }: { status: ConsultantRow["status"] }) {
  const map = {
    pending: { label: "pendente", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    approved: { label: "aprovado", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
    rejected: { label: "rejeitado", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  }[status];
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", map.cls)}>{map.label}</span>;
}
