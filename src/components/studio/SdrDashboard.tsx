"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Periodo = "hoje" | "ontem" | "semana" | "mes" | "total" | "data";
type Secao = "sdr" | "studio";

interface SdrBucket {
  leads: number;
  cotacoes: number;
  valorCotado: number;
  valorCotadoFormatado: string;
  handoffs: number;
  negociando: number;
}

interface SdrMetrics {
  hoje: SdrBucket;
  ontem: SdrBucket;
  semana: SdrBucket;
  mes: SdrBucket;
  total: SdrBucket & { ganhos: number };
  data?: SdrBucket | null;
  dataEspecifica?: string | null;
  taxaConversao: number;
}

interface StudioBucket {
  cotacoes: number;
  oportunidade: number;
  oportunidadeFormatada: string;
}

interface Consultor { id: string; nome: string; cotacoes: number; oportunidade: number; oportunidadeFormatada: string }
interface StudioMetrics {
  hoje: StudioBucket;
  ontem: StudioBucket;
  semana: StudioBucket;
  mes: StudioBucket;
  total: StudioBucket;
  data: StudioBucket | null;
  dataEspecifica: string | null;
  rankings: {
    hoje: Consultor[]; ontem: Consultor[]; semana: Consultor[]; mes: Consultor[]; total: Consultor[]; data: Consultor[];
  };
  topConsultores: Consultor[]; // compat
}

const plural = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

const PERIODOS: { k: Exclude<Periodo, "data">; lb: string; full: string }[] = [
  { k: "hoje", lb: "Hoje", full: "HOJE" },
  { k: "ontem", lb: "Ontem", full: "ONTEM" },
  { k: "semana", lb: "7 dias", full: "ÚLTIMOS 7 DIAS" },
  { k: "mes", lb: "Mês", full: "ÚLTIMOS 30 DIAS" },
  { k: "total", lb: "Total", full: "TOTAL" },
];

export function SdrDashboard() {
  const [sdr, setSdr] = useState<SdrMetrics | null>(null);
  const [studio, setStudio] = useState<StudioMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [secao, setSecao] = useState<Secao>("sdr");
  const [dataEspecifica, setDataEspecifica] = useState<string>(""); // YYYY-MM-DD

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const q = dataEspecifica ? `?date=${encodeURIComponent(dataEspecifica)}` : "";
        const [a, b] = await Promise.all([
          fetch(`/api/sdr/metrics${q}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/sdr/studio-metrics${q}`).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (!alive) return;
        if (a) setSdr(a as SdrMetrics);
        if (b) setStudio(b as StudioMetrics);
      } catch { /* silencioso */ }
      finally { if (alive) setLoading(false); }
    };
    load();
    const t = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, [dataEspecifica]);

  if (loading && !sdr && !studio) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-40 rounded-3xl bg-loog-panel/50" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-2xl bg-loog-panel/40" />)}
        </div>
      </div>
    );
  }

  // Quando usuário escolhe data, pula pro período "data"
  const handlePickDate = (v: string) => {
    setDataEspecifica(v);
    if (v) setPeriodo("data");
    else if (periodo === "data") setPeriodo("hoje");
  };

  return (
    <div className="space-y-5">
      {/* TOGGLE SDR | STUDIO GERAL */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-full border border-loog-border bg-loog-panel/50 p-1">
          <button
            type="button"
            onClick={() => setSecao("sdr")}
            className={cn(
              "rounded-full px-5 py-2 text-xs font-bold uppercase tracking-widest transition",
              secao === "sdr"
                ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-black shadow-lg"
                : "text-loog-muted hover:text-white",
            )}
          >
            💬 SDR
          </button>
          <button
            type="button"
            onClick={() => setSecao("studio")}
            className={cn(
              "rounded-full px-5 py-2 text-xs font-bold uppercase tracking-widest transition",
              secao === "studio"
                ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-black shadow-lg"
                : "text-loog-muted hover:text-white",
            )}
          >
            🏢 Studio Geral
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {secao === "sdr" ? (
          <motion.div
            key="sdr"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {sdr ? <SdrSection m={sdr} periodo={periodo} setPeriodo={setPeriodo} dataEspecifica={dataEspecifica} setDataEspecifica={handlePickDate} /> : <ErroCard />}
          </motion.div>
        ) : (
          <motion.div
            key="studio"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            {studio
              ? <StudioSection
                  m={studio}
                  periodo={periodo}
                  setPeriodo={setPeriodo}
                  dataEspecifica={dataEspecifica}
                  setDataEspecifica={handlePickDate}
                />
              : <ErroCard />}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-xl border border-loog-border bg-loog-panel/30 p-3 text-center text-[10px] text-loog-muted">
        🔄 Atualiza a cada 15 segundos · dados em tempo real
      </div>
    </div>
  );
}

function ErroCard() {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200">
      Não foi possível carregar as métricas desta seção.
    </div>
  );
}

function SdrSection({ m, periodo, setPeriodo, dataEspecifica, setDataEspecifica }: {
  m: SdrMetrics;
  periodo: Periodo;
  setPeriodo: (p: Periodo) => void;
  dataEspecifica: string;
  setDataEspecifica: (v: string) => void;
}) {
  const period: SdrBucket = useMemo(() => {
    if (periodo === "data") return m.data ?? { leads: 0, cotacoes: 0, valorCotado: 0, valorCotadoFormatado: "R$ 0,00", handoffs: 0, negociando: 0 };
    return m[periodo];
  }, [m, periodo]);
  const label = useMemo(() => {
    if (periodo === "data" && dataEspecifica) {
      const [y, mo, d] = dataEspecifica.split("-");
      return `${d}/${mo}/${y.slice(2)}`;
    }
    return PERIODOS.find((p) => p.k === periodo)?.full ?? "";
  }, [periodo, dataEspecifica]);
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-loog-panel p-5 shadow-[0_0_60px_rgba(16,185,129,0.15)] sm:p-6">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
              💰 Faturamento potencial SDR · {label}
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
            <span>📄 {plural(period.cotacoes, "cotação", "cotações")}</span>
            <span>·</span>
            <span>👥 {plural(period.leads, "lead", "leads")}</span>
            {m.taxaConversao > 0 && (
              <>
                <span>·</span>
                <span>⚡ {m.taxaConversao}% conversão</span>
              </>
            )}
          </div>
          <PeriodoSwitch
            periodo={periodo}
            setPeriodo={setPeriodo}
            tema="emerald"
            dataEspecifica={dataEspecifica}
            setDataEspecifica={setDataEspecifica}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon="👥" label="Leads" value={period.leads} color="from-blue-500/20 to-blue-500/5" ringColor="border-blue-500/40" textColor="text-blue-300" />
        <MetricCard icon="📄" label="Cotações" value={period.cotacoes} color="from-emerald-500/20 to-emerald-500/5" ringColor="border-emerald-500/40" textColor="text-emerald-300" />
        <MetricCard icon="🚨" label="Pra fechar" value={period.handoffs} color="from-rose-500/20 to-rose-500/5" ringColor="border-rose-500/40" textColor="text-rose-300" highlight={period.handoffs > 0} />
        {periodo === "total" ? (
          <MetricCard icon="🏆" label="Fechados" value={m.total.ganhos} color="from-yellow-500/20 to-yellow-500/5" ringColor="border-yellow-500/40" textColor="text-yellow-300" />
        ) : periodo === "hoje" || periodo === "ontem" || periodo === "data" ? (
          <MetricCard icon="💬" label="Negociando" value={period.negociando} color="from-amber-500/20 to-amber-500/5" ringColor="border-amber-500/40" textColor="text-amber-300" />
        ) : (
          <MetricCard icon="⚡" label="Conversão" value={m.taxaConversao} suffix="%" color="from-purple-500/20 to-purple-500/5" ringColor="border-purple-500/40" textColor="text-purple-300" />
        )}
      </div>

      <div className="rounded-2xl border border-loog-border bg-loog-panel/40 p-4">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
          📈 Visão geral SDR (acumulado)
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
    </div>
  );
}

