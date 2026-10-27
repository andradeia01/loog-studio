"use client";

import { useMemo, useState } from "react";

export type PlanRow = {
  id: string;
  slug: string;
  name: string;
  group_name: string;
  vehicle_type: "carro" | "moto" | "utilitario" | "eletrico" | "caminhao";
  vehicle_type_label: string;
  min_fipe_cents: number;
  max_fipe_cents: number | null;
  monthly_cents: number;
  monthly_cents_original?: number | null;
  participation_type: "fixed_cents" | "percent_bp";
  participation_value: number;
  payment_options: string;
  extras: string;
  acrescimos?: string | null;
  adhesion_service: string;
  sell_on_site: boolean;
  favorite: boolean;
  installments: boolean;
  year_limit: number | null;
  monthly_includes_adhesion: boolean;
  active: boolean;
  display_order: number;
  source?: string;
};

const TYPE_EMOJI: Record<string, string> = {
  carro: "🚗", moto: "🏍️", utilitario: "🚚", eletrico: "⚡", caminhao: "🚛",
};

function brl(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function participation(p: PlanRow): string {
  if (p.participation_type === "fixed_cents") return brl(p.participation_value) + " (fixo)";
  const pct = p.participation_value / 100;
  return pct.toFixed(2).replace(".", ",") + "% (do teto)";
}

export function PlansManager({ initial }: { initial: PlanRow[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const groups = useMemo(() => Array.from(new Set(initial.map((p) => p.group_name))), [initial]);
  const types = useMemo(() => Array.from(new Set(initial.map((p) => p.vehicle_type))), [initial]);
  const sources = useMemo(() => Array.from(new Set(initial.map((p) => p.source ?? "leves-oficial"))), [initial]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return initial.filter((p) => {
      if (typeFilter !== "all" && p.vehicle_type !== typeFilter) return false;
      if (groupFilter !== "all" && p.group_name !== groupFilter) return false;
      if (sourceFilter !== "all" && (p.source ?? "leves-oficial") !== sourceFilter) return false;
      if (!s) return true;
      return (
        p.name.toLowerCase().includes(s) ||
        p.slug.toLowerCase().includes(s) ||
        p.group_name.toLowerCase().includes(s)
      );
    });
  }, [initial, search, typeFilter, groupFilter, sourceFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, PlanRow[]>();
    for (const p of filtered) {
      const key = `${p.group_name} • ${TYPE_EMOJI[p.vehicle_type] ?? ""} ${p.vehicle_type_label}`;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const totalActive = initial.filter((p) => p.active).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total planos" value={initial.length} />
        <Stat label="Ativos" value={totalActive} highlight />
        <Stat label="Grupos" value={groups.length} />
        <Stat label="Tipos de veículo" value={types.length} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-loog-border bg-loog-panel p-3">
        <input
          type="text"
          placeholder="Buscar COTA..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white placeholder:text-loog-muted focus:border-loog-brand focus:outline-none"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white"
        >
          <option value="all">Todos os tipos</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_EMOJI[t] ?? ""} {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white"
        >
          <option value="all">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white"
          title="Origem da tabela: leves-oficial (Planos.xlsx) vs pesados-026 (caminhões, +10%)"
        >
          <option value="all">Todas as fontes</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s === "pesados-026" ? "🚛 Pesados (026 · +10%)" : s === "leves-oficial" ? "🚗 Leves (Planos.xlsx)" : s}
            </option>
          ))}
        </select>
      </div>

      {/* Grouped list */}
      {grouped.map(([groupLabel, plans]) => (
        <section key={groupLabel} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-loog-muted">
            {groupLabel} <span className="ml-1 rounded bg-loog-panel px-2 py-0.5 text-[10px] text-white/70">{plans.length}</span>
          </h2>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {plans.map((p) => (
              <article
                key={p.id}
                className="group rounded-xl border border-loog-border bg-loog-panel p-4 transition hover:border-loog-brand/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-lg font-bold text-white">{p.name}</h3>
                      {p.favorite && <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300">⭐ FAV</span>}
                      {!p.active && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300">INATIVO</span>}
                      {p.source === "pesados-026" && (
                        <span
                          className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-amber-300"
                          title="Tabela de pesados (026 - Planos.xlsx) com markup +10% aplicado"
                        >
                          🚛 PESADOS · +10%
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-loog-muted">
                      <code className="text-white/60">{p.slug}</code>
                      {p.source === "pesados-026" && p.monthly_cents_original != null && (
                        <span className="ml-2 text-amber-300/70">
                          original: {brl(p.monthly_cents_original)} → +10% = {brl(p.monthly_cents)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-xl font-bold text-loog-brand">{brl(p.monthly_cents)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-loog-muted">mensal</div>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-loog-muted">Faixa FIPE</dt>
                  <dd className="text-right text-white">
                    {brl(p.min_fipe_cents)} → {p.max_fipe_cents ? brl(p.max_fipe_cents) : "∞"}
                  </dd>
                  <dt className="text-loog-muted">Participação</dt>
                  <dd className="text-right text-white">{participation(p)}</dd>
                  <dt className="text-loog-muted">Limite idade</dt>
                  <dd className="text-right text-white">{p.year_limit ? `${p.year_limit} anos` : "sem limite"}</dd>
                  <dt className="text-loog-muted">Vende no site</dt>
                  <dd className="text-right text-white">{p.sell_on_site ? "✅" : "❌"}</dd>
                </dl>

                {p.extras && (
                  <p className="mt-3 line-clamp-2 text-[11px] italic text-loog-muted" title={p.extras}>
                    {p.extras}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {grouped.length === 0 && (
        <div className="rounded-xl border border-dashed border-loog-border p-10 text-center">
          <p className="text-loog-muted">Nenhum plano encontrado com esses filtros.</p>
        </div>
      )}
    </div>
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
