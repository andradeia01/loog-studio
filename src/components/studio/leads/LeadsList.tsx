"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/errors/api-fetch";

interface LeadRow {
  id: string;
  consultor_id: string;
  status: "lead" | "prospect" | "pendencia" | "cliente" | "perdido";
  contratante_nome: string;
  contratante_email: string | null;
  contratante_cpf: string | null;
  contratante_telefone: string | null;
  contratante_cidade: string | null;
  contratante_uf: string | null;
  procedencia: string | null;
  sivis_id: string | null;
  sivis_sync_status: "pending" | "synced" | "failed" | "skipped" | "stale";
  sivis_last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_META: Record<LeadRow["status"], { label: string; className: string; emoji: string }> = {
  lead:       { label: "Lead",       emoji: "🌱", className: "bg-sky-500/15 text-sky-200 border-sky-500/30" },
  prospect:   { label: "Prospect",   emoji: "🎯", className: "bg-amber-500/15 text-amber-200 border-amber-500/30" },
  pendencia:  { label: "Pendência",  emoji: "📋", className: "bg-orange-500/15 text-orange-200 border-orange-500/30" },
  cliente:    { label: "Cliente",    emoji: "✅", className: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" },
  perdido:    { label: "Perdido",    emoji: "❌", className: "bg-rose-500/15 text-rose-200 border-rose-500/30" },
};

const SYNC_META: Record<LeadRow["sivis_sync_status"], { label: string; emoji: string; title: string }> = {
  pending:  { emoji: "🟡", label: "Sincronizando", title: "Esperando o worker de sync" },
  synced:   { emoji: "🟢", label: "Sincronizado",   title: "No SIVIS" },
  failed:   { emoji: "🔴", label: "Falhou",         title: "Clica no lead e tenta Re-sync" },
  skipped:  { emoji: "⚪", label: "Pulado",          title: "Marcado pra não sincronizar" },
  stale:    { emoji: "🔵", label: "Divergente",     title: "SIVIS mudou de fora — reconciliação necessária" },
};

export function LeadsList() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LeadRow["status"] | "todos">("todos");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "todos") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "100");
      const res = await apiFetch(`/api/leads?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao listar");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<LeadRow["status"], number> = { lead: 0, prospect: 0, pendencia: 0, cliente: 0, perdido: 0 };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Meus Leads</h2>
          <p className="mt-1 text-sm text-loog-muted">
            {total} {total === 1 ? "lead" : "leads"} no funil · sincronização SIVIS em background
          </p>
        </div>
        <Link
          href="/studio/leads/novo"
          className="rounded-xl bg-loog-brand px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-loog-brand/20 transition hover:brightness-110"
        >
          + Novo Lead
        </Link>
      </div>

      {/* Filtros de status */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusChip label={`Todos (${leads.length})`} active={statusFilter === "todos"} onClick={() => setStatusFilter("todos")} />
        {(Object.keys(STATUS_META) as LeadRow["status"][]).map((k) => (
          <StatusChip
            key={k}
            label={`${STATUS_META[k].emoji} ${STATUS_META[k].label} (${counts[k]})`}
            active={statusFilter === k}
            onClick={() => setStatusFilter(k)}
          />
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nome ou CPF…"
        className="w-full rounded-xl border border-loog-border bg-loog-panel px-4 py-2.5 text-sm text-white placeholder:text-loog-muted outline-none focus:border-loog-brand"
      />

      {/* Loading / Error / Empty */}
      {loading && <div className="rounded-xl border border-loog-border bg-loog-panel p-6 text-center text-sm text-loog-muted">Carregando leads…</div>}
      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">{error}</div>}
      {!loading && !error && leads.length === 0 && (
        <div className="rounded-xl border border-dashed border-loog-border bg-loog-panel/50 p-10 text-center">
          <div className="text-4xl mb-3">🌱</div>
          <p className="text-sm text-loog-muted">Nenhum lead ainda. Clica em <strong>+ Novo Lead</strong> pra começar.</p>
        </div>
      )}

      {/* Grid de leads */}
      {!loading && leads.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leads.map((l) => (
            <LeadCard key={l.id} lead={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-medium transition " +
        (active
          ? "border-loog-brand/60 bg-loog-brand/20 text-white"
          : "border-loog-border bg-loog-panel text-loog-muted hover:border-loog-brand/40 hover:text-white")
      }
    >
      {label}
    </button>
  );
}

function LeadCard({ lead }: { lead: LeadRow }) {
  const meta = STATUS_META[lead.status];
  const sync = SYNC_META[lead.sivis_sync_status];
  const cidade = [lead.contratante_cidade, lead.contratante_uf].filter(Boolean).join("/");

  return (
    <Link
      href={`/studio/leads/${lead.id}`}
      className="group rounded-2xl border border-loog-border bg-loog-panel p-4 transition hover:border-loog-brand/50 hover:shadow-lg hover:shadow-loog-brand/10"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-white group-hover:text-loog-brand transition">
          {lead.contratante_nome}
        </h3>
        <span title={sync.title} className="text-lg leading-none">{sync.emoji}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.className}`}>
          {meta.emoji} {meta.label}
        </span>
        {lead.sivis_id && (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">
            SIVIS #{lead.sivis_id}
          </span>
        )}
      </div>
      <div className="mt-3 space-y-1 text-xs text-loog-muted">
        {lead.contratante_telefone && <div>📞 {formatPhone(lead.contratante_telefone)}</div>}
        {lead.contratante_email && <div>✉️ {lead.contratante_email}</div>}
        {cidade && <div>📍 {cidade}</div>}
      </div>
      <div className="mt-3 text-[10px] text-loog-muted/70">
        Atualizado {formatRelativeTime(lead.updated_at)}
      </div>
    </Link>
  );
}

function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(1, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `há ${diffSec}s`;
  if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)}min`;
  if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)}h`;
  return `há ${Math.floor(diffSec / 86400)}d`;
}