function StudioSection({ m, periodo, setPeriodo, dataEspecifica, setDataEspecifica }: {
  m: StudioMetrics;
  periodo: Periodo;
  setPeriodo: (p: Periodo) => void;
  dataEspecifica: string;
  setDataEspecifica: (v: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  // Qual bucket + ranking usar baseado no período
  const period: StudioBucket = useMemo(() => {
    if (periodo === "data") return m.data ?? { cotacoes: 0, oportunidade: 0, oportunidadeFormatada: "R$ 0,00" };
    return m[periodo];
  }, [m, periodo]);

  const ranking: Consultor[] = useMemo(() => {
    const r = m.rankings?.[periodo as keyof typeof m.rankings] ?? m.topConsultores ?? [];
    return r as Consultor[];
  }, [m, periodo]);

  const label = useMemo(() => {
    if (periodo === "data" && dataEspecifica) {
      const [y, mo, d] = dataEspecifica.split("-");
      return `${d}/${mo}/${y.slice(2)}`;
    }
    return PERIODOS.find((p) => p.k === periodo)?.full ?? "";
  }, [periodo, dataEspecifica]);

  const rankingParaMostrar = showAll ? ranking : ranking.slice(0, 5);
  const topValue = ranking[0]?.oportunidade ?? 0;

  return (
    <div className="space-y-5">
      {/* HERO STUDIO */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-br from-amber-500/20 via-yellow-600/10 to-loog-panel p-5 shadow-[0_0_60px_rgba(245,158,11,0.15)] sm:p-6">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
              💰 Faturamento potencial Studio · {label}
            </span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${periodo}-${dataEspecifica}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="font-display text-4xl font-black leading-none text-white sm:text-5xl md:text-6xl"
            >
              {period.oportunidadeFormatada}
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-amber-200/80">
            <span>📄 {plural(period.cotacoes, "cotação", "cotações")}</span>
            <span>·</span>
            <span>👥 {ranking.length === 1 ? "1 consultor ativo" : `${ranking.length} consultores ativos`}</span>
          </div>
          <PeriodoSwitch
            periodo={periodo}
            setPeriodo={setPeriodo}
            tema="amber"
            dataEspecifica={dataEspecifica}
            setDataEspecifica={setDataEspecifica}
          />
        </div>
      </div>

      {/* CARDS STUDIO */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard icon="📄" label="Cotações" value={period.cotacoes} color="from-amber-500/20 to-amber-500/5" ringColor="border-amber-500/40" textColor="text-amber-300" />
        <MetricCard icon="💰" label="Faturamento potencial" value={period.oportunidadeFormatada} isText color="from-emerald-500/20 to-emerald-500/5" ringColor="border-emerald-500/40" textColor="text-emerald-300" />
        <MetricCard icon="📊" label="Ticket médio" value={period.cotacoes > 0 ? `R$ ${(period.oportunidade / period.cotacoes / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—"} isText color="from-blue-500/20 to-blue-500/5" ringColor="border-blue-500/40" textColor="text-blue-300" />
      </div>

      {/* RANKING */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-loog-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
            🏆 Ranking · {label}
          </span>
          {ranking.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="rounded-full border border-amber-500/30 bg-black/30 px-3 py-1 text-[10px] font-bold text-amber-200 transition hover:text-amber-100"
            >
              {showAll ? "Ver só top 5" : `Ver todos (${ranking.length})`}
            </button>
          )}
        </div>
        {ranking.length === 0 ? (
          <div className="rounded-xl border border-loog-border bg-loog-panel/30 p-6 text-center text-xs text-loog-muted">
            Nenhuma cotação neste período.
          </div>
        ) : (
          <div className="space-y-2">
            {rankingParaMostrar.map((c, i) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`;
              const barWidth = topValue > 0 ? (c.oportunidade / topValue) * 100 : 0;
              return (
                <div key={c.id} className="relative overflow-hidden rounded-xl border border-loog-border bg-loog-panel/60 p-3">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500/20 to-transparent"
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-display text-lg font-black">{medal}</span>
                      <div>
                        <div className="font-semibold text-white">{c.nome}</div>
                        <div className="text-[10px] text-loog-muted">{plural(c.cotacoes, "cotação", "cotações")}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-black text-amber-300">{c.oportunidadeFormatada}</div>
                      <div className="text-[10px] text-loog-muted">em faturamento potencial</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* VISÃO GERAL STUDIO */}
      <div className="rounded-2xl border border-loog-border bg-loog-panel/40 p-4">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
          📈 Visão geral Studio (desde 01/out/26 · só cotações manuais, exclui IA)
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="font-display text-xl font-black text-amber-300 sm:text-2xl">{m.total.cotacoes}</div>
            <div className="text-[10px] text-loog-muted">cotações manuais</div>
          </div>
          <div>
            <div className="font-display text-xl font-black text-emerald-300 sm:text-2xl">{m.total.oportunidadeFormatada}</div>
            <div className="text-[10px] text-loog-muted">faturamento potencial</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PeriodoSwitch({ periodo, setPeriodo, tema, dataEspecifica, setDataEspecifica }: {
  periodo: Periodo;
  setPeriodo: (p: Periodo) => void;
  tema: "emerald" | "amber";
  dataEspecifica?: string;
  setDataEspecifica?: (v: string) => void;
}) {
  const isEmerald = tema === "emerald";
  const pillActive = isEmerald ? "border-emerald-400 bg-emerald-500 text-black" : "border-amber-400 bg-amber-500 text-black";
  const pillIdle = isEmerald
    ? "border-emerald-500/30 bg-black/30 text-emerald-200/60 hover:text-emerald-100"
    : "border-amber-500/30 bg-black/30 text-amber-200/60 hover:text-amber-100";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      {PERIODOS.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => setPeriodo(o.k)}
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-bold transition",
            periodo === o.k ? pillActive : pillIdle,
          )}
        >
          {o.lb}
        </button>
      ))}
      {setDataEspecifica && (
        <label className={cn(
          "flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold transition cursor-pointer",
          periodo === "data" ? pillActive : pillIdle,
        )}>
          📅
          <input
            type="date"
            value={dataEspecifica ?? ""}
            onChange={(e) => setDataEspecifica(e.target.value)}
            className="bg-transparent text-[11px] font-bold uppercase outline-none [color-scheme:dark]"
            style={{ minWidth: 110 }}
          />
          {dataEspecifica && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setDataEspecifica(""); }}
              className="ml-1 text-[10px] opacity-70 hover:opacity-100"
              title="Limpar filtro"
            >
              ✕
            </button>
          )}
        </label>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, suffix, color, ringColor, textColor, highlight, isText }: {
  icon: string;
  label: string;
  value: number | string;
  suffix?: string;
  color: string;
  ringColor: string;
  textColor: string;
  highlight?: boolean;
  isText?: boolean;
}) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 transition",
      ringColor, color,
      highlight && "ring-2 ring-rose-500/50",
    )}>
      <div className="text-2xl">{icon}</div>
      <div className={cn(
        "mt-2 font-display font-black leading-none",
        isText ? "text-lg sm:text-xl" : "text-3xl sm:text-4xl",
        textColor,
      )}>
        {value}{suffix ?? ""}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
        {label}
      </div>
    </div>
  );
}
