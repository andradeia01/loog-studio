"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface Breakdown {
  source: string;
  medium: string;
  campaign: string;
  total: number;
  fechados: number;
  perdidos: number;
  ativos: number;
  quentes: number;
  taxa_conversao: number;
}

interface Totais {
  leads: number;
  fechados: number;
  perdidos: number;
  ativos: number;
  quentes: number;
  por_facebook: number;
  por_google: number;
  direto_organico: number;
}

const PERIODOS = [
  { d: 1,  label: "Hoje" },
  { d: 7,  label: "7 dias" },
  { d: 30, label: "30 dias" },
  { d: 90, label: "90 dias" },
  { d: 0,  label: "Tudo" },
];

export function LeadsTrafegoReport() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<{ totais: Totais; breakdown: Breakdown[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = period > 0 ? `?days=${period}` : "";
      const r = await fetch(`/api/admin/leads-trafego${q}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setData({ totais: j.totais, breakdown: j.breakdown });
    } catch { /* silencioso */ } finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const topCampanhas = useMemo(() => (data?.breakdown ?? []).slice(0, 15), [data]);

  if (loading && !data) return <div className="rounded-xl border border-loog-border bg-loog-panel/40 p-8 text-center text-loog-muted">Carregando relatório...</div>;
  if (!data) return <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-red-200">Falha ao carregar relatório.</div>;

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.d}
            type="button"
            onClick={() => setPeriod(p.d)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition",
              period === p.d
                ? "border-loog-brand bg-loog-brand/15 text-loog-brand"
                : "border-loog-border bg-loog-panel/60 text-loog-muted hover:text-white",
            )}
          >{p.label}</button>
        ))}
      </div>

      {/* Totais grandes */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBig label="Total leads"      value={data.totais.leads} />
        <StatBig label="Fechados"         value={data.totais.fechados} highlight="emerald" sub={data.totais.leads > 0 ? `${Math.round(100 * data.totais.fechados / data.totais.leads)}% conversão` : ""} />
        <StatBig label="Quentes"          value={data.totais.quentes} highlight="red" />
        <StatBig label="Em negociação"    value={data.totais.ativos} />
      </div>

      {/* Breakdown por fonte macro */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SourceCard label="📘 Meta/Facebook" value={data.totais.por_facebook} total={data.totais.leads} color="blue" />
        <SourceCard label="🅖 Google"        value={data.totais.por_google} total={data.totais.leads} color="emerald" />
        <SourceCard label="🌱 Direto/Orgânico" value={data.totais.direto_organico} total={data.totais.leads} color="amber" />
      </div>

      {/* Tabela detalhada por campanha */}
      <div className="rounded-xl border border-loog-border bg-loog-panel/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Top campanhas · {period === 0 ? "tudo" : `últimos ${period}d`}</h3>
          <span className="text-xs text-loog-muted">{data.breakdown.length} combinações source×medium×campaign</span>
        </div>
        {topCampanhas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-loog-border p-6 text-center text-xs text-loog-muted">
            Nenhum lead no período. Rode campanhas com UTM pra popular o relatório.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-loog-border/60 text-left text-[11px] uppercase tracking-wider text-loog-muted">
                <tr>
                  <th className="py-2">Fonte</th>
                  <th>Mídia</th>
                  <th>Campanha</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right">Quentes</th>
                  <th className="text-right">Fechados</th>
                  <th className="text-right">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {topCampanhas.map((b, i) => (
                  <tr key={i} className="border-b border-loog-border/30 text-xs">
                    <td className="py-2 font-semibold text-white">{b.source}</td>
                    <td className="text-loog-muted">{b.medium}</td>
                    <td className="max-w-[280px] truncate text-loog-muted" title={b.campaign}>{b.campaign}</td>
                    <td className="text-right font-bold text-white">{b.total}</td>
                    <td className="text-right text-red-300">{b.quentes}</td>
                    <td className="text-right text-emerald-300">{b.fechados}</td>
                    <td className="text-right font-bold">
                      <span className={cn(
                        b.taxa_conversao >= 20 ? "text-emerald-300"
                        : b.taxa_conversao >= 10 ? "text-amber-300"
                        : "text-loog-muted"
                      )}>{b.taxa_conversao}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-loog-muted">
        💡 Pra popular esse relatório, suas campanhas precisam enviar os <code>utm_source/medium/campaign</code> na URL
        (ex: <code>loogstudio.netlify.app/?utm_source=facebook&amp;utm_campaign=mercosul-outubro</code>).
        O LOOG Studio captura automaticamente e amarra em cada cotação que o lead faz.
        Facebook click id (<code>fbclid</code>) e Google click id (<code>gclid</code>) também são capturados.
      </p>
    </div>
  );
}

function StatBig({ label, value, sub, highlight }: { label: string; value: number; sub?: string; highlight?: "red" | "emerald" | "amber" }) {
  const cls = highlight === "red" ? "border-red-500/40 bg-red-500/10"
    : highlight === "emerald" ? "border-emerald-500/40 bg-emerald-500/10"
    : highlight === "amber" ? "border-amber-500/40 bg-amber-500/10"
    : "border-loog-border bg-loog-panel/70";
  return (
    <div className={cn("rounded-xl border p-4", cls)}>
      <div className="font-display text-3xl font-extrabold text-white">{value.toLocaleString("pt-BR")}</div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-loog-muted">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-white/80">{sub}</div>}
    </div>
  );
}

function SourceCard({ label, value, total, color }: { label: string; value: number; total: number; color: "blue" | "emerald" | "amber" }) {
  const pct = total > 0 ? Math.round(100 * value / total) : 0;
  const cls = color === "blue" ? "border-blue-500/40 bg-blue-500/5"
    : color === "emerald" ? "border-emerald-500/40 bg-emerald-500/5"
    : "border-amber-500/40 bg-amber-500/5";
  return (
    <div className={cn("rounded-xl border p-4", cls)}>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-2xl font-bold text-white">{value}</span>
        <span className="text-xs text-loog-muted">{pct}%</span>
      </div>
      <div className="mt-1 text-xs font-semibold text-white">{label}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
        <div className={cn(
          "h-full rounded-full",
          color === "blue" ? "bg-blue-500"
          : color === "emerald" ? "bg-emerald-500"
          : "bg-amber-500"
        )} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
