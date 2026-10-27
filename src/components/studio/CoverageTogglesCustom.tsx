"use client";

/**
 * Toggles de coberturas opcionais customizadas da cotação LOOG.
 *
 * Regras:
 *   - Códigos em `defaultCodes` já vêm inclusos na cotação rápida (delta_cents=0).
 *     Esses não podem ser desligados — ficam destacados "✓ INCLUSO".
 *   - Grupos exclusivos (radio): só 1 nível ativo. Trocar o nível soma a diferença.
 *   - Grupos toggle: on/off independente.
 *   - Preview do delta em tempo real; botão "Aplicar à cotação" dispara re-cotação.
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
  defaultCodes,
  descontoCents,
  descontoPct,
  onApply,
  applying,
}: {
  tipoVeiculo: "carro" | "moto" | "utilitario" | "eletrico" | "caminhao";
  baseMensalCents: number;
  initialCodigos?: string[];
  defaultCodes?: string[];
  descontoCents?: number;
  /** % de desconto que o consultor aplicou (0-10). Default 0 = padrão SIVIS. */
  descontoPct?: number;
  onApply: (codigos: string[]) => void | Promise<void>;
  applying: boolean;
}) {
  const [grupos, setGrupos] = useState<GrupoCobertura[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(initialCodigos ?? []));
  const [dirty, setDirty] = useState(false);
  const defaults = useMemo(() => new Set(defaultCodes ?? []), [defaultCodes]);

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

  // Sync externo (backend confirmou nova config)
  useEffect(() => {
    setSelecionados(new Set(initialCodigos ?? []));
    setDirty(false);
  }, [initialCodigos?.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDeltaCents = useMemo(() => {
    let total = 0;
    for (const g of grupos) for (const o of g.opcoes) if (selecionados.has(o.codigo)) total += o.delta_cents;
    return total;
  }, [selecionados, grupos]);

  // Preview do novo mensal — reflete o % de desconto que o consultor realmente aplicou
  // Default 0% (padrao SIVIS). Se consultor ligou 5%, preview mostra "com 5% off".
  const DESCONTO_PCT = Math.max(0, Math.min(10, descontoPct ?? 0));
  const novoBrutoCents = baseMensalCents + totalDeltaCents;
  const novoDescontoCents = Math.round(novoBrutoCents * (DESCONTO_PCT / 100));
  const novoFinalCents = Math.max(0, novoBrutoCents - novoDescontoCents);
  void descontoCents; // mantido na prop pra compat futura

  function escolherExclusivo(grupo: GrupoCobertura, opt: Opcao) {
    const novo = new Set(selecionados);
    // Remove outros do mesmo grupo (exclusivo)
    for (const o of grupo.opcoes) novo.delete(o.codigo);
    novo.add(opt.codigo);
    setSelecionados(novo);
    setDirty(true);
  }

  function toggle(opt: Opcao) {
    if (defaults.has(opt.codigo)) return; // defaults não podem ser desligados
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
            Itens <b className="text-emerald-300">INCLUSOS</b> já vêm no valor atual.
            Upgrade um nível pra somar só a diferença.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">
            {DESCONTO_PCT > 0 ? `Mensal (com ${DESCONTO_PCT}% off)` : "Mensal (sem desconto)"}
          </div>
          <div className="font-display text-2xl font-bold text-emerald-300">
            {BRL(novoFinalCents)}
          </div>
          {totalDeltaCents !== 0 && (
            <div className={cn("text-[11px] font-semibold", totalDeltaCents > 0 ? "text-amber-200" : "text-sky-300")}>
              {totalDeltaCents > 0 ? `+${BRL(totalDeltaCents)}` : BRL(totalDeltaCents)} vs base
            </div>
          )}
          {dirty && (
            <div className="mt-1 text-[10px] font-bold text-amber-300 animate-pulse">
              ⚠ clique em Recalcular pra aplicar
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {grupos.map((g) => {
          const temDefaultNesteGrupo = g.opcoes.some((o) => defaults.has(o.codigo));
          // Qual opção está ATIVA? (relevante pros grupos exclusivos — radio)
          const opcaoAtiva = g.exclusivo ? g.opcoes.find((o) => selecionados.has(o.codigo)) : null;
          const defaultAtivo = opcaoAtiva && defaults.has(opcaoAtiva.codigo);
          // Badge dinâmico: mostra o estado real do grupo
          let badge: { texto: string; cor: string } | null = null;
          if (temDefaultNesteGrupo && opcaoAtiva) {
            if (defaultAtivo) {
              badge = { texto: "✓ incluso", cor: "bg-emerald-500/20 text-emerald-300" };
            } else if (opcaoAtiva.delta_cents > 0) {
              badge = { texto: `UPGRADE +${BRL(opcaoAtiva.delta_cents)}`, cor: "bg-loog-brand/30 text-white" };
            } else if (opcaoAtiva.delta_cents < 0) {
              badge = { texto: `REDUZIDO ${BRL(opcaoAtiva.delta_cents)}`, cor: "bg-amber-500/20 text-amber-200" };
            }
          }
          return (
            <div key={g.grupo} className={cn(
              "rounded-xl border p-3 transition",
              defaultAtivo ? "border-emerald-500/30 bg-emerald-500/5" :
              opcaoAtiva ? "border-loog-brand/40 bg-loog-brand/5" :
              "border-loog-border bg-loog-panel/40",
            )}>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider">{g.label}</h4>
                {badge && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", badge.cor)}>
                    {badge.texto}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {g.opcoes.map((o) => {
                  const ativo = selecionados.has(o.codigo);
                  const isDefault = defaults.has(o.codigo);
                  const commonLabel = (
                    <>
                      <span className="min-w-0 flex-1 text-xs">{o.descricao}</span>
                      <span className={cn(
                        "ml-2 shrink-0 text-[10px] font-bold uppercase tracking-wider",
                        isDefault ? "text-emerald-300" : o.delta_cents > 0 ? "text-amber-200" : o.delta_cents < 0 ? "text-sky-300" : "text-loog-muted",
                      )}>
                        {isDefault ? "✓ incluso" : o.delta_cents === 0 ? "incluso" : o.delta_cents > 0 ? `+${BRL(o.delta_cents)}` : BRL(o.delta_cents)}
                      </span>
                    </>
                  );
                  return g.exclusivo ? (
                    <button
                      key={o.codigo}
                      type="button"
                      onClick={() => escolherExclusivo(g, o)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border-2 px-3 py-2 text-left transition",
                        ativo && isDefault
                          ? "border-emerald-500 bg-emerald-500/20 shadow-glow"
                          : ativo
                            ? "border-loog-brand bg-loog-brand/25 shadow-glow"
                            : "border-loog-border/60 opacity-70 hover:opacity-100 hover:bg-white/5",
                      )}
                    >
                      {ativo && <span className="mr-2 text-[11px] font-bold text-white">●</span>}
                      {commonLabel}
                    </button>
                  ) : (
                    <label key={o.codigo} className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 transition",
                      isDefault ? "cursor-not-allowed opacity-80 border-emerald-500/40 bg-emerald-500/10" : "cursor-pointer",
                      !isDefault && (ativo ? "border-loog-brand/60 bg-loog-brand/15" : "border-loog-border hover:bg-white/5"),
                    )}>
                      <input
                        type="checkbox"
                        checked={ativo || isDefault}
                        disabled={isDefault}
                        onChange={() => toggle(o)}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      {commonLabel}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {dirty && (
        <div className="mt-4 rounded-xl border-2 border-amber-500/60 bg-amber-500/15 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 text-xs text-amber-100">
              <div className="font-bold">⚠ Você mexeu nas coberturas</div>
              <div className="text-[11px] text-amber-200/80">
                Clica no botão pra aplicar na cotação, atualizar o valor e sincronizar a mensagem + PDF.
              </div>
            </div>
            <button
              type="button"
              onClick={() => onApply(Array.from(selecionados))}
              disabled={applying}
              className="shrink-0 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg hover:brightness-110 disabled:opacity-50"
            >
              {applying ? "Aplicando…" : "✅ Aplicar à cotação"}
            </button>
          </div>
        </div>
      )}
      {!dirty && (
        <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-emerald-300/80">
          <span>✓ Cotação sincronizada — valor, mensagem e PDF refletem as coberturas marcadas</span>
        </div>
      )}
    </div>
  );
}
