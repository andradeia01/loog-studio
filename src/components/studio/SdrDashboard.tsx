"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Periodo = "hoje" | "ontem" | "semana" | "mes" | "total";

interface Bucket {
  leads: number;
  cotacoes: number;
  valorCotado: number;
  valorCotadoFormatado: string;
  handoffs: number;
  negociando: number;
}

interface Metrics {
  hoje: Bucket;
  ontem: Bucket;
  semana: Bucket;
  mes: Bucket;
  total: Bucket & { ganhos: number };
  taxaConversao: number;
}

const PERIODOS: { k: Periodo; lb: string; full: string }[] = [
  { k: "hoje", lb: "Hoje", full: "HOJE" },
  { k: "ontem", lb: "Ontem", full: "ONTEM" },
  { k: "semana", lb: "7 dias", full: "ÚLTIMOS 7 DIAS" },
  { k: "mes", lb: "Mês", full: "ÚLTIMOS 30 DIAS" },
  { k: "total", lb: "Total", full: "TOTAL" },
];

export function SdrDashboard() {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("hoje");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/sdr/metrics");
        if (!r.ok) return;
        const data = (await r.json()) as Metrics;
        if (alive) setM(data);
      } catch { /* silencioso */ }
      finally { if (alive) setLoading(false); }
    };
    load();
    const t = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (loading && !m) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-40 rounded-3xl bg-loog-panel/50" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-2xl bg-loog-panel/40" />)}
        </div>
      </div>
    );
  }
  if (!m) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200">
        Não foi possível carregar as métricas.
      </div>
    );
  }

  const period = m[periodo];
  const label = PERIODOS.find((p) => p.k === periodo)?.full ?? "";

  return (
    <div className="space-y-5">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-loog-panel p-5 shadow-[0_0_60px_rgba(16,185,129,0.15)] sm:p-6">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
              💰 Faturamento potencial · {label}
            </span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={periodo}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="font-display text-4xl font-black leading-none text-white sm:text-5xl md:text-6xl"
            >
              {period.valorCotadoFormatado}
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-emerald-200/80">
            <span>📄 {period.cotacoes} cotação{period.cotacoes === 1 ? "" : "ões"}</span>
            <span>·</span>
            <span>👥 {period.leads} lead{period.leads === 1 ? "" : "s"}</span>
            {m.taxaConversao > 0 && (
              <>
                <span>·</span>
                <span>⚡ {m.taxaConversao}% conversão</span>
              </>
            )}
          </div>
          {/* Period switch */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {PERIODOS.map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setPeriodo(o.k)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-bold transition",
                  periodo === o.k
                    ? "border-emerald-400 bg-emerald-500 text-black"
                    : "border-emerald-500/30 bg-black/30 text-emerald-200/60 hover:text-emerald-100",
                )}
              >
                {o.lb}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon="👥" label="Leads" value={period.leads} color="from-blue-500/20 to-blue-500/5" ringColor="border-blue-500/40" textColor="text-blue-300" />
        <MetricCard icon="📄" label="Cotações" value={period.cotacoes} color="from-emerald-500/20 to-emerald-500/5" ringColor="border-emerald-500/40" textColor="text-emerald-300" />
        <MetricCard icon="🚨" label="Pra fechar" value={period.handoffs} color="from-rose-500/20 to-rose-500/5" ringColor="border-rose-500/40" textColor="text-rose-300" highlight={period.handoffs > 0} />
        {periodo === "total" ? (
          <MetricCard icon="🏆" label="Fechados" value={m.total.ganhos} color="from-yellow-500/20 to-yellow-500/5" ringColor="border-yellow-500/40" textColor="text-yellow-300" />
        ) : periodo === "hoje" || periodo === "ontem" ? (
          <MetricCard icon="💬" label="Negociando" value={period.negociando} color="from-amber-500/20 to-amber-500/5" ringColor="border-amber-500/40" textColor="text-amber-300" />
        ) : (
          <MetricCard icon="⚡" label="Conversão" value={m.taxaConversao} suffix="%" color="from-purple-500/20 to-purple-500/5" ringColor="border-purple-500/40" textColor="text-purple-300" />
        )}
      </div>

      {/* VISÃO GERAL SEMPRE */}
      <div className="rounded-2xl border border-loog-border bg-loog-panel/40 p-4">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
          📈 Visão geral (sempre)
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="font-display text-xl font-black text-white sm:text-2xl">{m.total.leads}</div>
            <div className="text-[10px] text-loog-muted">leads totais</div>
          </div>
          <div>
            <div className="font-display text-xl font-black text-emerald-300 sm:text-2xl">{m.total.cotacoes}</div>
            <div className="text-[10px] text-loog-muted">cotações</div>
          </div>
          <div>
            <div className="font-display text-xl font-black text-rose-300 sm:text-2xl">{m.total.handoffs}</div>
            <div className="text-[10px] text-loog-muted">handoffs</div>
          </div>
          <div>
            <div className="font-display text-xl font-black text-yellow-300 sm:text-2xl">{m.total.ganhos}</div>
            <div className="text-[10px] text-loog-muted">fechados</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-loog-border bg-loog-panel/30 p-3 text-center text-[10px] text-loog-muted">
        🔄 Atualiza a cada 15 segundos · dados em tempo real do Hub LOOG
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, suffix, color, ringColor, textColor, highlight }: {
  icon: string;
  label: string;
  value: number;
  suffix?: string;
  color: string;
  ringColor: string;
  textColor: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 transition",
      ringColor, color,
      highlight && "ring-2 ring-rose-500/50",
    )}>
      <div className="text-2xl">{icon}</div>
      <div className={cn("mt-2 font-display text-3xl font-black leading-none sm:text-4xl", textColor)}>
        {value}{suffix ?? ""}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
        {label}
      </div>
    </div>
  );
}
