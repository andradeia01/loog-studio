"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { InspectionStatus, InspectionMode } from "@/lib/inspection/types";
import { InspectionWizard } from "./InspectionWizard";

interface ListItem {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  nome_associado: string | null;
  mode: InspectionMode;
  status: InspectionStatus;
  ai_approved: boolean | null;
  ai_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_META: Record<InspectionStatus, { label: string; color: string; bg: string; icon: string }> = {
  DRAFT: { label: "Rascunho", color: "text-gray-300", bg: "bg-gray-500/10 border-gray-500/30", icon: "📝" },
  RECORDING: { label: "Gravando", color: "text-blue-300", bg: "bg-blue-500/10 border-blue-500/30", icon: "🎥" },
  UPLOADING: { label: "Enviando", color: "text-cyan-300", bg: "bg-cyan-500/10 border-cyan-500/30", icon: "📤" },
  PROCESSING: { label: "IA analisando", color: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/30 animate-pulse", icon: "🤖" },
  APPROVED: { label: "Aprovada", color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30", icon: "✅" },
  REJECTED: { label: "Reprovada", color: "text-rose-300", bg: "bg-rose-500/10 border-rose-500/30", icon: "❌" },
  NEEDS_REVIEW: { label: "Revisar manual", color: "text-yellow-300", bg: "bg-yellow-500/10 border-yellow-500/30", icon: "⚠️" },
};

export function InspectionPane() {
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/inspection/list");
      if (!r.ok) return;
      const { inspections } = (await r.json()) as { inspections: ListItem[] };
      setItems(inspections);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000); // atualiza pra pegar PROCESSING → APPROVED
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-5">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl border border-purple-500/40 bg-gradient-to-br from-purple-500/20 via-fuchsia-600/10 to-loog-panel p-5 shadow-[0_0_60px_rgba(168,85,247,0.15)] sm:p-6">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-purple-400/20 blur-3xl" />
        <div className="relative">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-purple-300">
            🎥 Vistoria por vídeo · IA automática
          </div>
          <h2 className="font-display text-2xl font-black text-white sm:text-3xl">
            Grava 1 vídeo. A IA faz o resto.
          </h2>
          <p className="mt-2 max-w-md text-sm text-purple-200/80">
            Vai no cliente, abre o LOOG Studio, grava 60s do veículo <b>ligado</b> cobrindo todos os ângulos.
            A IA extrai os frames, confere ângulos, placa, odômetro, qualidade e aprova ou reprova na hora.
          </p>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:scale-105"
          >
            ✨ Nova vistoria
          </button>
        </div>
      </div>

      {/* LISTA */}
      <div className="rounded-2xl border border-loog-border bg-loog-panel/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-widest text-loog-muted">
            📋 Minhas vistorias
          </span>
          <button
            type="button"
            onClick={load}
            className="rounded-full border border-loog-border bg-black/30 px-3 py-1 text-[10px] font-bold text-loog-muted hover:text-white"
          >
            Atualizar
          </button>
        </div>
        {loading && items === null ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-loog-panel/40" />)}
          </div>
        ) : items && items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-loog-border bg-loog-panel/30 p-8 text-center text-sm text-loog-muted">
            Nenhuma vistoria ainda. Clica em <b>Nova vistoria</b> pra começar.
          </div>
        ) : (
          <div className="space-y-2">
            {items?.map((item) => {
              const meta = STATUS_META[item.status];
              return (
                <div key={item.id} className={cn("rounded-xl border p-3 transition", meta.bg)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-base font-black text-white">{item.placa}</span>
                        <span className="text-xs text-loog-muted">· {item.marca} {item.modelo}</span>
                      </div>
                      <div className="mt-1 text-xs text-loog-muted">
                        {item.nome_associado ?? "—"} · {item.mode === "REMOTE" ? "🔗 Link remoto" : "👤 Presencial"}
                        {" · "}
                        {new Date(item.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                      {item.ai_reason && item.status !== "APPROVED" && (
                        <div className="mt-1 text-[11px] text-rose-200/80">↳ {item.ai_reason}</div>
                      )}
                    </div>
                    <div className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", meta.color, meta.bg)}>
                      {meta.icon} {meta.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {wizardOpen && (
        <InspectionWizard
          onClose={() => setWizardOpen(false)}
          onFinished={() => { setWizardOpen(false); load(); }}
        />
      )}
    </div>
  );
}
