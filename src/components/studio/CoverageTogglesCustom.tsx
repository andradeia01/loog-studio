"use client";

/**
 * Toggles de coberturas opcionais customizadas da cotação LOOG.
 *
 * - Grupos exclusivos (terceiros, reserva, reboque, gnv, vidros): radio group — só 1 ativo
 * - Grupos toggle (monitoramento, atividade): on/off independente
 * - Preview do total em tempo real (soma delta localmente)
 * - Botão "Aplicar à cotação" dispara re-cotação via onApply com os códigos selecionados
 *
 * Fonte dos valores: tabela cotacao_coverages (migration 010), oficial LOOG.
 */

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface Opcao {
  codigo: string;
  grupo: string;
  grupo_label: string;
  descricao: string;
  nivel: number;
  exclusivo: boolean;
  delta_cents: number;
  ordem: number;
}
export interface GrupoCobertura {
  grupo: string;
  label: string;
  exclusivo: boolean;
  opcoes: Opcao[];
}

const BRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CoverageTogglesCustom({
  tipoVeiculo,
  baseMensalCents,
  initialCodigos,
  onApply,
  applying,
}: {
  tipoVeiculo: "carro" | "moto" | "utilitario" | "eletrico";
  baseMensalCents: number;
  initialCodigos?: string[];
  onApply: (codigos: string[]) => void | Promise<void>;
  applying: boolean;
}) {
  const [grupos, setGrupos] = useState<GrupoCobertura[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(initialCodigos ?? []));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/cotacao/coverages?tipo=${tipoVeiculo}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancel) setGrupos(j.grupos ?? []); })
      .catch(() => { /* silencioso */ })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [tipoVeiculo]);

  // Reset "dirty" sempre que o backend confirma com novos códigos
  useEffect(() => {
    setSelecionados(new Set(initialCodigos ?? []));
    setDirty(false);
  }, [initialCodigos?.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDeltaCents = useMemo(() => {
    let total = 0;
    for (const g of grupos) for (const o of g.opcoes) if (selecionados.has(o.codigo)) total += o.delta_cents;
    return total;
  }, [selecionados, grupos]);

  function escolherExclusivo(grupo: GrupoCobertura, opt: Opcao) {
    const novo = new Set(selecionados);
    // remove outros do mesmo grupo
    for (const o of grupo.opcoes) novo.delete(o.codigo);
    novo.add(opt.codigo);
    setSelecionados(novo);
    setDirty(true);
  }

  function limparExclusivo(grupo: GrupoCobertura) {
    const novo = new Set(selecionados);
    for (const o of grupo.opcoes) novo.delete(o.codigo);
    setSelecionados(novo);
    setDirty(true);
  }

  function toggle(opt: Opcao) {
    const novo = new Set(selecionados);
    if (novo.has(opt.codigo)) novo.delete(opt.codigo); else novo.add(opt.codigo);
    setSelecionados(novo);
    setDirty(true);
  }

  if (loading) {
    return (
      <div className="card p-5 text-center text-xs text-loog-muted">Carregando opções…</div>
    );
  }
  if (grupos.length === 0) {
    return (
      <div className="card p-5 text-center text-xs text-loog-muted">
        Nenhuma cobertura opcional cadastrada pra <b>{tipoVeiculo}</b> ainda.
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">⚙️ Personalizar coberturas</h3>
          <p className="mt-1 text-[11px] text-loog-muted/90">
            Ajuste pra fechar o cliente — radio escolhe nível, toggle liga/desliga. Valor novo aparece já abaixo.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">+ Mensalidade</div>
          <div className={cn("font-display text-xl font-bold", totalDeltaCents > 0 ? "text-emerald-300" : "text-loog-muted")}>
            {totalDeltaCents > 0 ? `+ ${BRL(totalDeltaCents)}` : BRL(0)}
          </div>
          <div className="text-[10px] text-loog-muted">= {BRL(baseMensalCents + totalDeltaCents)}/mês</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {grupos.map((g) => (
          <div key={g.grupo} className="rounded-xl border border-loog-border bg-loog-panel/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider">{g.label}</h4>
              {g.exclusivo && g.opcoes.some((o) => selecionados.has(o.codigo)) && (
                <button type="button" onClick={() => limparExclusivo(g)} className="text-[10px] text-loog-muted hover:text-white">
                  limpar
                </button>
              )}
            </div>
            <div className="space-y-1">
              {g.opcoes.map((o) => {
                const ativo = selecionados.has(o.codigo);
                return g.exclusivo ? (
                  <button
                    key={o.codigo}
                    type="button"
                    onClick={() => escolherExclusivo(g, o)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition",
                      ativo ? "border-emerald-500/50 bg-emerald-500/10" : "border-loog-border hover:bg-white/5",
                    )}
                  >
                    <span className="min-w-0 flex-1 text-xs">{o.descricao}</span>
                    <span className={cn("ml-2 shrink-0 text-[10px] font-bold uppercase tracking-wider", ativo ? "text-emerald-300" : "text-loog-muted")}>
                      {o.delta_cents === 0 ? "incluso" : `+${BRL(o.delta_cents)}`}
                    </span>
                  </button>
                ) : (
                  <label key={o.codigo} className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition",
                    ativo ? "border-emerald-500/50 bg-emerald-500/10" : "border-loog-border hover:bg-white/5",
                  )}>
                    <input type="checkbox" checked={ativo} onChange={() => toggle(o)} className="h-4 w-4 accent-emerald-500" />
                    <span className="flex-1 text-xs">{o.descricao}</span>
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", ativo ? "text-emerald-300" : "text-loog-muted")}>
                      {o.delta_cents === 0 ? "grátis" : `+${BRL(o.delta_cents)}`}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] text-loog-muted">
          {dirty ? "Mudanças pendentes — clique pra aplicar" : "Nenhuma mudança"}
        </span>
        <button
          type="button"
          onClick={() => onApply(Array.from(selecionados))}
          disabled={!dirty || applying}
          className="rounded-md bg-loog-brand px-4 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {applying ? "Aplicando…" : "Aplicar à cotação"}
        </button>
      </div>
    </div>
  );
}
