"use client";

import { useCallback, useRef, useState } from "react";
import Cropper, { Area } from "react-easy-crop";

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";

export function PhotoUploader({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (file: File) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      alert("Foto muito grande. Máximo 10 MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("Envie uma imagem JPG, PNG ou WEBP.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setRawSrc(String(reader.result));
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    setCroppedPixels(areaPx);
  }, []);

  async function confirmCrop() {
    if (!rawSrc || !croppedPixels) return;
    setBusy(true);
    try {
      const dataUrl = await cropToDataUrl(rawSrc, croppedPixels);
      onChange(dataUrl);
      setRawSrc(null);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />

      {!rawSrc && !value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-44 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-loog-border bg-loog-panel/50 text-loog-muted transition hover:border-loog-brand/60 hover:text-white"
        >
          <span className="text-3xl">📸</span>
          <span className="mt-2 text-sm font-medium">Enviar foto</span>
          <span className="text-xs opacity-60">JPG · PNG · WEBP · até 10 MB</span>
        </button>
      )}

      {!rawSrc && value && (
        <div className="space-y-3">
          <div className="relative h-44 w-full overflow-hidden rounded-xl border border-loog-border bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Foto do consultor" className="h-full w-full object-cover" />
          </div>
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              Trocar foto
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => onChange(null)}
              aria-label="Remover foto"
            >
              Remover
            </button>
          </div>
        </div>
      )}

      {rawSrc && (
        <div className="space-y-3">
          <div className="relative h-72 w-full overflow-hidden rounded-xl border border-loog-border bg-black">
            <Cropper
              image={rawSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              cropShape="rect"
              showGrid
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-loog-muted">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-loog-brand"
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" type="button" onClick={confirmCrop} disabled={busy}>
              {busy ? "Salvando…" : "Confirmar enquadramento"}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                setRawSrc(null);
                setZoom(1);
                setCrop({ x: 0, y: 0 });
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Recorta a imagem para as coordenadas em pixels informadas pelo Cropper
 * e devolve um data URL PNG (máximo 1200×1200 para poupar memória).
 */
async function cropToDataUrl(src: string, area: Area): Promise<string> {
  const img = await loadImage(src);
  const MAX = 1200;
  const scale = Math.min(1, MAX / Math.max(area.width, area.height));
  const outW = Math.round(area.width * scale);
  const outH = Math.round(area.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
