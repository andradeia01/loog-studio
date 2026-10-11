"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Captura passo-a-passo dos 6 ângulos do veículo em LANDSCAPE forçado.
 * Lead rotaciona o celular, aponta pro ângulo pedido, aperta "Capturar".
 * Foto sobe imediata, UI avança pro próximo ângulo. 6 fotos no total.
 *
 * Cada upload vai com kind="FRAME" + metadata.angle=FRONT|LEFT|REAR|RIGHT|TOP|ENGINE
 * O endpoint /analyze já consome essas angles pra o prompt do Claude.
 */

type Angle = "FRONT" | "LEFT" | "REAR" | "RIGHT" | "TOP" | "ENGINE";

const SEQUENCE: Array<{
  key: Angle;
  label: string;
  instructions: string;
  icon: string;
  orientation: "landscape" | "portrait" | "any";
}> = [
  { key: "FRONT",  label: "Frontal",         instructions: "Fique de frente pro carro. Enquadre a frente INTEIRA (parachoque, faróis, placa).", icon: "🚗⬆️", orientation: "landscape" },
  { key: "LEFT",   label: "Lateral esquerda", instructions: "Vá pra lateral esquerda do carro. Capture do farol dianteiro até a lanterna traseira.", icon: "🚗⬅️", orientation: "landscape" },
  { key: "REAR",   label: "Traseira",         instructions: "Fique atrás do carro. Enquadre a traseira INTEIRA (parachoque, lanternas, placa).", icon: "🚗⬇️", orientation: "landscape" },
  { key: "RIGHT",  label: "Lateral direita",  instructions: "Vá pra lateral direita do carro. Capture do farol até a lanterna.", icon: "🚗➡️", orientation: "landscape" },
  { key: "TOP",    label: "Teto",             instructions: "Capture o teto do veículo (do capô, se possível com um pouco de distância).", icon: "🚗⬆️", orientation: "landscape" },
  { key: "ENGINE", label: "Motor (capô aberto)", instructions: "Abra o capô. Enquadre o motor inteiro, mostrando o compartimento.", icon: "🔧", orientation: "landscape" },
];

