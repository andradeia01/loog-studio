import { bandAspect, coverCrop } from "./detect";
import { getWatermarkBitmap, drawWatermarkWithBitmap } from "../watermark";
import { REELS_H, REELS_W, SPEED_FACTOR, THEMES, type CropBand, type RenderSettings } from "./types";

export interface RenderJob {
  file: File;
  width: number;
  height: number;
  band: CropBand;
  settings: RenderSettings;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

/** Retorna null se o navegador suporta o motor; senão, a mensagem pro usuário. */
export async function checkSupport(): Promise<string | null> {
  if (typeof window === "undefined" || typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    return "Seu navegador não suporta edição de vídeo local. Use Chrome, Edge ou Safari atualizados.";
  }
  const mb = await import("mediabunny");
  const video = await mb.getFirstEncodableVideoCodec(["avc"], { width: REELS_W, height: REELS_H });
  if (!video) return "Seu navegador não consegue gerar MP4 (H.264). Use Chrome ou Edge atualizados.";
  return null;
}

// ------------------------------------------------------------------ template
// Quadro 1080×1920: [foto · nome ✓ · @] + headline + espaço do vídeo,
// o bloco inteiro centralizado na vertical.

const PAD_X = 64;
const AVATAR = 132;
const MARGIN_Y = 120;
const GAP = 40;
const FONT = "Inter, system-ui, sans-serif";
const VERIFIED_BLUE = "#0095F6";

type Ctx2D = OffscreenCanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };

