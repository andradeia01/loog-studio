import { bandToCrop } from "./detect";
import { REELS_H, REELS_W, SPEED_FACTOR, type CropBand, type RenderSettings } from "./types";

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

const TITLE_MAX_W = REELS_W - 2 * 72;
const TITLE_GAP = 40;
const SAFE_TOP = 120;

/** Quebra o título em linhas e reduz a fonte até caber em no máximo 4 linhas. */
function layoutTitle(ctx: OffscreenCanvasRenderingContext2D, text: string) {
  const paragraphs = text.trim().split(/\n+/);
  for (let size = 72; size >= 36; size -= 4) {
    ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
    const lines: string[] = [];
    for (const p of paragraphs) {
      let line = "";
      for (const word of p.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > TITLE_MAX_W && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
    }
    if (lines.length <= 4 || size === 36) return { size, lines, lineHeight: Math.round(size * 1.18) };
  }
  throw new Error("unreachable");
}

/** Pré-renderiza o título (igual em todos os quadros) numa camada própria. */
function renderTitleLayer(text: string, color: string) {
  if (!text.trim()) return null;
  const probe = new OffscreenCanvas(1, 1).getContext("2d")!;
  const { size, lines, lineHeight } = layoutTitle(probe, text);
  const pad = 12;
  const canvas = new OffscreenCanvas(REELS_W, lines.length * lineHeight + pad * 2);
  const ctx = canvas.getContext("2d")!;
  ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  lines.forEach((l, i) => ctx.fillText(l, REELS_W / 2, pad + i * lineHeight));
  return canvas;
}

/** Posição do conteúdo e do título no quadro 9:16. */
function reelsLayout(cw: number, ch: number, titleH: number) {
  const reserved = titleH ? titleH + TITLE_GAP + SAFE_TOP : 0;
  let scale = REELS_W / cw;
  if (ch * scale > REELS_H - reserved) scale = (REELS_H - reserved) / ch;
  const dw = Math.round(cw * scale);
  const dh = Math.round(ch * scale);
  let y = Math.round((REELS_H - dh) / 2);
  if (titleH && y - TITLE_GAP - titleH < SAFE_TOP) y = SAFE_TOP + titleH + TITLE_GAP;
  return { x: Math.round((REELS_W - dw) / 2), y, dw, dh, titleY: y - TITLE_GAP - titleH };
}

type Ctx2D = OffscreenCanvasRenderingContext2D;
/** Desenha a faixa de conteúdo (já recortada) no retângulo de destino. */
type Paint = (ctx: Ctx2D, dx: number, dy: number, dw: number, dh: number) => void;

/**
 * Monta o quadro final (fundo, conteúdo, título, overlay). Usado tanto no
 * export quanto na prévia, pra prévia ser fiel ao arquivo gerado.
 */
export function createCompositor(s: RenderSettings, cw: number, ch: number) {
  let outW: number;
  let outH: number;
  if (s.mode === "reels") {
    outW = REELS_W;
    outH = REELS_H;
  } else {
    const scale = Math.min(1, REELS_W / cw);
    outW = Math.floor((cw * scale) / 2) * 2;
    outH = Math.floor((ch * scale) / 2) * 2;
  }

  const titleLayer = s.mode === "reels" ? renderTitleLayer(s.title, s.titleColor) : null;
  const layout = s.mode === "reels" ? reelsLayout(cw, ch, titleLayer?.height ?? 0) : null;

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingQuality = "high";

  // Fundo desfocado barato: reduz o quadro a 36×64, desfoca numa tela média
  // (blur em 270×480 custa pouco) e só então amplia pro quadro final.
  const blurSmall = s.background === "blur" ? new OffscreenCanvas(36, 64) : null;
  const blurCtx = blurSmall?.getContext("2d") ?? null;
  const blurMid = blurSmall ? new OffscreenCanvas(270, 480) : null;
  const blurMidCtx = blurMid?.getContext("2d") ?? null;
  if (blurMidCtx) blurMidCtx.filter = "blur(10px)";

  const compose = (paint: Paint) => {
    if (!layout) {
      paint(ctx, 0, 0, outW, outH);
    } else {
      if (blurCtx && blurSmall && blurMid && blurMidCtx) {
        const cover = Math.max(36 / cw, 64 / ch);
        paint(blurCtx, (36 - cw * cover) / 2, (64 - ch * cover) / 2, cw * cover, ch * cover);
        // margem negativa esconde a borda clara que o blur cria nos cantos
        blurMidCtx.drawImage(blurSmall, -20, -20, 310, 520);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(blurMid, 0, 0, outW, outH);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, outW, outH);
      } else {
        ctx.fillStyle = s.background === "white" ? "#FFFFFF" : s.background === "color" ? s.backgroundColor : "#000000";
        ctx.fillRect(0, 0, outW, outH);
      }
      paint(ctx, layout.x, layout.y, layout.dw, layout.dh);
      if (titleLayer) ctx.drawImage(titleLayer, 0, layout.titleY);
    }
    if (s.overlay) ctx.drawImage(s.overlay, 0, 0, outW, outH);
    return canvas;
  };

  return { outW, outH, compose };
}

/** Prévia estática a partir da thumbnail, com as mesmas regras do export. */
export async function renderPreview(
  thumb: HTMLImageElement,
  band: CropBand,
  s: RenderSettings,
): Promise<OffscreenCanvas> {
  await loadTitleFont();
  const sy = band.top * thumb.naturalHeight;
  const sh = (band.bottom - band.top) * thumb.naturalHeight;
  const sw = thumb.naturalWidth;
  // Usa as proporções da thumb; a escala absoluta não muda o layout.
  const k = 1080 / sw;
  const comp = createCompositor(s, Math.round(sw * k), Math.max(2, Math.round(sh * k)));
  return comp.compose((ctx, dx, dy, dw, dh) => {
    if (s.mirror) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(thumb, 0, sy, sw, sh, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(thumb, 0, sy, sw, sh, dx, dy, dw, dh);
    }
  });
}

function loadTitleFont() {
  return document.fonts?.load("800 64px Inter").catch(() => undefined) ?? Promise.resolve();
}

export async function renderReel(job: RenderJob): Promise<Blob> {
  const mb = await import("mediabunny");
  const { settings: s } = job;

  const crop = bandToCrop(job.band, job.width, job.height);
  await loadTitleFont();
  const { outW, outH, compose } = createCompositor(s, crop.width, crop.height);
  const speed = s.speedUp ? SPEED_FACTOR : 1;

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
        processedWidth: outW,
        processedHeight: outH,
        process: (sample) => {
          const canvas = compose((ctx, dx, dy, dw, dh) => sample.draw(ctx, dx, dy, dw, dh));
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
