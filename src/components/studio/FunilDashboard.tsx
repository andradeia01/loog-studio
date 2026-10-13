"use client";

/**
 * FunilDashboard — v0 estática com dados reais da semana 06-13/10/2026.
 * Próxima iteração: ler de tabelas fact_* no Supabase, alimentadas por sync diário.
 * Views: admin vê tudo, consultor+SDR vê só o seu (filtro ainda não implementado).
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FunilRow {
  etapa: string;
  descricao: string;
  valor: number;
  pct: number; // % do topo
  cor: string;
  perda?: number; // perda pra próxima
}

interface CarteiraRow {
  consultor: string;
  total: number;
  aguardando: number;
  orcamento: number;
  analise: number;
  inativo: number;
  mediaIdadeDias: number;
  status: "saudavel" | "atencao" | "critico";
}

// === DADOS 06-13/10/2026 (fonte: Hub Tavinho + Sivis ERP) ===

const FUNIL: FunilRow[] = [
  { etapa: "Clique no anúncio", descricao: "Conversas WhatsApp iniciadas (Meta Ads)", valor: 75, pct: 100, cor: "#1C63FF", perda: -27 /* +27, orgânicos */ },
  { etapa: "Lead criado no Hub", descricao: "Chegou no Tavinho (SDR IA)", valor: 102, pct: 136, cor: "#0047AB", perda: 49 },
  { etapa: "Cotação formal gerada", descricao: "IA calculou valor + enviou mensagem", valor: 52, pct: 51, cor: "#1C63FF", perda: 17 },
  { etapa: "Encaminhado a consultor", descricao: "Via texto no WhatsApp pessoal", valor: 35, pct: 34, cor: "#5B8DFF", perda: 35 },
  { etapa: "Virou prospect no CRM Sivis", descricao: "Cadastrado formalmente", valor: 0, pct: 0, cor: "#f59e0b", perda: 0 },
  { etapa: "Virou cliente ativo", descricao: "Fechamento confirmado no Sivis", valor: 0, pct: 0, cor: "#dc2626" },
];

const CARTEIRA: CarteiraRow[] = [
  { consultor: "henrico.emerick", total: 66, aguardando: 55, orcamento: 9, analise: 0, inativo: 2, mediaIdadeDias: 32, status: "critico" },
  { consultor: "gabriel.correa", total: 9, aguardando: 4, orcamento: 2, analise: 0, inativo: 3, mediaIdadeDias: 15, status: "atencao" },
  { consultor: "diego.werner", total: 7, aguardando: 4, orcamento: 1, analise: 1, inativo: 1, mediaIdadeDias: 4, status: "saudavel" },
  { consultor: "ana.landim", total: 5, aguardando: 1, orcamento: 4, analise: 0, inativo: 0, mediaIdadeDias: 18, status: "saudavel" },
  { consultor: "maria.noe", total: 5, aguardando: 0, orcamento: 2, analise: 1, inativo: 2, mediaIdadeDias: 14, status: "saudavel" },
  { consultor: "luiz.conceicao", total: 4, aguardando: 0, orcamento: 3, analise: 1, inativo: 0, mediaIdadeDias: 17, status: "saudavel" },
  { consultor: "jhonatan.lodron", total: 4, aguardando: 1, orcamento: 2, analise: 0, inativo: 1, mediaIdadeDias: 32, status: "atencao" },
  { consultor: "danielle.oliveira", total: 3, aguardando: 2, orcamento: 1, analise: 0, inativo: 0, mediaIdadeDias: 10, status: "saudavel" },
  { consultor: "fabiano.santos", total: 3, aguardando: 3, orcamento: 0, analise: 0, inativo: 0, mediaIdadeDias: 18, status: "atencao" },
  { consultor: "glauco.pinto", total: 3, aguardando: 0, orcamento: 2, analise: 0, inativo: 0, mediaIdadeDias: 11, status: "saudavel" },
  { consultor: "willian.campos", total: 3, aguardando: 2, orcamento: 0, analise: 0, inativo: 1, mediaIdadeDias: 20, status: "atencao" },
  { consultor: "carlos.vianna", total: 3, aguardando: 3, orcamento: 0, analise: 0, inativo: 0, mediaIdadeDias: 24, status: "atencao" },
  { consultor: "saulo.rodrigues", total: 3, aguardando: 2, orcamento: 1, analise: 0, inativo: 0, mediaIdadeDias: 20, status: "atencao" },
  { consultor: "lucas.cruz", total: 3, aguardando: 0, orcamento: 2, analise: 1, inativo: 0, mediaIdadeDias: 15, status: "saudavel" },
  { consultor: "outros (29)", total: 32, aguardando: 20, orcamento: 11, analise: 2, inativo: 2, mediaIdadeDias: 14, status: "saudavel" },
];

