"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface SdrConsultor {
  id: string;
  full_name: string | null;
  email: string;
  photo_url?: string | null;
}

export interface SdrAssignment {
  lead_id: string;
  consultant_id: string;
  consultant?: { full_name: string | null; email: string } | null;
  assigned_at: string;
}

/**
 * Dropdown compacto pra admin atribuir/desatribuir 1 lead.
 * Em consultores NÃO-admin, mostra só a badge do responsável atual (sem controles).
 */
export function SdrLeadAssign({
  leadId, assignment, consultores, isAdmin, onChange, compact = false,
}: {
  leadId: string;
  assignment: SdrAssignment | null;
  consultores: SdrConsultor[];
  isAdmin: boolean;
  onChange: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const atual = assignment?.consultant?.full_name ?? assignment?.consultant?.email ?? null;

  // Consultor normal — só vê a badge
  if (!isAdmin) {
    if (!atual) return null;
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300",
        compact && "px-1.5",
      )}>
        👤 {atual.split(" ")[0]}
      </span>
    );
  }

  const assign = async (consultant_id: string) => {
    setBusy(true);
    try {
      await fetch("/api/sdr/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, consultant_id }),
      });
      onChange();
      setOpen(false);
    } finally { setBusy(false); }
  };

  const unassign = async () => {
    if (!confirm(`Remover atribuição deste lead?`)) return;
    setBusy(true);
    try {
      await fetch("/api/sdr/assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      onChange();
      setOpen(false);
    } finally { setBusy(false); }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition",
          atual
            ? "border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
            : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
          compact && "px-1.5",
        )}
        title={atual ? `Atribuído a ${atual}` : "Atribuir a um consultor"}
      >
        {atual ? `👤 ${atual.split(" ")[0]}` : "+ Atribuir"}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-loog-border bg-loog-bg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-loog-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
            Atribuir a
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {consultores.length === 0 ? (
              <li className="px-3 py-2 text-xs text-loog-muted">Nenhum consultor disponível</li>
            ) : consultores.map((c) => {
              const isCurrent = assignment?.consultant_id === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => assign(c.id)}
                    disabled={busy || isCurrent}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition",
                      isCurrent ? "bg-sky-500/15 text-sky-300" : "hover:bg-white/5",
                    )}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-loog-brand/20 text-[10px] font-bold text-loog-brand">
                      {(c.full_name || c.email).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.full_name || c.email}</span>
                    {isCurrent && <span className="text-[10px]">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {atual && (
            <div className="border-t border-loog-border px-1 py-1">
              <button
                type="button"
                onClick={unassign}
                disabled={busy}
                className="w-full rounded px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/10"
              >
                ✕ Remover atribuição
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
