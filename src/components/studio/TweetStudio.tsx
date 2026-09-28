"use client";

import { useEffect, useRef, useState } from "react";
import { cn, slugify, timestamp } from "@/lib/utils";
import { drawWatermarkSync, preloadWatermark } from "@/lib/watermark";
import { loadConsultant } from "@/lib/storage";

/**
 * Gerador de post estático estilo Tweet (X/Twitter) — 100% client-side.
 * Formatos: 1:1 (feed), 4:5 (feed vertical), 9:16 (story).
 */

type Theme = "dark" | "light";
type Format = "1x1" | "4x5" | "9x16";

interface Consultant {
  name: string;
  handle: string;
  photoDataUrl?: string | null;
  city?: string | null;
}

const DIM: Record<Format, { w: number; h: number }> = {
  "1x1": { w: 1080, h: 1080 },
  "4x5": { w: 1080, h: 1350 },
  "9x16": { w: 1080, h: 1920 },
};

export function TweetStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState(
    "Se um dia rolar sinistro, você vai querer ter LOOG do lado. Simples assim.",
  );
  const [theme, setTheme] = useState<Theme>("dark");
  const [format, setFormat] = useState<Format>("4x5");
  const [verified, setVerified] = useState(true);
  const [consultant, setConsultant] = useState<Consultant>({
    name: "Consultor LOOG",
    handle: "@consultor.loog",
    photoDataUrl: null,
    city: null,
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // preload marca d'água + hidrata dados do consultor local
  useEffect(() => {
    void preloadWatermark().then(() => setReady(true));
    const c = loadConsultant();
    if (c) {
      setConsultant((prev) => ({
        ...prev,
        name: c.name || prev.name,
        handle: c.instagram ? (c.instagram.startsWith("@") ? c.instagram : `@${c.instagram.replace(/^@/, "")}`) : prev.handle,
        city: c.city || null,
        photoDataUrl: c.photoDataUrl || null,
      }));
      if (c.photoDataUrl) setPhotoPreview(c.photoDataUrl);
    }
  }, []);

  // redesenha sempre que qualquer input muda
  useEffect(() => {
    if (!ready) return;
    void render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, text, theme, format, verified, consultant.name, consultant.handle, photoPreview]);

  async function render() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = DIM[format];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const palette = theme === "dark"
      ? { bg: "#0A0A0A", card: "#16181C", text: "#E7E9EA", muted: "#71767B", accent: "#1D9BF0" }
      : { bg: "#F7F9FA", card: "#FFFFFF", text: "#0F1419", muted: "#536471", accent: "#1D9BF0" };

    // Fundo com halo azul LOOG
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);
    const halo = ctx.createRadialGradient(w * 0.5, h * 0.15, 0, w * 0.5, h * 0.15, w * 0.9);
    halo.addColorStop(0, "rgba(0, 71, 171, 0.28)");
    halo.addColorStop(1, "rgba(0, 71, 171, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // Card do tweet — centralizado, margem 60px, aspect variável
    const cardX = 60;
    const cardW = w - 120;
    const paddingX = 56;
    const paddingY = 56;

    // Header dimensions
    const avatarSize = 108;
    const headerH = avatarSize + 20;

    // Fit text — auto ajusta fontsize pra caber
    const textMaxW = cardW - paddingX * 2;
    const { size: fontSize, lines, lineHeight } = fitText(ctx, text, textMaxW, format);

    const textBlockH = lines.length * lineHeight;
    const footerH = 40;
    const cardH = paddingY * 2 + headerH + 32 + textBlockH + 40 + footerH;

    const cardY = Math.round((h - cardH) / 2);

    // Sombra + card
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, cardX, cardY, cardW, cardH, 32);
    ctx.fillStyle = palette.card;
    ctx.fill();
    ctx.restore();

    // Border sutil
    ctx.strokeStyle = theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
    ctx.lineWidth = 2;
    roundRect(ctx, cardX, cardY, cardW, cardH, 32);
    ctx.stroke();

    // Avatar
    const avX = cardX + paddingX;
    const avY = cardY + paddingY;
    await drawAvatar(ctx, avX, avY, avatarSize, photoPreview);

    // Nome + verificado + handle
    const nameX = avX + avatarSize + 20;
    const nameY = avY + 12;
    ctx.fillStyle = palette.text;
    ctx.font = `700 34px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = "top";
    const displayName = truncate(ctx, consultant.name || "Consultor LOOG", cardW - (nameX - cardX) - paddingX - 48);
    ctx.fillText(displayName, nameX, nameY);
    if (verified) {
      const nameWidth = ctx.measureText(displayName).width;
      drawVerified(ctx, nameX + nameWidth + 12, nameY + 22, 14, palette.accent);
    }
    ctx.fillStyle = palette.muted;
    ctx.font = `500 26px "Inter", system-ui, sans-serif`;
    ctx.fillText(consultant.handle || "@consultor.loog", nameX, nameY + 46);

    // Botão "•••" no canto direito (opcional decorativo)
    ctx.fillStyle = palette.muted;
    ctx.font = `700 32px sans-serif`;
    ctx.fillText("···", cardX + cardW - paddingX - 32, avY + 8);

    // Texto principal (tweet)
    ctx.fillStyle = palette.text;
    ctx.font = `500 ${fontSize}px "Inter", system-ui, sans-serif`;
    let ty = cardY + paddingY + headerH + 32;
    for (const line of lines) {
      ctx.fillText(line, cardX + paddingX, ty);
      ty += lineHeight;
    }

    // Footer: hora + Instagram
    const now = new Date();
    const hour = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const dateStr = `${hour}:${min} · ${now.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
    ctx.fillStyle = palette.muted;
    ctx.font = `400 24px "Inter", system-ui, sans-serif`;
    ctx.fillText(`${dateStr} · Feito pela LOOG`, cardX + paddingX, cardY + cardH - paddingY - footerH + 8);

    // Divisor
    ctx.strokeStyle = theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cardX + paddingX, cardY + cardH - paddingY - 4);
    ctx.lineTo(cardX + cardW - paddingX, cardY + cardH - paddingY - 4);
    ctx.stroke();

    // Marca d'água LOOG (canto inferior direito do frame, fora do card)
    drawWatermarkSync(ctx, w, h);
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png", 0.95));
      if (!blob) throw new Error("blob null");
      const filename = `LOOG-tweet-${slugify(text.slice(0, 40))}-${timestamp()}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try { await nav.share({ files: [file], title: "Post LOOG" }); return; } catch {}
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally { setBusy(false); }
  }

  const previewDim = DIM[format];
  const displayW = 360;
  const displayH = Math.round((displayW * previewDim.h) / previewDim.w);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* Painel de controles */}
      <div className="space-y-4">
        <div className="card space-y-3 p-4 sm:p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Texto do tweet</h3>
          <textarea
            className="input min-h-[140px] resize-y text-base"
            placeholder="Escreve aqui o que iria postar no X…"
            maxLength={280}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-[10px] text-loog-muted">{text.length}/280 caracteres</p>
        </div>

        <div className="card space-y-3 p-4 sm:p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Tema</h3>
          <div className="grid grid-cols-2 gap-2">
            {(["dark", "light"] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-sm font-semibold transition",
                  theme === t ? "border-loog-brand2 bg-loog-brand/20 text-white" : "border-loog-border text-loog-muted hover:text-white",
                )}
              >
                {t === "dark" ? "🌑 Escuro" : "☀️ Claro"}
              </button>
            ))}
          </div>
        </div>

        <div className="card space-y-3 p-4 sm:p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Formato</h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { k: "4x5" as Format, l: "Feed", h: "4:5" },
                { k: "1x1" as Format, l: "Quadrado", h: "1:1" },
                { k: "9x16" as Format, l: "Story", h: "9:16" },
              ]
            ).map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setFormat(o.k)}
                className={cn(
                  "flex flex-col items-center rounded-lg border px-2 py-2.5 text-xs transition",
                  format === o.k ? "border-loog-brand2 bg-loog-brand/20 font-semibold text-white" : "border-loog-border text-loog-muted hover:text-white",
                )}
              >
                <span>{o.l}</span>
                <span className="text-[10px] opacity-60">{o.h}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card space-y-3 p-4 sm:p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Perfil</h3>
          <div>
            <label className="label mb-1.5">Nome</label>
            <input
              className="input"
              value={consultant.name}
              onChange={(e) => setConsultant({ ...consultant, name: e.target.value })}
              placeholder="Seu nome"
            />
          </div>
          <div>
            <label className="label mb-1.5">@ do Instagram / X</label>
            <input
              className="input"
              value={consultant.handle}
              onChange={(e) => setConsultant({ ...consultant, handle: e.target.value })}
              placeholder="@voceloog"
            />
          </div>
          <div>
            <label className="label mb-1.5">Foto (opcional)</label>
            <input type="file" accept="image/*" className="input !py-2" onChange={onPhotoFile} />
          </div>
          <label className="flex items-center gap-2 pt-1 text-sm text-loog-muted">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              className="h-4 w-4 accent-loog-brand2"
            />
            Selo verificado
          </label>
        </div>

        <button type="button" className="btn-primary w-full" onClick={download} disabled={busy || !ready}>
          {busy ? "Preparando…" : "📥 Baixar imagem"}
        </button>
      </div>

      {/* Preview */}
      <div className="card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Preview</h3>
          <span className="text-[10px] text-loog-muted">
            {previewDim.w} × {previewDim.h}px
          </span>
        </div>
        <div className="flex justify-center overflow-hidden rounded-xl border border-loog-border bg-black p-3">
          <canvas
            ref={canvasRef}
            style={{ width: displayW, height: displayH, maxWidth: "100%" }}
            className="rounded-lg"
          />
        </div>
        <p className="mt-3 text-[11px] text-loog-muted">
          Gerado no seu celular, nada sobe pro servidor. A logo LOOG aparece automática no canto.
        </p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

interface FitResult { size: number; lines: string[]; lineHeight: number }

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, format: Format): FitResult {
  // tamanho inicial depende da altura do formato (mais alto = pode fonte maior)
  const startSize = format === "9x16" ? 68 : format === "1x1" ? 54 : 62;
  const minSize = 32;
  const maxLines = format === "9x16" ? 12 : format === "1x1" ? 9 : 10;

  for (let size = startSize; size >= minSize; size -= 2) {
    ctx.font = `500 ${size}px "Inter", system-ui, sans-serif`;
    const lineHeight = Math.round(size * 1.28);
    const paragraphs = text.trim().split(/\n+/);
    const lines: string[] = [];
    for (const p of paragraphs) {
      const words = p.split(/\s+/);
      let line = "";
      for (const w of words) {
        const trial = line ? `${line} ${w}` : w;
        if (ctx.measureText(trial).width > maxW && line) {
          lines.push(line);
          line = w;
        } else line = trial;
      }
      if (line) lines.push(line);
    }
    if (lines.length <= maxLines) return { size, lines, lineHeight };
  }
  // último recurso: força tamanho mínimo, mesmo que estoure
  ctx.font = `500 ${minSize}px "Inter", system-ui, sans-serif`;
  return { size: minSize, lines: text.split("\n"), lineHeight: Math.round(minSize * 1.28) };
}

async function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, src: string | null) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (src) {
    try {
      const img = await loadImage(src);
      // cover
      const ar = img.naturalWidth / img.naturalHeight;
      let dw = size, dh = size;
      if (ar > 1) { dw = size * ar; }
      else { dh = size / ar; }
      const dx = x - (dw - size) / 2;
      const dy = y - (dh - size) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch {
      drawInitials(ctx, x, y, size);
    }
  } else {
    drawInitials(ctx, x, y, size);
  }
  ctx.restore();

  // ring azul LOOG
  ctx.strokeStyle = "#0047AB";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();
}

function drawInitials(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  // fallback: gradiente azul LOOG com iniciais
  const g = ctx.createLinearGradient(x, y, x + size, y + size);
  g.addColorStop(0, "#1C63FF");
  g.addColorStop(1, "#0047AB");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 ${Math.round(size * 0.4)}px "Inter", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("L", x + size / 2, y + size / 2 + 2);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawVerified(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (Math.PI * 2 * i) / 24;
    const rr = i % 2 === 0 ? r : r * 0.86;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.38, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.3);
  ctx.lineTo(cx + r * 0.4, cy - r * 0.28);
  ctx.stroke();
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img failed"));
    img.src = src;
  });
}