export function AngleCaptureStep({
  inspectionId,
  onNext,
  onError,
}: {
  inspectionId: string;
  onNext: () => void;
  onError: (msg: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [captured, setCaptured] = useState<Record<Angle, Blob | null>>({
    FRONT: null, LEFT: null, REAR: null, RIGHT: null, TOP: null, ENGINE: null,
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [isLandscape, setIsLandscape] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const atual = SEQUENCE[currentIndex];
  const total = SEQUENCE.length;
  const done = currentIndex >= total;

  // Detecta orientation (landscape vs portrait)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // Abre câmera traseira
  useEffect(() => {
    if (done) return;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        onError(`câmera: ${(err as Error).message}`);
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [done, onError]);

  // Captura 1 foto do stream da câmera
  const capturar = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setPreviewUrl(URL.createObjectURL(blob));
      setCaptured((c) => ({ ...c, [atual.key]: blob }));
    }, "image/jpeg", 0.88);
  }, [atual.key]);

  const refazer = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCaptured((c) => ({ ...c, [atual.key]: null }));
  };

  const confirmar = async () => {
    const blob = captured[atual.key];
    if (!blob) return;
    setUploading(true);
    setUploadMsg(`Enviando ${atual.label.toLowerCase()}…`);
    try {
      const form = new FormData();
      form.append("kind", "FRAME");
      form.append("file", blob, `${atual.key.toLowerCase()}.jpg`);
      form.append("metadata", JSON.stringify({ angle: atual.key, label: atual.label, sequence: currentIndex, total }));
      const r = await fetch(`/api/inspection/${inspectionId}/upload`, { method: "POST", body: form });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "upload falhou");
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setCurrentIndex((i) => i + 1);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setUploading(false);
      setUploadMsg("");
    }
  };

  // Quando acabou os 6, chama onNext
  useEffect(() => {
    if (done) onNext();
  }, [done, onNext]);

  // Progress bar superior
  const progress = (currentIndex / total) * 100;

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <div className="text-5xl">✅</div>
        <h3 className="mt-3 font-display text-lg font-bold text-white">6 ângulos capturados!</h3>
        <p className="mt-1 text-xs text-emerald-200">Prosseguindo pros documentos (odômetro + chassi)…</p>
      </div>
    );
  }

  // Se portrait: mostra bloqueio pedindo pra girar
  if (isLandscape === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-10 text-center">
        <motion.div
          className="text-7xl"
          animate={{ rotate: [0, 90, 90, 0], scale: [1, 0.9, 0.9, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, times: [0, 0.3, 0.7, 1] }}
        >
          📱
        </motion.div>
        <div>
          <h3 className="font-display text-xl font-black text-amber-100">Gire o celular</h3>
          <p className="mt-2 text-sm text-amber-200/90">
            A vistoria exige o celular na HORIZONTAL<br />pra enquadrar o carro inteiro.
          </p>
        </div>
        <p className="text-xs text-amber-200/70">Assim que girar, a câmera abre automática ↻</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="rounded-xl border border-loog-border bg-loog-panel/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-loog-muted">
            Passo {currentIndex + 1} de {total}
          </span>
          <span className="text-xs font-bold text-white">{atual.icon} {atual.label}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
          <motion.div
            className="h-full rounded-full bg-loog-brand"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <p className="mt-2 text-xs text-loog-muted">{atual.instructions}</p>
      </div>

      {/* Preview (câmera ao vivo OU foto capturada) */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-loog-brand/40 bg-black" style={{ aspectRatio: "16/9" }}>
        <AnimatePresence mode="wait">
          {previewUrl ? (
            <motion.img
              key="preview"
              src={previewUrl}
              alt="foto capturada"
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            />
          ) : (
            <motion.video
              key="camera"
              ref={videoRef}
              autoPlay playsInline muted
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>

        {/* Overlay com guia (silhueta/texto do ângulo esperado) */}
        {!previewUrl && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4">
            <div className="rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white backdrop-blur">
              {atual.icon} Aponte pra {atual.label.toLowerCase()}
            </div>
            {/* Moldura branca */}
            <div className="absolute inset-6 rounded-xl border-2 border-dashed border-white/40" />
            <div className="rounded-full bg-black/70 px-3 py-1 text-[10px] text-white backdrop-blur">
              Enquadre dentro da moldura
            </div>
          </div>
        )}
      </div>

      {/* Botões */}
      <div className="flex gap-2">
        {previewUrl ? (
          <>
            <button
              type="button"
              onClick={refazer}
              disabled={uploading}
              className="flex-1 rounded-xl border border-loog-border bg-loog-panel/60 px-4 py-3 text-sm font-bold text-loog-muted hover:bg-loog-panel disabled:opacity-50"
            >
              ↻ Refazer
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={uploading}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-glow hover:bg-emerald-400 disabled:opacity-50"
            >
              {uploading ? uploadMsg || "Enviando..." : currentIndex === total - 1 ? "✅ Finalizar" : "✓ Próximo"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={capturar}
            className="w-full rounded-xl bg-loog-brand px-4 py-4 text-base font-black text-white shadow-glow active:scale-95"
          >
            📸 Capturar {atual.label.toLowerCase()}
          </button>
        )}
      </div>

      {/* Mini-grid dos já capturados */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-loog-border bg-loog-panel/40 p-2">
        {SEQUENCE.map((s, i) => {
          const feito = !!captured[s.key] || i < currentIndex;
          const atualIdx = i === currentIndex;
          return (
            <div
              key={s.key}
              className={cn(
                "flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-md p-1.5 text-center text-[9px]",
                feito ? "bg-emerald-500/15 text-emerald-300"
                : atualIdx ? "bg-loog-brand/20 text-loog-brand ring-1 ring-loog-brand/50"
                : "text-loog-muted/60",
              )}
            >
              <span className={cn("text-sm", feito ? "" : atualIdx ? "animate-pulse" : "opacity-60")}>
                {feito ? "✅" : s.icon.split(/\s/)[0]}
              </span>
              <span className="font-semibold uppercase">{s.label.slice(0, 6)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
