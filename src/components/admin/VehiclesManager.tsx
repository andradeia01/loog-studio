"use client";

import { useState, useMemo } from "react";

export type VehicleRow = {
  id: string;
  placa: string;
  tipo: "carro" | "moto" | "utilitario" | "eletrico" | "caminhao";
  marca: string;
  modelo: string;
  ano_modelo: number;
  fipe_code: string | null;
  fipe_value_cents: number | null;
  active: boolean;
  member_id: string;
  created_at: string;
};

export type RestrictionRow = {
  id: string;
  scope: "fipe_code" | "marca" | "modelo" | "placa";
  marca: string | null;
  modelo: string | null;
  fipe_code: string | null;
  fipe_year_id: string | null;
  placa: string | null;
  vehicle_type: string | null;
  reason: string | null;
  active: boolean;
  created_at: string;
};

const SCOPE_LABELS: Record<RestrictionRow["scope"], string> = {
  placa: "Placa específica",
  fipe_code: "Código FIPE (modelo exato)",
  modelo: "Marca + Modelo (todos os anos)",
  marca: "Marca inteira",
};

const SCOPE_EMOJI: Record<RestrictionRow["scope"], string> = {
  placa: "🔢",
  fipe_code: "🎯",
  modelo: "🚫",
  marca: "⛔",
};