const META_ADS = {
  investimento: 1116.25,
  conversasWA: 75,
  cpl: 10.94,
  custoPorCotacao: 21.47,
};

const RECEITA = {
  mrrPotencial: 10650, // soma mensalidades 52 cotações
  ltv12m: 127800,
  mrrRealizado: 0, // 0 vendas vindas do SDR
  ticketMedio: 220,
};

const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

export function FunilDashboard() {
  const [aba, setAba] = useState<"funil" | "carteira">("funil");
  const [syncing, setSyncing] = useState(false);

  const criticos = CARTEIRA.filter(c => c.status === "critico").length;
  const atencao = CARTEIRA.filter(c => c.status === "atencao").length;
  const saudaveis = CARTEIRA.filter(c => c.status === "saudavel").length;

  return (
    <div className="space-y-5">
      {/* Cabeçalho com meta de sincronização */}
      <div className="rounded-3xl border border-loog-border bg-gradient-to-br from-loog-panel to-loog-card p-5 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black tracking-tight text-loog-text">Dashboard de Vendas</h2>
              <span className="rounded-full border border-loog-brand3/40 bg-loog-brand3/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-loog-brand3">v0 · dados 06-13/10</span>
            </div>
            <p className="mt-1 text-sm text-loog-muted">
              Funil ponta-a-ponta · Carteira dos consultores · fonte: Hub Tavinho + Sivis ERP
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setSyncing(true); setTimeout(() => setSyncing(false), 2000); }}
            disabled={syncing}
            className={cn(
              "rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-widest transition",
              syncing
                ? "border-loog-brand3/40 bg-loog-brand3/10 text-loog-brand3"
                : "border-loog-brand/40 bg-loog-brand/15 text-loog-brand3 hover:bg-loog-brand/25",
            )}
            title="Vai conectar à nossa API Sivis (em desenvolvimento)"
          >
            {syncing ? "⏳ sincronizando..." : "🔄 Sincronizar Sivis (em breve)"}
          </button>
        </div>
      </div>

      {/* KPIs topo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Leads WhatsApp" valor={102} delta="+36% vs Meta" cor="brand" />
        <Kpi label="Cotações formais" valor={52} delta="51% dos leads" cor="brand2" />
        <Kpi label="Encaminhados" valor={35} delta="34% dos leads" cor="brand3" />
        <Kpi label="Vendas do SDR" valor={0} delta="handoff quebrado" cor="danger" />
      </div>

      {/* Toggle de abas */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-full border border-loog-border bg-loog-panel/50 p-1">
          <button
            type="button"
            onClick={() => setAba("funil")}
            className={cn(
              "rounded-full px-5 py-2 text-xs font-bold uppercase tracking-widest transition",
              aba === "funil"
                ? "bg-gradient-to-r from-loog-brand to-loog-brand2 text-white shadow-lg"
                : "text-loog-muted hover:text-white",
            )}
          >
            🔁 Funil
          </button>
          <button
            type="button"
            onClick={() => setAba("carteira")}
            className={cn(
              "rounded-full px-5 py-2 text-xs font-bold uppercase tracking-widest transition",
              aba === "carteira"
                ? "bg-gradient-to-r from-loog-brand to-loog-brand2 text-white shadow-lg"
                : "text-loog-muted hover:text-white",
            )}
          >
            👥 Carteira
          </button>
        </div>
      </div>

      {aba === "funil" ? <FunilView /> : <CarteiraView />}

      {/* Rodapé: alerta de qualidade */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
        <div className="flex items-start gap-3">
          <span className="text-base">⚠️</span>
          <div>
            <strong className="text-amber-200">Qualidade do dado:</strong> hoje o status "virou cliente" é
            calculado por match de telefone. Falsos negativos possíveis se o cliente fechou com telefone diferente —
            na próxima iteração vamos adicionar match por nome fuzzy + confirmação manual.
            <span className="ml-2 text-amber-200/80">
              Carteira: <b>{criticos}</b> crítico · <b>{atencao}</b> atenção · <b>{saudaveis}</b> saudável
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */

function Kpi({ label, valor, delta, cor }: { label: string; valor: number | string; delta: string; cor: "brand" | "brand2" | "brand3" | "danger" }) {
  const corMap = {
    brand: "from-loog-brand/20 to-loog-brand/5 border-loog-brand/30 text-loog-brand3",
    brand2: "from-loog-brand2/20 to-loog-brand2/5 border-loog-brand2/30 text-loog-brand3",
    brand3: "from-loog-brand3/20 to-loog-brand3/5 border-loog-brand3/30 text-loog-brand3",
    danger: "from-red-600/20 to-red-600/5 border-red-600/30 text-red-400",
  }[cor];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-2xl border bg-gradient-to-br p-4 shadow-lg", corMap)}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-loog-muted">{label}</div>
      <div className="mt-1 text-3xl font-black leading-none">{valor}</div>
      <div className="mt-1 text-[11px] font-semibold">{delta}</div>
    </motion.div>
  );
}

/* ========================================================================== */

function FunilView() {
  const topo = FUNIL[0].valor;
  return (
    <div className="space-y-4">
      {/* Investimento Meta Ads */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniKpi label="Investido (Meta)" valor={fmtMoeda(META_ADS.investimento)} />
        <MiniKpi label="CPL real" valor={fmtMoeda(META_ADS.cpl)} />
        <MiniKpi label="Custo/cotação" valor={fmtMoeda(META_ADS.custoPorCotacao)} />
        <MiniKpi label="Break-even" valor="1 venda" />
      </div>

      {/* Funil em barras */}
      <div className="space-y-2 rounded-3xl border border-loog-border bg-loog-panel/60 p-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-loog-muted">Funil ponta-a-ponta (semana)</h3>
        {FUNIL.map((row, i) => {
          const width = Math.max(5, Math.min(100, (row.valor / Math.max(...FUNIL.map(r => r.valor))) * 100));
          const anterior = i > 0 ? FUNIL[i - 1].valor : 0;
          const deltaPct = i > 0 && anterior > 0 ? ((row.valor - anterior) / anterior * 100) : 0;
          return (
            <div key={row.etapa}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <div>
                  <span className="font-bold text-loog-text">{i + 1}. {row.etapa}</span>
                  <span className="ml-2 text-xs text-loog-muted">{row.descricao}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-black" style={{ color: row.cor }}>{row.valor}</span>
                  {i > 0 && (
                    <span className={cn("text-xs font-semibold", deltaPct < 0 ? "text-red-400" : "text-emerald-400")}>
                      {deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1 h-6 overflow-hidden rounded-lg bg-loog-card">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ delay: i * 0.05, duration: 0.5, ease: "easeOut" }}
                  className="h-full rounded-lg"
                  style={{ background: `linear-gradient(90deg, ${row.cor} 0%, ${row.cor}aa 100%)` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Alerta vazamento */}
      <div className="rounded-2xl border border-red-600/30 bg-red-600/5 p-4 text-sm">
        <div className="flex items-start gap-3">
          <span className="text-base">🚨</span>
          <div>
            <strong className="text-red-300">Vazamento identificado:</strong> dos <b>52</b> leads cotados, <b>0</b> viraram prospect formal no CRM Sivis.
            Os 35 encaminhamentos por WhatsApp ficam fora do sistema. Prioridade: automatizar <b>Hub → cria prospect no Sivis</b> quando IA gera cotação.
          </div>
        </div>
      </div>

      {/* Receita */}
      <div className="rounded-3xl border border-loog-border bg-loog-panel/60 p-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-loog-muted">Receita potencial × realizada</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniKpi label="MRR potencial" valor={fmtMoeda(RECEITA.mrrPotencial)} obs="52 cotações" />
          <MiniKpi label="LTV 12m" valor={fmtMoeda(RECEITA.ltv12m)} obs="projetado" />
          <MiniKpi label="MRR realizado" valor={fmtMoeda(RECEITA.mrrRealizado)} obs="0 vendas SDR" alerta />
          <MiniKpi label="Ticket médio" valor={fmtMoeda(RECEITA.ticketMedio)} obs="base LOOG" />
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, valor, obs, alerta }: { label: string; valor: string; obs?: string; alerta?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-loog-card p-3", alerta ? "border-red-600/30" : "border-loog-border")}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-loog-muted">{label}</div>
      <div className={cn("mt-1 text-lg font-black leading-tight", alerta ? "text-red-400" : "text-loog-text")}>{valor}</div>
      {obs && <div className="mt-0.5 text-[10px] text-loog-muted">{obs}</div>}
    </div>
  );
}

/* ========================================================================== */

function CarteiraView() {
  const sorted = [...CARTEIRA].sort((a, b) => b.total - a.total);
  const totalProspects = CARTEIRA.reduce((s, c) => s + c.total, 0);
  const totalAguardando = CARTEIRA.reduce((s, c) => s + c.aguardando, 0);
  const totalOrcamento = CARTEIRA.reduce((s, c) => s + c.orcamento, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniKpi label="Prospects pendentes" valor={String(totalProspects)} obs={`em ${plural(CARTEIRA.length, "consultor", "consultores")}`} />
        <MiniKpi label="AGUARDANDO" valor={String(totalAguardando)} obs="consultor ainda não começou" alerta />
        <MiniKpi label="EM ORÇAMENTO" valor={String(totalOrcamento)} obs="prox. fechamento" />
        <MiniKpi label="Henrico Emerick" valor="66" obs="42% da carteira total" alerta />
      </div>

      <div className="overflow-hidden rounded-3xl border border-loog-border bg-loog-panel/60">
        <table className="w-full text-sm">
          <thead className="bg-loog-card text-[10px] uppercase tracking-widest text-loog-muted">
            <tr>
              <th className="px-4 py-3 text-left">Consultor</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Aguardando</th>
              <th className="px-4 py-3 text-right">Em orçamento</th>
              <th className="px-4 py-3 text-right">Em análise</th>
              <th className="px-4 py-3 text-right">Inativo</th>
              <th className="px-4 py-3 text-right">Idade média</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-loog-border">
            {sorted.map((row) => {
              const corStatus = row.status === "critico" ? "bg-red-500/20 text-red-300 border-red-500/40"
                : row.status === "atencao" ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                : "bg-emerald-500/20 text-emerald-200 border-emerald-500/40";
              const emoji = row.status === "critico" ? "🔴" : row.status === "atencao" ? "🟡" : "🟢";
              return (
                <tr key={row.consultor} className={cn("transition hover:bg-loog-card/60", row.status === "critico" && "bg-red-500/5")}>
                  <td className="px-4 py-2.5 font-semibold text-loog-text">{row.consultor}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{row.total}</td>
                  <td className="px-4 py-2.5 text-right">
                    {row.aguardando > 0 ? (
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold",
                        row.aguardando >= 20 ? "bg-red-500/20 text-red-300"
                          : row.aguardando >= 5 ? "bg-amber-500/20 text-amber-200"
                            : "bg-loog-brand/20 text-loog-brand3")}>
                        {row.aguardando}
                      </span>
                    ) : <span className="text-loog-muted">–</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">{row.orcamento > 0 ? row.orcamento : <span className="text-loog-muted">–</span>}</td>
                  <td className="px-4 py-2.5 text-right">{row.analise > 0 ? row.analise : <span className="text-loog-muted">–</span>}</td>
                  <td className="px-4 py-2.5 text-right">{row.inativo > 0 ? row.inativo : <span className="text-loog-muted">–</span>}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn("font-semibold",
                      row.mediaIdadeDias > 30 ? "text-red-400"
                        : row.mediaIdadeDias > 15 ? "text-amber-300"
                          : "text-emerald-300")}>
                      {row.mediaIdadeDias}d
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", corStatus)}>
                      {emoji} {row.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-red-600/30 bg-red-600/5 p-4 text-sm text-red-100">
        <strong className="text-red-300">🚨 Ação recomendada:</strong> auditar a carteira do <b>henrico.emerick</b> esta semana.
        66 prospects com 55 em AGUARDANDO desde 08/09 (média 32 dias parado). Redistribuir 20-30 pros ativos (ana.landim, luiz.conceicao).
      </div>
    </div>
  );
}