function fitText(ctx: Ctx2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function wrapHeadline(ctx: Ctx2D, text: string) {
  const maxW = REELS_W - 2 * PAD_X;
  const paragraphs = text.trim().split(/\n+/);
  for (let size = 66; size >= 40; size -= 4) {
    ctx.font = `800 ${size}px ${FONT}`;
    const lines: string[] = [];
    for (const p of paragraphs) {
      let line = "";
      for (const word of p.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxW && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
    }
    if (lines.length <= 5 || size === 40) return { size, lines: lines.slice(0, 6), lineHeight: Math.round(size * 1.2) };
  }
  throw new Error("unreachable");
}

function drawVerified(ctx: Ctx2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.fillStyle = VERIFIED_BLUE;
  // selo serrilhado como o do Instagram
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (Math.PI * 2 * i) / 24;
    const rr = i % 2 === 0 ? r : r * 0.86;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
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

async function loadAvatar(src: string | null) {
  if (!src) return null;
  try {
    return await createImageBitmap(await (await fetch(src)).blob());
  } catch {
    return null;
  }
}

/** Desenha o cabeçalho (perfil + headline) numa camada transparente, uma vez só. */
async function renderHeader(s: RenderSettings) {
  const theme = THEMES[s.theme];
  const { name, handle, verified } = s.profile;
  const hasProfile = !!(name.trim() || handle.trim() || s.profile.avatar);
  const probe = new OffscreenCanvas(1, 1).getContext("2d")!;
  const headline = s.headline.trim() ? wrapHeadline(probe, s.headline) : null;

  const profileH = hasProfile ? AVATAR : 0;
  const headlineGap = hasProfile && headline ? 36 : 0;
  const headlineH = headline ? headline.lines.length * headline.lineHeight : 0;
  const height = profileH + headlineGap + headlineH;
  if (!height) return null;

  const canvas = new OffscreenCanvas(REELS_W, height + 8);
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  if (hasProfile) {
    const avatar = await loadAvatar(s.profile.avatar);
    const cx = PAD_X + AVATAR / 2;
    const cy = AVATAR / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, AVATAR / 2, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
      ctx.drawImage(avatar, PAD_X, 0, AVATAR, AVATAR);
    } else {
      ctx.fillStyle = s.theme === "dark" ? "#262626" : "#EFEFEF";
      ctx.fillRect(PAD_X, 0, AVATAR, AVATAR);
      ctx.fillStyle = theme.muted;
      ctx.font = `700 56px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText((name.trim()[0] ?? handle.replace(/^@/, "")[0] ?? "?").toUpperCase(), cx, cy + 20);
      ctx.textAlign = "left";
    }
    ctx.restore();
    avatar?.close();

    const tx = PAD_X + AVATAR + 28;
    const maxW = REELS_W - PAD_X - tx;
    const cleanHandle = handle.trim().replace(/^@+/, "");
    const displayName = name.trim() || cleanHandle;
    const at = cleanHandle ? `@${cleanHandle}` : "";
    const nameY = at ? cy - 6 : cy + 16;

    ctx.fillStyle = theme.text;
    ctx.font = `700 48px ${FONT}`;
    const shownName = fitText(ctx, displayName, maxW - (verified ? 52 : 0));
    ctx.fillText(shownName, tx, nameY);
    if (verified) drawVerified(ctx, tx + ctx.measureText(shownName).width + 28, nameY - 17, 19);

    if (at) {
      ctx.fillStyle = theme.muted;
      ctx.font = `400 38px ${FONT}`;
      ctx.fillText(fitText(ctx, at, maxW), tx, cy + 46);
    }
  }

  if (headline) {
    ctx.fillStyle = theme.text;
    ctx.font = `800 ${headline.size}px ${FONT}`;
    ctx.textBaseline = "top";
    const y0 = profileH + headlineGap;
    headline.lines.forEach((l, i) => ctx.fillText(l, PAD_X, y0 + i * headline.lineHeight));
  }
  return canvas;
}

function slotAspect(s: RenderSettings, contentAspect: number) {
  switch (s.slot) {
    case "1:1":
      return 1;
    case "4:5":
      return 4 / 5;
    case "16:9":
      return 16 / 9;
    default:
      return Math.min(16 / 9, Math.max(3 / 4, contentAspect));
  }
}

/**
 * Monta o template e devolve o compositor de quadros. `contentAspect` é a
 * proporção da faixa de conteúdo detectada (usada no espaço "auto").
 */
export async function createTemplate(s: RenderSettings, contentAspect: number) {
  await document.fonts?.load("800 64px Inter").catch(() => undefined);
  const header = await renderHeader(s);
  const headerH = header ? header.height - 8 : 0;
  const headerBlock = headerH ? headerH + GAP : 0;

  let slotH = Math.round(REELS_W / slotAspect(s, contentAspect));
  const available = REELS_H - 2 * MARGIN_Y - headerBlock;
  if (slotH > available) slotH = available;
  const y0 = Math.max(MARGIN_Y, Math.round((REELS_H - headerBlock - slotH) / 2));
  const slot: Rect = { x: 0, y: y0 + headerBlock, w: REELS_W, h: slotH };

  const canvas = new OffscreenCanvas(REELS_W, REELS_H);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingQuality = "high";
  const bg = THEMES[s.theme].bg;

  // Pré-carrega a marca d'água LOOG (uma vez só). Se falhar, segue sem.
  const loogMark = await getWatermarkBitmap();

  /** `paint` desenha o conteúdo (já recortado na proporção do espaço) no retângulo dado. */
  const compose = (paint: (ctx: Ctx2D, r: Rect) => void) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, REELS_W, REELS_H);
    if (header) ctx.drawImage(header, 0, y0);
    paint(ctx, slot);
    if (s.overlay) ctx.drawImage(s.overlay, 0, 0, REELS_W, REELS_H);
    // Marca d'água LOOG — sempre última camada, canto inferior direito.
    if (loogMark) drawWatermarkWithBitmap(ctx, loogMark, REELS_W, REELS_H);
    return canvas;
  };

  return { slot, compose };
}

/** Prévia estática a partir da thumbnail, com as mesmas regras do export. */
export async function renderPreview(thumb: HTMLImageElement, band: CropBand, s: RenderSettings) {
  const W = thumb.naturalWidth;
  const H = thumb.naturalHeight;
  const { slot, compose } = await createTemplate(s, bandAspect(band, W, H));
  const c = coverCrop(band, W, H, slot.w / slot.h);
  return compose((ctx, r) => {
    if (s.mirror) {
      ctx.save();
      ctx.translate(r.x + r.w, r.y);
      ctx.scale(-1, 1);
      ctx.drawImage(thumb, c.left, c.top, c.width, c.height, 0, 0, r.w, r.h);
      ctx.restore();
    } else {
      ctx.drawImage(thumb, c.left, c.top, c.width, c.height, r.x, r.y, r.w, r.h);
    }
  });
}

// -------------------------------------------------------------------- export

export async function renderReel(job: RenderJob): Promise<Blob> {
  const mb = await import("mediabunny");
  const { settings: s } = job;
  const speed = s.speedUp ? SPEED_FACTOR : 1;

  const { slot, compose } = await createTemplate(s, bandAspect(job.band, job.width, job.height));
  const crop = coverCrop(job.band, job.width, job.height, slot.w / slot.h);

  const input = new mb.Input({ source: new mb.BlobSource(job.file), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const quality = s.quality === "high" ? mb.QUALITY_HIGH : mb.QUALITY_MEDIUM;

  try {
    const audioCodec = await mb.getFirstEncodableAudioCodec(["aac", "opus"]);

    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      tags: s.stripMetadata ? {} : undefined,
      video: {
        crop,
        flip: s.mirror,
        allowTransformationMetadata: false,
        codec: "avc",
        quality,
        forceTranscode: true,
        processedWidth: REELS_W,
        processedHeight: REELS_H,
        process: (sample) => {
          const canvas = compose((ctx, r) => sample.draw(ctx, r.x, r.y, r.w, r.h));
          if (speed === 1) return canvas;
          return new mb.VideoSample(canvas, {
            timestamp: sample.timestamp / speed,
            duration: sample.duration / speed,
          });
        },
      },
      audio: audioCodec
        ? {
            codec: audioCodec,
            quality,
            forceTranscode: speed !== 1 || s.stripMetadata,
            process: speed === 1 ? undefined : (sample) => speedUpAudio(mb, sample, speed),
          }
        : { discard: true },
    });

    if (!conversion.isValid) {
      throw new Error("Formato de vídeo não suportado neste navegador.");
    }
    conversion.onProgress = (p) => job.onProgress?.(p);
    const abort = () => void conversion.cancel();
    job.signal?.addEventListener("abort", abort);
    try {
      await conversion.execute();
    } finally {
      job.signal?.removeEventListener("abort", abort);
    }
  } finally {
    input.dispose();
  }

  const buffer = target.buffer;
  if (!buffer) throw new Error("A exportação não gerou dados.");
  return new Blob([buffer], { type: "video/mp4" });
}

/**
 * Acelera o áudio reamostrando (interpolação linear) — mesmo efeito do
 * `asetrate` do ffmpeg: fica 2% mais rápido e o tom sobe imperceptivelmente.
 */
function speedUpAudio(
  mb: typeof import("mediabunny"),
  sample: import("mediabunny").AudioSample,
  speed: number,
) {
  const channels = sample.numberOfChannels;
  const inFrames = sample.numberOfFrames;
  const outFrames = Math.max(1, Math.floor(inFrames / speed));
  const out = new Float32Array(outFrames * channels);
  const plane = new Float32Array(inFrames);
  for (let c = 0; c < channels; c++) {
    sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
    const base = c * outFrames;
    for (let i = 0; i < outFrames; i++) {
      const pos = i * speed;
      const i0 = Math.floor(pos);
      const i1 = Math.min(inFrames - 1, i0 + 1);
      const f = pos - i0;
      out[base + i] = plane[i0] * (1 - f) + plane[i1] * f;
    }
  }
  return new mb.AudioSample({
    data: out,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: sample.sampleRate,
    timestamp: sample.timestamp / speed,
  });
}
