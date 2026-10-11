"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type Status = "DRAFT" | "RECORDING" | "UPLOADING" | "PROCESSING" | "APPROVED" | "REJECTED" | "NEEDS_REVIEW";

interface Inspection {
  id: string;
  owner_id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  cor: string | null;
  fipe_valor: string | null;
  nome_associado: string | null;
  telefone_associado: string | null;
  tipo_vistoria: "NOVA" | "MIGRACAO";
  mode: "PRESENCIAL" | "REMOTE";
  status: Status;
  ai_approved: boolean | null;
  ai_reason: string | null;
  ai_result: Record<string, unknown> | null;
  ai_processed_at: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: string;
  completed_at: string | null;
  profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
}

interface Capture {
  id: string;
  kind: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  signed_url: string | null;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  DRAFT:        { label: "Rascunho",      cls: "border-gray-500/40 bg-gray-500/10 text-gray-300" },
  RECORDING:    { label: "Gravando",      cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  UPLOADING:    { label: "Enviando",      cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  PROCESSING:   { label: "Analisando IA", cls: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
  APPROVED:     { label: "Aprovada",      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  REJECTED:     { label: "Reprovada",     cls: "border-red-500/40 bg-red-500/10 text-red-300" },
  NEEDS_REVIEW: { label: "Precisa revisão", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
};

export function InspectionsReport() {
  const [data, setData] = useState<Inspection[]>([]);
  const [totais, setTotais] = useState({ total: 0, aprovadas: 0, rejeitadas: 0, revisao: 0, processando: 0 });
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inspection | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter !== "ALL" ? `?status=${filter}` : "";
      const r = await fetch(`/api/admin/inspections${q}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        setData(j.data || []);
        setTotais(j.totais || { total: 0, aprovadas: 0, rejeitadas: 0, revisao: 0, processando: 0 });
      }
    } catch { /* silencioso */ } finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  if (loading && data.length === 0) {
    return <div className="rounded-xl border border-loog-border bg-loog-panel/40 p-8 text-center text-loog-muted">Carregando vistorias...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Total" value={totais.total} />
        <Stat label="Aprovadas" value={totais.aprovadas} cls="border-emerald-500/40 bg-emerald-500/10" />
        <Stat label="Reprovadas" value={totais.rejeitadas} cls="border-red-500/40 bg-red-500/10" />
        <Stat label="Revisão" value={totais.revisao} cls="border-amber-500/40 bg-amber-500/10" />
        <Stat label="Processando" value={totais.processando} cls="border-violet-500/40 bg-violet-500/10" />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["ALL", "PROCESSING", "APPROVED", "REJECTED", "NEEDS_REVIEW"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              filter === s ? "border-loog-brand bg-loog-brand/15 text-loog-brand" : "border-loog-border bg-loog-panel/60 text-loog-muted hover:text-white",
            )}
          >{s === "ALL" ? "Todas" : STATUS_META[s].label}</button>
        ))}
      </div>

      {data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-loog-border bg-loog-panel/20 p-8 text-center text-sm text-loog-muted">
          Nenhuma vistoria {filter === "ALL" ? "ainda" : "no filtro"}. Quando os consultores fizerem vistorias, aparecem aqui.
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((v) => {
            const prof = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles;
            const meta = STATUS_META[v.status];
            return (
              <li
                key={v.id}
                onClick={() => setSelected(v)}
                className="group cursor-pointer rounded-xl border border-loog-border bg-loog-panel/60 p-3 transition hover:border-loog-brand/60 hover:bg-loog-panel"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white">{v.placa}</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", meta.cls)}>{meta.label}</span>
                      <span className="text-[10px] text-loog-muted">{v.tipo_vistoria === "MIGRACAO" ? "🔄 Migração" : "🆕 Nova"}</span>
                    </div>
                    <div className="mt-1 text-xs text-white">
                      {v.marca} {v.modelo} {v.ano && `· ${v.ano}`} {v.cor && `· ${v.cor}`}
                    </div>
                    <div className="mt-1 text-[11px] text-loog-muted">
                      Associado: {v.nome_associado || "—"} · Consultor: {prof?.full_name || prof?.email || "—"}
                    </div>
                    {v.ai_reason && (
                      <div className="mt-1 text-[11px] italic text-loog-muted/90">IA: &ldquo;{v.ai_reason}&rdquo;</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-[10px] text-loog-muted">
                    {new Date(v.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AnimatePresence>
        {selected && <InspectionDetail inspection={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls?: string }) {
  return (
    <div className={cn("rounded-xl border p-3", cls ?? "border-loog-border bg-loog-panel/60")}>
      <div className="font-display text-2xl font-extrabold text-white sm:text-3xl">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-loog-muted">{label}</div>
    </div>
  );
}

// ───────────────────── Drawer de detalhe ────────────────────────────────────
function InspectionDetail({ inspection, onClose }: { inspection: Inspection; onClose: () => void }) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loadingCaptures, setLoadingCaptures] = useState(true);

  useEffect(() => {
    (async () => {
      setLoadingCaptures(true);
      try {
        const r = await fetch(`/api/admin/inspections/${inspection.id}/captures`, { cache: "no-store" });
        const j = await r.json();
        if (j.ok) setCaptures(j.data || []);
      } catch { /* silencioso */ } finally { setLoadingCaptures(false); }
    })();
  }, [inspection.id]);

  const prof = Array.isArray(inspection.profiles) ? inspection.profiles[0] : inspection.profiles;
  const ai = inspection.ai_result as Record<string, unknown> | null;
  const video = captures.find((c) => c.kind === "VIDEO");
  const fotos = captures.filter((c) => c.kind !== "VIDEO");

  return (
    <>
      <motion.div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        className="fixed right-0 top-0 z-50 h-full w-full overflow-y-auto border-l border-loog-border bg-loog-bg shadow-2xl sm:max-w-2xl"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 320 }}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-loog-border bg-loog-bg/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg font-bold">🎥 {inspection.placa}</h2>
            <p className="truncate text-[11px] text-loog-muted">{inspection.marca} {inspection.modelo} · {inspection.ano}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-loog-muted hover:bg-white/5">✕</button>
        </header>

        <div className="space-y-4 p-4">
          {/* status + resumo */}
          <div className={cn("rounded-xl border p-3", STATUS_META[inspection.status].cls)}>
            <div className="text-xs font-bold uppercase">{STATUS_META[inspection.status].label}</div>
            {inspection.ai_reason && <p className="mt-1 text-sm">{inspection.ai_reason}</p>}
          </div>

          {/* dados */}
          <div className="rounded-xl border border-loog-border bg-loog-panel/40 p-3">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">Dados</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-loog-muted">Associado</dt><dd className="text-white">{inspection.nome_associado || "—"}</dd>
              <dt className="text-loog-muted">Telefone</dt><dd className="font-mono text-white">{inspection.telefone_associado || "—"}</dd>
              <dt className="text-loog-muted">Tipo</dt><dd className="text-white">{inspection.tipo_vistoria === "MIGRACAO" ? "Migração" : "Nova"} · {inspection.mode}</dd>
              <dt className="text-loog-muted">FIPE</dt><dd className="text-white">{inspection.fipe_valor || "—"}</dd>
              <dt className="text-loog-muted">Consultor</dt><dd className="truncate text-white">{prof?.full_name || prof?.email || "—"}</dd>
              <dt className="text-loog-muted">GPS</dt><dd className="font-mono text-[10px] text-white">{inspection.gps_lat && inspection.gps_lng ? `${inspection.gps_lat.toFixed(5)}, ${inspection.gps_lng.toFixed(5)}` : "—"}</dd>
              <dt className="text-loog-muted">Criada</dt><dd className="text-white">{new Date(inspection.created_at).toLocaleString("pt-BR")}</dd>
              {inspection.completed_at && (<><dt className="text-loog-muted">Concluída</dt><dd className="text-white">{new Date(inspection.completed_at).toLocaleString("pt-BR")}</dd></>)}
            </dl>
          </div>

          {/* vídeo */}
          {video && (
            <div className="rounded-xl border border-loog-border bg-loog-panel/40 p-3">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">Vídeo gravado</h3>
              {video.signed_url ? (
                <video src={video.signed_url} controls preload="metadata" className="w-full rounded-lg bg-black" />
              ) : <p className="text-xs text-loog-muted">URL indisponível</p>}
            </div>
          )}

          {/* fotos */}
          {fotos.length > 0 && (
            <div className="rounded-xl border border-loog-border bg-loog-panel/40 p-3">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">Fotos ({fotos.length})</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {fotos.map((c) => (
                  <a key={c.id} href={c.signed_url ?? "#"} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-lg border border-loog-border bg-black">
                    {c.signed_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.signed_url} alt={c.kind} className="h-32 w-full object-cover" />
                    ) : <div className="h-32 w-full" />}
                    <div className="px-2 py-1 text-[10px] text-loog-muted group-hover:text-white">{c.kind}</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {loadingCaptures && <p className="text-center text-xs text-loog-muted">Carregando arquivos...</p>}
          {!loadingCaptures && captures.length === 0 && <p className="text-center text-xs text-loog-muted">Nenhum arquivo capturado.</p>}

          {/* análise IA completa (JSON) */}
          {ai && (
            <div className="rounded-xl border border-loog-border bg-loog-panel/40 p-3">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">Análise IA completa</h3>
              <details>
                <summary className="cursor-pointer text-xs text-loog-muted hover:text-white">Expandir JSON</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-black/50 p-2 text-[10px] text-emerald-200">
{JSON.stringify(ai, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}
