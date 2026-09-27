"use client";

import { useEffect, useRef, useState } from "react";
import type { CropBand } from "@/lib/reels/types";

interface Props {
  file: File;
  band: CropBand;
  autoBand: CropBand;
  onSave: (band: CropBand) => void;
  onApplyAll: (band: CropBand) => void;
  onClose: () => void;
}

const MIN_BAND = 0.1;

/**
 * Editor manual: o vídeo toca embaixo e duas linhas arrastáveis marcam onde
 * começa e termina o conteúdo. O que fica fora (escurecido) é cortado.
 */
export function CropEditor({ file, band: initial, autoBand, onSave, onApplyAll, onClose }: Props) {
  const [band, setBand] = useState(initial);
  const [url, setUrl] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"top" | "bottom" | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setBand((b) =>
      dragging.current === "top"
        ? { ...b, top: Math.min(y, b.bottom - MIN_BAND) }
        : { ...b, bottom: Math.max(y, b.top + MIN_BAND) },
    );
  };

  const handle = (which: "top" | "bottom") => (
    <div
      role="slider"
      aria-label={which === "top" ? "Início do conteúdo" : "Fim do conteúdo"}
      aria-valuenow={Math.round((which === "top" ? band.top : band.bottom) * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        dragging.current = which;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.02 : 0.005;
        const d = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (!d) return;
        e.preventDefault();
        setBand((b) =>
          which === "top"
            ? { ...b, top: Math.min(Math.max(0, b.top + d), b.bottom - MIN_BAND) }
            : { ...b, bottom: Math.max(Math.min(1, b.bottom + d), b.top + MIN_BAND) },
        );
      }}
      className="absolute inset-x-0 z-10 flex h-6 -translate-y-1/2 cursor-ns-resize touch-none items-center outline-none"
      style={{ top: `${(which === "top" ? band.top : band.bottom) * 100}%` }}
    >
      <div className="h-0.5 w-full bg-loog-brand2 shadow-glow" />
      <span className="absolute left-1/2 -translate-x-1/2 rounded-full border border-loog-brand2 bg-loog-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
        {which === "top" ? "topo" : "base"}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur" onClick={onClose}>
      <div className="card flex max-h-full w-full max-w-md flex-col gap-4 overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="font-display text-lg font-bold">Ajustar corte</h2>
          <p className="text-xs text-loog-muted">Arraste as linhas azuis. A área escurecida sai do vídeo final.</p>
        </div>

        <div
          ref={boxRef}
          className="relative mx-auto w-full max-w-[300px] select-none overflow-hidden rounded-xl bg-black"
          onPointerMove={onPointerMove}
          onPointerUp={() => (dragging.current = null)}
        >
          {url && <video src={url} className="block w-full" muted loop autoPlay playsInline />}
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/70" style={{ height: `${band.top * 100}%` }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70" style={{ height: `${(1 - band.bottom) * 100}%` }} />
          {handle("top")}
          {handle("bottom")}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" className="chip" onClick={() => setBand(autoBand)}>Detecção automática</button>
          <button type="button" className="chip" onClick={() => setBand({ top: 0, bottom: 1 })}>Sem corte</button>
          <span className="ml-auto self-center text-loog-muted">
            mantém {Math.round((band.bottom - band.top) * 100)}% da altura
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-ghost flex-1" onClick={() => onApplyAll(band)}>
            Aplicar em todos
          </button>
          <button type="button" className="btn-primary flex-1" onClick={() => onSave(band)}>
            Salvar corte
          </button>
        </div>
      </div>
    </div>
  );
}