function brl(cents: number | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function VehiclesManager({
  initialVehicles,
  initialRestrictions,
}: {
  initialVehicles: VehicleRow[];
  initialRestrictions: RestrictionRow[];
}) {
  const [tab, setTab] = useState<"veiculos" | "bloqueios">("bloqueios");
  const [restrictions, setRestrictions] = useState(initialRestrictions);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-loog-border bg-loog-panel p-1">
        <TabButton active={tab === "bloqueios"} onClick={() => setTab("bloqueios")}>
          ⛔ Bloqueios <span className="ml-1 rounded bg-red-500/20 px-1.5 text-xs text-red-300">{restrictions.filter(r => r.active).length}</span>
        </TabButton>
        <TabButton active={tab === "veiculos"} onClick={() => setTab("veiculos")}>
          🚗 Veículos <span className="ml-1 rounded bg-loog-brand/20 px-1.5 text-xs text-white/80">{initialVehicles.length}</span>
        </TabButton>
      </div>

      {tab === "bloqueios" ? (
        <RestrictionsPanel
          restrictions={restrictions}
          onChange={setRestrictions}
          showForm={showForm}
          setShowForm={setShowForm}
        />
      ) : (
        <VehiclesPanel vehicles={initialVehicles} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-loog-brand text-white shadow-glow" : "text-loog-muted hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function RestrictionsPanel({
  restrictions,
  onChange,
  showForm,
  setShowForm,
}: {
  restrictions: RestrictionRow[];
  onChange: (r: RestrictionRow[]) => void;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
}) {
  async function toggle(id: string, active: boolean) {
    const resp = await fetch(`/api/admin/vehicle-restrictions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (resp.ok) {
      onChange(restrictions.map((r) => (r.id === id ? { ...r, active } : r)));
    }
  }

  async function remove(id: string) {
    if (!confirm("Remover esta restrição? (os veículos voltam a poder ser cotados)")) return;
    const resp = await fetch(`/api/admin/vehicle-restrictions/${id}`, { method: "DELETE" });
    if (resp.ok) {
      onChange(restrictions.filter((r) => r.id !== id));
    }
  }

  return (
    <>
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
        <h3 className="font-display text-sm font-bold text-amber-200">💡 Como funciona o bloqueio</h3>
        <p className="mt-1 text-xs text-amber-100/80">
          Você escolhe a <strong>granularidade</strong>: bloqueia uma marca inteira (ex: toda BMW), uma marca+modelo (ex: BMW X5 de qualquer ano),
          um código FIPE específico (ex: BMW X5 2015 2.0 Diesel), ou uma placa individual. Veículo bloqueado não pode gerar cotação no sistema.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-loog-muted">
          Lista negra ({restrictions.length} regras)
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-loog-brand px-4 py-2 text-sm font-semibold text-white shadow-glow hover:brightness-110"
        >
          {showForm ? "Fechar" : "+ Nova restrição"}
        </button>
      </div>

      {showForm && (
        <RestrictionForm
          onCreated={(newRow) => {
            onChange([newRow, ...restrictions]);
            setShowForm(false);
          }}
        />
      )}

      {restrictions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-loog-border p-10 text-center">
          <p className="text-loog-muted">Nenhum veículo bloqueado ainda.</p>
          <p className="mt-2 text-xs text-loog-muted">
            Clique em <strong>+ Nova restrição</strong> para adicionar o primeiro bloqueio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {restrictions.map((r) => (
            <article
              key={r.id}
              className={`rounded-xl border p-4 transition ${
                r.active ? "border-red-500/40 bg-red-500/5" : "border-loog-border bg-loog-panel opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{SCOPE_EMOJI[r.scope]}</span>
                    <h3 className="font-display text-sm font-bold text-white">{SCOPE_LABELS[r.scope]}</h3>
                    {!r.active && <span className="rounded bg-loog-muted/20 px-1.5 py-0.5 text-[10px] font-bold text-loog-muted">PAUSADO</span>}
                  </div>
                  <div className="mt-2 space-y-0.5 text-sm">
                    {r.marca && <div><span className="text-loog-muted">Marca:</span> <strong className="text-white">{r.marca}</strong></div>}
                    {r.modelo && <div><span className="text-loog-muted">Modelo:</span> <strong className="text-white">{r.modelo}</strong></div>}
                    {r.fipe_code && <div><span className="text-loog-muted">FIPE:</span> <code className="text-white">{r.fipe_code}</code>{r.fipe_year_id && ` (${r.fipe_year_id})`}</div>}
                    {r.placa && <div><span className="text-loog-muted">Placa:</span> <code className="text-white">{r.placa}</code></div>}
                    {r.vehicle_type && <div><span className="text-loog-muted">Tipo:</span> {r.vehicle_type}</div>}
                  </div>
                  {r.reason && <p className="mt-2 border-l-2 border-red-400/50 pl-2 text-xs italic text-loog-muted">{r.reason}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => toggle(r.id, !r.active)}
                    className="rounded border border-loog-border px-2 py-1 text-[10px] text-white/80 hover:bg-loog-bg"
                    title={r.active ? "Pausar" : "Reativar"}
                  >
                    {r.active ? "⏸" : "▶️"}
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
                    title="Remover"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function RestrictionForm({ onCreated }: { onCreated: (r: RestrictionRow) => void }) {
  const [form, setForm] = useState({
    scope: "modelo" as RestrictionRow["scope"],
    marca: "",
    modelo: "",
    fipe_code: "",
    fipe_year_id: "",
    placa: "",
    vehicle_type: "",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, string | null> = {
        scope: form.scope,
        marca: form.marca || null,
        modelo: form.modelo || null,
        fipe_code: form.fipe_code || null,
        fipe_year_id: form.fipe_year_id || null,
        placa: form.placa ? form.placa.toUpperCase().replace(/[^A-Z0-9]/g, "") : null,
        vehicle_type: form.vehicle_type || null,
        reason: form.reason || null,
      };
      const resp = await fetch("/api/admin/vehicle-restrictions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Erro");
      onCreated(data.restriction);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const showMarca = ["marca", "modelo"].includes(form.scope);
  const showModelo = form.scope === "modelo";
  const showFipe = form.scope === "fipe_code";
  const showPlaca = form.scope === "placa";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-loog-brand/40 bg-loog-brand/5 p-4">
      <h3 className="font-display text-sm font-bold text-white">Nova restrição de veículo</h3>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">Tipo de bloqueio *</span>
        <select
          value={form.scope}
          onChange={(e) => setForm({ ...form, scope: e.target.value as RestrictionRow["scope"] })}
          className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white"
        >
          <option value="placa">🔢 Placa específica (uma placa)</option>
          <option value="fipe_code">🎯 Código FIPE (um modelo exato)</option>
          <option value="modelo">🚫 Marca + Modelo (ex: BMW X5 — todos os anos)</option>
          <option value="marca">⛔ Marca inteira (ex: todas as BMWs)</option>
        </select>
      </label>

      {showPlaca && (
        <Input label="Placa (sem traço)" value={form.placa} onChange={(v) => setForm({ ...form, placa: v })} placeholder="ABC1D23" required />
      )}
      {showFipe && (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Código FIPE" value={form.fipe_code} onChange={(v) => setForm({ ...form, fipe_code: v })} placeholder="009001-5" required />
          <Input label="Ano/Combust. (opcional)" value={form.fipe_year_id} onChange={(v) => setForm({ ...form, fipe_year_id: v })} placeholder="2015-1" />
        </div>
      )}
      {showMarca && (
        <Input label="Marca" value={form.marca} onChange={(v) => setForm({ ...form, marca: v.toUpperCase() })} placeholder="BMW" required />
      )}
      {showModelo && (
        <Input label="Modelo" value={form.modelo} onChange={(v) => setForm({ ...form, modelo: v.toUpperCase() })} placeholder="X5" required />
      )}

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">Tipo de veículo (opcional)</span>
        <select
          value={form.vehicle_type}
          onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
          className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white"
        >
          <option value="">Todos os tipos</option>
          <option value="carro">Carro</option>
          <option value="moto">Moto</option>
          <option value="utilitario">Utilitário</option>
          <option value="eletrico">Elétrico</option>
          <option value="caminhao">Caminhão</option>
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">Motivo (interno)</span>
        <textarea
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          rows={2}
          placeholder="Ex: Modelo com histórico alto de sinistros / Alta frequência de furto"
          className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white placeholder:text-loog-muted focus:border-loog-brand focus:outline-none"
        />
      </label>

      {error && <p className="text-sm text-red-400">⚠️ {error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-loog-brand px-4 py-2 text-sm font-semibold text-white shadow-glow hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Criar restrição"}
        </button>
      </div>
    </form>
  );
}

function VehiclesPanel({ vehicles }: { vehicles: VehicleRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return vehicles;
    return vehicles.filter(
      (v) =>
        v.placa.toLowerCase().includes(s) ||
        v.marca.toLowerCase().includes(s) ||
        v.modelo.toLowerCase().includes(s) ||
        (v.fipe_code ?? "").toLowerCase().includes(s)
    );
  }, [vehicles, search]);

  if (vehicles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-loog-border p-10 text-center">
        <p className="text-loog-muted">Nenhum veículo cadastrado ainda.</p>
        <p className="mt-2 text-xs text-loog-muted">
          Tabela <code className="text-white">vehicles</code> da migration-011 — veículos entrarão aqui conforme os associados forem cadastrando.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Buscar por placa, marca, modelo, FIPE..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-loog-border bg-loog-panel px-3 py-2 text-sm text-white placeholder:text-loog-muted focus:border-loog-brand focus:outline-none"
      />

      <div className="overflow-x-auto rounded-xl border border-loog-border bg-loog-panel">
        <table className="w-full text-sm">
          <thead className="border-b border-loog-border text-xs uppercase tracking-wider text-loog-muted">
            <tr>
              <th className="px-3 py-2 text-left">Placa</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Marca / Modelo</th>
              <th className="px-3 py-2 text-left">Ano</th>
              <th className="px-3 py-2 text-left">FIPE</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} className="border-t border-loog-border/50 transition hover:bg-loog-bg/50">
                <td className="px-3 py-2 font-mono text-xs text-white">{v.placa}</td>
                <td className="px-3 py-2 text-xs text-loog-muted">{v.tipo}</td>
                <td className="px-3 py-2 text-white">
                  <strong>{v.marca}</strong> <span className="text-loog-muted">{v.modelo}</span>
                </td>
                <td className="px-3 py-2 text-xs">{v.ano_modelo}</td>
                <td className="px-3 py-2 font-mono text-xs text-loog-muted">{v.fipe_code ?? "—"}</td>
                <td className="px-3 py-2 text-right text-white">{brl(v.fipe_value_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
