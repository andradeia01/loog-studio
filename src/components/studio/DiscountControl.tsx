"use client";

/**
 * Controle de desconto da cotação LOOG.
 *
 * Mostra:
 *   - Switch on/off (0% vs 10% padrão)
 *   - Slider pra ajustar entre 0-20% (faixas visuais de saúde do negócio)
 *   - Valor bruto em vermelho quando desconto desligado
 *   - Preview do final conforme desliza
 *
 * Política LOOG (ver project_loog_cotacao_regras.md):
 *   - 0-5%:   Super saudável (verde escuro) — margem preservada
 *   - 6-10%:  Padrão autorizado (verde) — consultor livre, política padrão
 *   - 11-15%: Alto — gestor (amarelo) — precisa aprovação do gestor
 *   - 16-20%: Crítico — direção (vermelho) — só com liberação da direção
 */

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const BRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Faixa { min: number; max: number; cor: string; cor_hex: string; label: string; descr: string }
// Politica LOOG: desconto maximo 10% — faixas abaixo refletem apenas o impacto na margem
const FAIXAS: Faixa[] = [
  { min: 0,  max: 3,  cor: "text-emerald-400", cor_hex: "#10b981", label: "Saudável", descr: "Margem preservada — ideal pro negócio" },
  { min: 3,  max: 6,  cor: "text-emerald-300", cor_hex: "#34d399", label: "Padrão",   descr: "Desconto confortável" },
  { min: 6,  max: 9,  cor: "text-amber-300",   cor_hex: "#fbbf24", label: "Alto",     descr: "Margem apertada — use com critério" },
  { min: 9,  max: 10, cor: "text-red-400",     cor_hex: "#f87171", label: "Teto",     descr: "Teto autorizado pelo consultor" },
];

function getFaixa(pct: number): Faixa {
  return FAIXAS.find((f) => pct > f.min && pct <= f.max) ?? FAIXAS[0];
}

export function DiscountControl({
  brutoCents,
  descontoPctAplicado,
  onApply,
  applying,
}: {
  brutoCents: number;
  descontoPctAplicado: number;
  onApply: (pct: number) => void | Promise<void>;
  applying: boolean;
}) {
  const [pct, setPct] = useState(descontoPctAplicado);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setPct(descontoPctAplicado); setDirty(false); }, [descontoPctAplicado]);

  const faixa = getFaixa(pct);
  const descontoCents = Math.round(brutoCents * (pct / 100));
  const finalCents = Math.max(0, brutoCents - descontoCents);
  const ligado = pct > 0;

  // Posição do marcador no slider (0-100% visual), teto 10%
  const sliderPct = (pct / 10) * 100;

  const faixasBg = useMemo(() => {
    // Gradient suave entre as faixas pro background da trilha
    // Faixas 0-3-6-9-10 em slider 0-10 = 30% / 60% / 90% / 100%
    return `linear-gradient(to right,
      ${FAIXAS[0].cor_hex} 0%,
      ${FAIXAS[0].cor_hex} 30%,
      ${FAIXAS[1].cor_hex} 30%,
      ${FAIXAS[1].cor_hex} 60%,
      ${FAIXAS[2].cor_hex} 60%,
      ${FAIXAS[2].cor_hex} 90%,
      ${FAIXAS[3].cor_hex} 90%,
      ${FAIXAS[3].cor_hex} 100%)`;
  }, []);

  function toggleDesconto() {
    const novo = ligado ? 0 : 10;
    setPct(novo);
    setDirty(true);
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">💸 Desconto da cotação</h3>
          <p className="mt-1 text-[11px] text-loog-muted/90">
            Ligado por padrão em <b>10%</b> (política LOOG). Ajuste pela escala pra ver até onde faz sentido.
          </p>
        </div>
        {/* Switch on/off */}
        <button
          type="button"
          onClick={toggleDesconto}
          className={cn(
            "relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition",
            ligado ? "bg-emerald-500" : "bg-red-500/70",
          )}
          aria-label={ligado ? "Desligar desconto" : "Ligar desconto"}
        >
          <span className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white transition",
            ligado ? "translate-x-8" : "translate-x-1",
          )} />
        </button>
      </div>

      {/* Valores — final + bruto riscado quando desconto desligado */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className={cn(
          "rounded-xl border-2 p-3",
          ligado ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/50 bg-red-500/10",
        )}>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">
            {ligado ? "Mensalidade final" : "SEM desconto"}
          </div>
          <div className={cn(
            "mt-1 font-display text-2xl font-extrabold",
            ligado ? "text-emerald-300" : "text-red-400",
          )}>
            {BRL(finalCents)}
          </div>
          {ligado && (
            <div className="mt-1 text-[10px] text-loog-muted line-through">
              bruto {BRL(brutoCents)}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-loog-border p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Desconto aplicado</div>
          <div className={cn("mt-1 font-display text-2xl font-extrabold", faixa.cor)}>
            {pct}%
          </div>
          <div className="mt-1 text-[10px] text-loog-muted">
            = {BRL(descontoCents)}/mês
          </div>
        </div>
      </div>

      {/* Escala visual de saúde do negócio */}
      <div className="mb-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-loog-muted">
          <span>Escala de desconto</span>
          <span className={cn("font-bold", faixa.cor)}>{faixa.label}</span>
        </div>
        <div className="relative h-6">
          {/* Trilha com faixas coloridas */}
          <div
            className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full opacity-30"
            style={{ background: faixasBg }}
          />
          {/* Marcador atual */}
          <div
            className="absolute top-1/2 h-6 w-6 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white shadow-glow transition-all"
            style={{
              left: `${sliderPct}%`,
              backgroundColor: faixa.cor_hex,
            }}
          />
          {/* Input slider nativo transparente por cima */}
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={pct}
            onChange={(e) => { setPct(Number(e.target.value)); setDirty(true); }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-loog-muted">
          <span>0%</span>
          <span>5%</span>
          <span>10%</span>
          <span>15%</span>
          <span>10%</span>
        </div>
      </div>

      {/* Descrição da faixa atual */}
      <div className={cn(
        "mb-4 rounded-lg border px-3 py-2 text-xs",
        pct <= 10 ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" :
        pct <= 15 ? "border-amber-500/40 bg-amber-500/10 text-amber-200" :
                    "border-red-500/40 bg-red-500/10 text-red-200",
      )}>
        <b>{faixa.label}</b> — {faixa.descr}
      </div>

      {/* Botões rápidos */}
      <div className="mb-3 flex gap-2">
        {[0, 5, 10, 15, 20].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setPct(p); setDirty(true); }}
            className={cn(
              "flex-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition",
              pct === p
                ? "border-loog-brand bg-loog-brand/20 text-white"
                : "border-loog-border text-loog-muted hover:bg-white/5",
            )}
          >
            {p}%
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-loog-muted">
          {dirty ? "⚠ Clique pra atualizar PDF e mensagem" : "Nenhuma mudança pendente"}
        </span>
        <button
          type="button"
          onClick={() => onApply(pct)}
          disabled={!dirty || applying}
          className="rounded-md bg-loog-brand px-4 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {applying ? "Aplicando…" : "Aplicar desconto"}
        </button>
      </div>
    </div>
  );
}
