"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Consultor {
  id: string;
  full_name: string | null;
  email: string;
  photo_url: string | null;
}

interface LeadInfo {
  name?: string;
  phone?: string;
  lastMessage?: string;
}

export function AssignFromLink({
  leadId, leadInfo, consultores, currentAssignment,
}: {
  leadId: string;
  leadInfo: LeadInfo | null;
  consultores: Consultor[];
  currentAssignment: { consultant_id: string; assigned_at: string } | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(currentAssignment?.consultant_id ?? null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const confirmar = async (consultor: Consultor) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/sdr/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, consultant_id: consultor.id, notes: notes || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || "Falhou");
      setDone(consultor.full_name || consultor.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remover = async () => {
    if (!confirm("Remover a atribuição atual?")) return;
    setBusy(true);
    try {
      await fetch("/api/sdr/assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      setSelectedId(null);
      router.refresh();
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center"
      >
        <div className="text-5xl">✅</div>
        <h2 className="mt-3 font-display text-xl font-bold">Lead direcionado!</h2>
        <p className="mt-1 text-sm text-emerald-200">
          Enviado pra <b>{done}</b> — já aparece no painel LOOG Studio do consultor.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => { setDone(null); setSelectedId(null); }}
            className="flex-1 rounded-md border border-loog-border px-3 py-2 text-xs text-loog-muted hover:bg-white/5"
          >
            Trocar
          </button>
          <button
            type="button"
            onClick={() => router.push("/studio")}
            className="btn-primary flex-1 !py-2 !text-xs"
          >
            Voltar ao Studio
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* DADOS DO LEAD */}
      <div className="rounded-2xl border border-loog-border bg-loog-panel/60 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Lead</div>
        {leadInfo?.name ? (
          <>
            <div className="mt-1 font-display text-lg font-bold">{leadInfo.name}</div>
            {leadInfo.phone && <div className="text-xs text-loog-muted">{leadInfo.phone}</div>}
            {leadInfo.lastMessage && (
              <p className="mt-2 text-xs italic text-loog-muted">&ldquo;{leadInfo.lastMessage}&rdquo;</p>
            )}
          </>
        ) : (
          <div className="mt-1 font-mono text-sm text-loog-muted">ID: {leadId}</div>
        )}
      </div>

      {currentAssignment && (
        <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-xs text-sky-200">
          ⚠️ Já atribuído desde {new Date(currentAssignment.assigned_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.
          Escolher outro consultor abaixo substitui.
        </div>
      )}

      {/* CAMPO OBS */}
      <div>
        <label className="label">Observação (opcional)</label>
        <input
          type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="ex: Cliente premium, urgente"
          className="input mt-1"
          maxLength={200}
        />
      </div>

      {/* CARDS DOS CONSULTORES */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-loog-muted">
          Direcionar pra qual consultor?
        </div>
        {consultores.length === 0 ? (
          <div className="rounded-lg border border-dashed border-loog-border p-6 text-center text-xs text-loog-muted">
            Nenhum consultor disponível. Vá em /admin/consultores e aprove.
          </div>
        ) : (
          <ul className="space-y-2">
            {consultores.map((c) => {
              const isSel = selectedId === c.id;
              const isCurrent = currentAssignment?.consultant_id === c.id;
              return (
                <motion.li
                  key={c.id}
                  whileTap={{ scale: 0.98 }}
                >
                  <button
                    type="button"
                    onClick={() => { setSelectedId(c.id); void confirmar(c); }}
                    disabled={busy}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition active:scale-[0.98]",
                      isCurrent
                        ? "border-sky-500/50 bg-sky-500/10"
                        : isSel
                        ? "border-loog-brand bg-loog-brand/15 shadow-glow"
                        : "border-loog-border bg-loog-panel/60 hover:border-loog-brand/60 hover:bg-loog-panel",
                    )}
                  >
                    {c.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photo_url} alt="" className="h-12 w-12 shrink-0 rounded-full border border-loog-border object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-loog-brand/20 text-base font-bold text-loog-brand">
                        {(c.full_name || c.email).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-white">{c.full_name || c.email.split("@")[0]}</div>
                      <div className="truncate text-[11px] text-loog-muted">{c.email}</div>
                    </div>
                    {isCurrent && <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">atual</span>}
                    {busy && isSel && <span className="shrink-0 text-xs text-loog-muted">...</span>}
                    {!busy && !isCurrent && !isSel && <span className="shrink-0 text-loog-muted">→</span>}
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      {currentAssignment && (
        <button
          type="button"
          onClick={remover}
          disabled={busy}
          className="w-full rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10"
        >
          ✕ Remover atribuição atual
        </button>
      )}

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200"
          >
            Erro: {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
