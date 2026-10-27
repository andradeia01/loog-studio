"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/errors/api-fetch";

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
  const [plans, setPlans] = useState<PlanRow[]>(initial);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const applyUpdate = (updated: PlanRow) => {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleSave = async (patch: Partial<PlanRow>) => {
    if (!editing) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/admin/plans/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? json?.error ?? "Falha ao salvar");
      applyUpdate(json.plan as PlanRow);
      setEditing(null);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setSaving(false);
    }
  };

  const groups = useMemo(() => Array.from(new Set(plans.map((p) => p.group_name))), [plans]);
  const types = useMemo(() => Array.from(new Set(plans.map((p) => p.vehicle_type))), [plans]);
  const sources = useMemo(() => Array.from(new Set(plans.map((p) => p.source ?? "leves-oficial"))), [plans]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return plans.filter((p) => {
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
  }, [plans, search, typeFilter, groupFilter, sourceFilter]);

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

  const totalActive = plans.filter((p) => p.active).length;

  return (
    <div className="space-y-6">
      {/* HERO — explica o modelo mental pro admin */}
      <section className="rounded-xl border border-loog-brand/40 bg-loog-brand/5 p-4">
        <h3 className="text-sm font-bold text-white">📖 Como ler esta tela</h3>
        <p className="mt-1 text-xs text-loog-muted">
          Cada <b className="text-white">PLANO</b> é uma linha da tabela de preços LOOG. Quando o consultor cota uma placa,
          o sistema escolhe o plano certo baseado em 4 critérios:
        </p>
        <ol className="mt-2 grid gap-2 text-[11px] sm:grid-cols-4">
          <li className="rounded-lg border border-loog-border bg-loog-panel/60 p-2">
            <div className="font-bold text-emerald-300">1 · TIPO</div>
            <div className="text-loog-muted">🚗 Carro, 🏍️ Moto, 🛻 Pickup, ⚡ Elétrico, 🚛 Caminhão</div>
          </li>
          <li className="rounded-lg border border-loog-border bg-loog-panel/60 p-2">
            <div className="font-bold text-emerald-300">2 · FONTE</div>
            <div className="text-loog-muted"><code>leves-oficial</code> = Planos.xlsx · <code>pesados-026</code> = caminhões (+10%)</div>
          </li>
          <li className="rounded-lg border border-loog-border bg-loog-panel/60 p-2">
            <div className="font-bold text-emerald-300">3 · FAIXA FIPE</div>
            <div className="text-loog-muted">Qual intervalo de preço FIPE o plano cobre (ex: R$ 300k - R$ 900k)</div>
          </li>
          <li className="rounded-lg border border-loog-border bg-loog-panel/60 p-2">
            <div className="font-bold text-emerald-300">4 · PARTICIPAÇÃO</div>
            <div className="text-loog-muted">% ou valor fixo que o cliente paga em caso de perda</div>
          </li>
        </ol>
        <p className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          ⚠ <b>Mexer no valor mensal muda a cotação em TEMPO REAL</b> no Studio. Toda cotação feita depois usa o novo valor.
          Use o filtro de fonte pra ver só caminhões ou só leves.
        </p>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total planos" value={plans.length} />
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
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="mt-1 text-[10px] text-loog-muted hover:text-loog-brand underline underline-offset-2"
                    >
                      ✏️ editar
                    </button>
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

      {editing && (
        <PlanEditor
          plan={editing}
          saving={saving}
          errorMsg={errorMsg}
          onClose={() => { setEditing(null); setErrorMsg(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function PlanEditor({
  plan, saving, errorMsg, onClose, onSave,
}: {
  plan: PlanRow;
  saving: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onSave: (patch: Partial<PlanRow>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<PlanRow>>({
    name: plan.name,
    group_name: plan.group_name,
    min_fipe_cents: plan.min_fipe_cents,
    max_fipe_cents: plan.max_fipe_cents,
    monthly_cents: plan.monthly_cents,
    participation_type: plan.participation_type,
    participation_value: plan.participation_value,
    year_limit: plan.year_limit,
    active: plan.active,
    favorite: plan.favorite,
    sell_on_site: plan.sell_on_site,
    installments: plan.installments,
    monthly_includes_adhesion: plan.monthly_includes_adhesion,
    extras: plan.extras,
    acrescimos: plan.acrescimos,
  });

  const update = <K extends keyof PlanRow>(k: K, v: PlanRow[K] | undefined) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Converters UI (R$ 34.90) ↔ storage (cents)
  const brlInputToCents = (v: string): number => {
    const digits = v.replace(/[^\d,]/g, "").replace(",", ".");
    const n = Number(digits);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };
  const centsToStr = (c: number | null | undefined): string => c == null ? "" : (c / 100).toFixed(2);

  // Participation value show as pct (if percent_bp) or R$ (if fixed_cents)
  const partValueDisplay = form.participation_type === "percent_bp"
    ? ((form.participation_value ?? 0) / 100).toFixed(2)
    : centsToStr(form.participation_value as number);

  // Diff helpers — mostra em VERMELHO/VERDE quando valor mudou
  const changed = <K extends keyof PlanRow>(k: K): boolean => form[k] !== plan[k];
  const mensalDeltaPct = form.monthly_cents != null && plan.monthly_cents > 0
    ? ((form.monthly_cents - plan.monthly_cents) / plan.monthly_cents) * 100
    : 0;

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-loog-border bg-loog-bg p-5 shadow-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-bold text-white">Editar plano</h3>
            <p className="mt-1 text-xs text-loog-muted">
              <code className="rounded bg-loog-panel px-1.5 py-0.5 text-white/80">{plan.slug}</code>
            </p>
            {/* Contexto do plano — categoria/fonte/grupo/faixa */}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded border border-loog-border bg-loog-panel/60 px-2 py-1">
                <div className="text-[9px] uppercase tracking-wider text-loog-muted">tipo</div>
                <div className="text-xs font-semibold text-white">{TYPE_EMOJI[plan.vehicle_type]} {plan.vehicle_type_label}</div>
              </div>
              <div className="rounded border border-loog-border bg-loog-panel/60 px-2 py-1">
                <div className="text-[9px] uppercase tracking-wider text-loog-muted">fonte</div>
                <div className="text-xs font-semibold text-white">{plan.source === "pesados-026" ? "🚛 pesados-026" : "🚗 leves-oficial"}</div>
              </div>
              <div className="rounded border border-loog-border bg-loog-panel/60 px-2 py-1">
                <div className="text-[9px] uppercase tracking-wider text-loog-muted">grupo</div>
                <div className="truncate text-xs font-semibold text-white" title={plan.group_name}>{plan.group_name}</div>
              </div>
              <div className="rounded border border-loog-border bg-loog-panel/60 px-2 py-1">
                <div className="text-[9px] uppercase tracking-wider text-loog-muted">mensal atual</div>
                <div className="text-xs font-semibold text-loog-brand">{brl(plan.monthly_cents)}</div>
              </div>
            </div>
            {/* Diff visual quando mensal mudou */}
            {changed("monthly_cents") && (
              <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${mensalDeltaPct > 0 ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"}`}>
                <b>Mensal mudará:</b> <s>{brl(plan.monthly_cents)}</s> → <b>{brl(form.monthly_cents as number)}</b>
                <span className="ml-2">({mensalDeltaPct >= 0 ? "+" : ""}{mensalDeltaPct.toFixed(1)}%)</span>
                <div className="mt-0.5 text-[10px] text-loog-muted">
                  Impacto: toda cotação de {plan.vehicle_type_label} na faixa {brl(plan.min_fipe_cents)}–{plan.max_fipe_cents ? brl(plan.max_fipe_cents) : "∞"} vai usar o novo valor imediatamente.
                </div>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-loog-muted hover:text-white">✕</button>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome do plano">
            <input className="input" value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} />
          </Field>
          <Field label="Grupo">
            <input className="input" value={form.group_name ?? ""} onChange={(e) => update("group_name", e.target.value)} />
          </Field>

          <Field label="Faixa FIPE mínima (R$)">
            <input className="input" value={centsToStr(form.min_fipe_cents as number)} onChange={(e) => update("min_fipe_cents", brlInputToCents(e.target.value))} inputMode="decimal" />
          </Field>
          <Field label="Faixa FIPE máxima (R$)">
            <input
              className="input"
              value={centsToStr(form.max_fipe_cents as number | null)}
              onChange={(e) => update("max_fipe_cents", e.target.value ? brlInputToCents(e.target.value) : null)}
              inputMode="decimal"
              placeholder="(vazio = sem teto)"
            />
          </Field>

          <Field label="Mensalidade (R$)">
            <input className="input" value={centsToStr(form.monthly_cents as number)} onChange={(e) => update("monthly_cents", brlInputToCents(e.target.value))} inputMode="decimal" />
          </Field>
          <Field label="Limite idade do veículo (anos)">
            <input className="input" type="number" min={0} max={150}
              value={(form.year_limit ?? "") as number | ""}
              onChange={(e) => update("year_limit", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>

          <Field label="Tipo de participação">
            <select className="input" value={form.participation_type} onChange={(e) => update("participation_type", e.target.value as PlanRow["participation_type"])}>
              <option value="percent_bp">Percentual (% do teto)</option>
              <option value="fixed_cents">Valor fixo (R$)</option>
            </select>
          </Field>
          <Field label={form.participation_type === "percent_bp" ? "Participação (%)" : "Participação (R$)"}>
            <input className="input" value={partValueDisplay}
              onChange={(e) => {
                const n = Number(e.target.value.replace(",", "."));
                if (!Number.isFinite(n)) return;
                update("participation_value", form.participation_type === "percent_bp" ? Math.round(n * 100) : Math.round(n * 100));
              }}
              inputMode="decimal"
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          <Toggle label="Ativo" checked={!!form.active} onChange={(v) => update("active", v)} />
          <Toggle label="Favorito" checked={!!form.favorite} onChange={(v) => update("favorite", v)} />
          <Toggle label="Vende no site" checked={!!form.sell_on_site} onChange={(v) => update("sell_on_site", v)} />
          <Toggle label="Parcelado" checked={!!form.installments} onChange={(v) => update("installments", v)} />
          <Toggle label="Mensal inclui adesão" checked={!!form.monthly_includes_adhesion} onChange={(v) => update("monthly_includes_adhesion", v)} />
        </div>

        <Field label="Benefícios (extras)">
          <textarea className="input min-h-[80px]" value={form.extras ?? ""} onChange={(e) => update("extras", e.target.value)} />
        </Field>

        {errorMsg && <p className="mt-3 rounded bg-red-500/15 px-3 py-2 text-sm text-red-200">{errorMsg}</p>}

        <footer className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-loog-border px-4 py-2 text-sm text-loog-muted hover:text-white">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(form)}
            className="rounded-lg bg-loog-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "Salvando..." : "💾 Salvar alterações"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-loog-muted">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-loog-border bg-loog-panel px-3 py-1.5 text-xs text-white">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5" />
      {label}
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
