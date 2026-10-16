"use client";

import { useMemo, useState } from "react";

export type MemberRow = {
  id: string;
  matricula: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  status: "ativo" | "inadimplente" | "suspenso" | "cancelado";
  owner_consultant_id: string | null;
  group_id: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<MemberRow["status"], string> = {
  ativo: "bg-green-500/20 text-green-300 border-green-500/30",
  inadimplente: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  suspenso: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  cancelado: "bg-red-500/20 text-red-300 border-red-500/30",
};

export function MembersManager({ initial, totalRows }: { initial: MemberRow[]; totalRows: number }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return initial.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!s) return true;
      return (
        m.nome.toLowerCase().includes(s) ||
        m.matricula.toLowerCase().includes(s) ||
        (m.cpf_cnpj ?? "").toLowerCase().includes(s) ||
        (m.email ?? "").toLowerCase().includes(s) ||
        (m.telefone ?? "").toLowerCase().includes(s)
      );
    });
  }, [initial, search, statusFilter]);

  const stats = useMemo(() => {
    const by: Record<string, number> = { ativo: 0, inadimplente: 0, suspenso: 0, cancelado: 0 };
    for (const m of initial) by[m.status] = (by[m.status] ?? 0) + 1;
    return by;
  }, [initial]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Total" value={totalRows} highlight />
        <Stat label="Ativos" value={stats.ativo ?? 0} />
        <Stat label="Inadimplentes" value={stats.inadimplente ?? 0} />
        <Stat label="Suspensos" value={stats.suspenso ?? 0} />
        <Stat label="Cancelados" value={stats.cancelado ?? 0} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-loog-border bg-loog-panel p-3">
        <input
          type="text"
          placeholder="Buscar por nome, CPF, matrícula, telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white placeholder:text-loog-muted focus:border-loog-brand focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white"
        >
          <option value="all">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="inadimplente">Inadimplentes</option>
          <option value="suspenso">Suspensos</option>
          <option value="cancelado">Cancelados</option>
        </select>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-loog-brand px-4 py-2 text-sm font-semibold text-white shadow-glow hover:brightness-110"
        >
          {showCreate ? "Fechar" : "+ Novo associado"}
        </button>
      </div>

      {showCreate && <CreateMemberForm onCreated={() => { setShowCreate(false); window.location.reload(); }} />}

      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-loog-border p-10 text-center">
          <p className="text-loog-muted">Nenhum associado cadastrado ainda.</p>
          <p className="mt-2 text-xs text-loog-muted">
            A tabela <code className="text-white">members</code> foi criada na migration-011. Cadastre o primeiro associado para começar.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-loog-border bg-loog-panel">
          <table className="w-full text-sm">
            <thead className="border-b border-loog-border text-xs uppercase tracking-wider text-loog-muted">
              <tr>
                <th className="px-3 py-2 text-left">Matrícula</th>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">CPF/CNPJ</th>
                <th className="px-3 py-2 text-left">Contato</th>
                <th className="px-3 py-2 text-left">Local</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-loog-border/50 transition hover:bg-loog-bg/50">
                  <td className="px-3 py-2 font-mono text-xs text-white/80">{m.matricula}</td>
                  <td className="px-3 py-2 font-semibold text-white">{m.nome}</td>
                  <td className="px-3 py-2 text-xs text-loog-muted">{m.cpf_cnpj ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {m.email && <div className="text-white/90">{m.email}</div>}
                    {m.telefone && <div className="text-loog-muted">{m.telefone}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-loog-muted">
                    {m.cidade || m.uf ? `${m.cidade ?? ""}${m.cidade && m.uf ? "/" : ""}${m.uf ?? ""}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[m.status]}`}>
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-loog-muted">Nenhum associado nesses filtros.</div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateMemberForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ matricula: "", nome: "", cpf_cnpj: "", email: "", telefone: "", cidade: "", uf: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Erro ao criar associado");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-xl border border-loog-brand/40 bg-loog-brand/5 p-4 md:grid-cols-2">
      <Input label="Matrícula" value={form.matricula} onChange={(v) => setForm({ ...form, matricula: v })} required placeholder="LG-0000001" />
      <Input label="Nome completo" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} required />
      <Input label="CPF/CNPJ" value={form.cpf_cnpj} onChange={(v) => setForm({ ...form, cpf_cnpj: v })} />
      <Input label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
      <Input label="Telefone" value={form.telefone} onChange={(v) => setForm({ ...form, telefone: v })} />
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <Input label="Cidade" value={form.cidade} onChange={(v) => setForm({ ...form, cidade: v })} />
        <Input label="UF" value={form.uf} onChange={(v) => setForm({ ...form, uf: v.toUpperCase().slice(0, 2) })} />
      </div>
      {error && <p className="col-span-full text-sm text-red-400">⚠️ {error}</p>}
      <div className="col-span-full flex justify-end gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-loog-brand px-4 py-2 text-sm font-semibold text-white shadow-glow hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Criar associado"}
        </button>
      </div>
    </form>
  );
}

function Input({ label, value, onChange, required, placeholder }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">{label}{required && <span className="text-red-400"> *</span>}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white placeholder:text-loog-muted focus:border-loog-brand focus:outline-none"
      />
    </label>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-loog-brand/50 bg-loog-brand/10" : "border-loog-border bg-loog-panel"}`}>
      <div className="text-xs uppercase tracking-wider text-loog-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
