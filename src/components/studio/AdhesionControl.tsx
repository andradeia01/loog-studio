"use client";

/**
 * Controle de ADESÃO da cotação LOOG.
 *
 * Piso por tipo (Luís 27/10/2026):
 *   - Leves (carro/moto/utilitário/elétrico): R$ 100,00
 *   - Pesados (caminhão):                      R$ 1.500,00
 *
 * Consultor pode SUBIR o valor (ex: pra absorver custo operacional específico),
 * mas o input NUNCA desce do piso. Botões rápidos facilitam ajustes comuns.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const BRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Tipo = "carro" | "moto" | "utilitario" | "eletrico" | "caminhao";

const PRESETS_LEVE = [10000, 15000, 25000, 50000, 100000];      // R$ 100, 150, 250, 500, 1.000
const PRESETS_PESADO = [150000, 200000, 300000, 500000, 1000000]; // R$ 1.500, 2.000, 3.000, 5.000, 10.000

export function AdhesionControl({
  tipoVeiculo,
  adesaoCentsAplicado,
  pisoCents,
  onApply,
  applying,
}: {
  tipoVeiculo: Tipo;
  adesaoCentsAplicado: number;
  pisoCents?: number;
  onApply: (adesaoCents: number) => void | Promise<void>;
  applying: boolean;
}) {
  const isPesado = tipoVeiculo === "caminhao";
  const piso = pisoCents ?? (isPesado ? 150000 : 10000);
  const presets = isPesado ? PRESETS_PESADO : PRESETS_LEVE;

  const [cents, setCents] = useState(Math.max(piso, adesaoCentsAplicado));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCents(Math.max(piso, adesaoCentsAplicado));
    setDirty(false);
  }, [adesaoCentsAplicado, piso]);

  const atualizar = (novoCents: number) => {
    // Clampa no piso — nunca deixa descer. 10M = teto de segurança (R$ 100k).
    const clampado = Math.max(piso, Math.min(10_000_000, Math.round(novoCents)));
    setCents(clampado);
    setDirty(true);
  };

  const abaixoDoPiso = cents < piso;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">
            {isPesado ? "🚛 Adesão (pesados)" : "💳 Adesão da cotação"}
          </h3>
          <p className="mt-1 text-[11px] text-loog-muted/90">
            Piso <b>{BRL(piso)}</b>{isPesado ? " (operação de caminhão)" : " (padrão SIVIS)"}.
            Consultor pode subir, nunca descer do piso.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Adesão atual</div>
          <div className={cn(
            "font-display text-2xl font-extrabold",
            abaixoDoPiso ? "text-red-400" : "text-emerald-300",
          )}>
            {BRL(cents)}
          </div>
          {cents > piso && (
            <div className="text-[10px] text-amber-300">+{BRL(cents - piso)} acima do piso</div>
          )}
        </div>
      </div>

      {/* Input manual */}
      <div className="mb-3">
        <label className="label">Valor da adesão (R$)</label>
        <div className="flex gap-2">
          <input
            type="number"
            min={piso / 100}
            step={10}
            value={(cents / 100).toFixed(2)}
            onChange={(e) => atualizar(Math.round(Number(e.target.value) * 100))}
            className="input flex-1"
          />
          <button
            type="button"
            onClick={() => atualizar(piso)}
            className="rounded-md border border-loog-border px-3 text-[11px] font-semibold text-loog-muted hover:bg-white/5"
            title="Voltar pro piso"
          >
            ↺ Piso
          </button>
        </div>
        {abaixoDoPiso && (
          <p className="mt-1 text-[10px] font-semibold text-red-400">
            ⚠ Valor abaixo do piso de {BRL(piso)} — será elevado automaticamente ao aplicar.
          </p>
        )}
      </div>

      {/* Presets rápidos */}
      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => atualizar(p)}
            className={cn(
              "rounded-md border px-2 py-1.5 text-[10px] font-semibold transition",
              cents === p
                ? "border-loog-brand bg-loog-brand/20 text-white"
                : "border-loog-border text-loog-muted hover:bg-white/5",
            )}
          >
            {BRL(p).replace(/^R\$\s*/, "R$")}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-loog-muted">
          {dirty ? "⚠ Clique pra aplicar na cotação" : "Nenhuma mudança pendente"}
        </span>
        <button
          type="button"
          onClick={() => onApply(Math.max(piso, cents))}
          disabled={!dirty || applying}
          className="rounded-md bg-loog-brand px-4 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {applying ? "Aplicando…" : "Aplicar adesão"}
        </button>
      </div>
    </div>
  );
}
