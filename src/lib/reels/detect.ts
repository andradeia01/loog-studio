import type { CropBand } from "./types";

export interface ProbeResult {
  width: number;
  height: number;
  duration: number;
  thumbnail: string;
  band: CropBand;
}

const SAMPLE_W = 96;
const FRAMES = 10;

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Não foi possível ler este vídeo."));
    v.src = url;
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
}

/**
 * Lê o vídeo, gera thumbnail e detecta a faixa de conteúdo.
 *
 * Heurística: header e rodapé de repost são estáticos (texto sobre fundo liso),
 * o conteúdo se mexe. Amostramos ~10 quadros em baixa resolução, medimos a
 * variação temporal de cada linha e ficamos com o maior trecho contínuo "vivo".
 * Depois refinamos cada borda para a linha de maior contraste vertical
 * (a divisa entre a faixa lisa e o vídeo costuma ser bem marcada).
 */
export async function probeVideo(file: File): Promise<ProbeResult> {
  const url = URL.createObjectURL(file);
  try {
    const v = await loadVideo(url);
    const W = v.videoWidth;
    const H = v.videoHeight;
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    const sw = SAMPLE_W;
    const sh = Math.max(16, Math.round((SAMPLE_W * H) / W));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const frames: Float32Array[] = [];
    let thumbnail = "";
    for (let i = 0; i < FRAMES; i++) {
      const t = duration > 0 ? duration * (0.05 + (0.9 * i) / (FRAMES - 1)) : 0;
      await seek(v, t);
      ctx.drawImage(v, 0, 0, sw, sh);
      const px = ctx.getImageData(0, 0, sw, sh).data;
      const gray = new Float32Array(sw * sh);
      for (let p = 0, g = 0; p < px.length; p += 4, g++) {
        gray[g] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
      }
      frames.push(gray);
      if (i === Math.floor(FRAMES / 2)) thumbnail = captureThumb(v, W, H);
    }
    if (!thumbnail) thumbnail = captureThumb(v, W, H);

    return { width: W, height: H, duration, thumbnail, band: detectBand(frames, sw, sh) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function captureThumb(v: HTMLVideoElement, W: number, H: number): string {
  const tw = 360;
  const th = Math.round((tw * H) / W);
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  c.getContext("2d")!.drawImage(v, 0, 0, tw, th);
  return c.toDataURL("image/jpeg", 0.8);
}

export function detectBand(frames: Float32Array[], w: number, h: number): CropBand {
  const full: CropBand = { top: 0, bottom: 1 };
  if (frames.length < 2) return full;

  // Atividade temporal por linha: média de |f[k] - f[k-1]|.
  const activity = new Float32Array(h);
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k];
    const b = frames[k - 1];
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = 0; x < w; x++) s += Math.abs(a[y * w + x] - b[y * w + x]);
      activity[y] += s / w;
    }
  }
  let max = 0;
  for (let y = 0; y < h; y++) max = Math.max(max, activity[y]);
  if (max < 1) return full; // vídeo praticamente estático

  const threshold = Math.max(max * 0.1, 0.5);
  const alive = Array.from(activity, (a) => a > threshold);

  // Fecha buracos pequenos (partes paradas dentro do conteúdo).
  const maxGap = Math.round(h * 0.04);
  let lastAlive = -1;
  for (let y = 0; y < h; y++) {
    if (!alive[y]) continue;
    if (lastAlive >= 0 && y - lastAlive - 1 <= maxGap) {
      for (let g = lastAlive + 1; g < y; g++) alive[g] = true;
    }
    lastAlive = y;
  }

  // Maior trecho contínuo vivo.
  let bestStart = 0;
  let bestLen = 0;
  for (let y = 0; y < h; ) {
    if (!alive[y]) {
      y++;
      continue;
    }
    const start = y;
    while (y < h && alive[y]) y++;
    if (y - start > bestLen) {
      bestLen = y - start;
      bestStart = start;
    }
  }
  if (bestLen < h * 0.15) return full;

  // Refina bordas pela linha de maior gradiente vertical no quadro médio.
  const mean = new Float32Array(h);
  for (const f of frames) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = 0; x < w; x++) s += f[y * w + x];
      mean[y] += s / w / frames.length;
    }
  }
  const edge = (y: number) => (y <= 0 || y >= h ? 0 : Math.abs(mean[y] - mean[y - 1]));
  const refine = (y: number) => {
    const r = Math.max(2, Math.round(h * 0.02));
    let best = y;
    let bestE = edge(y);
    for (let d = -r; d <= r; d++) {
      const e = edge(y + d);
      if (e > bestE * 1.5) {
        bestE = e;
        best = y + d;
      }
    }
    return Math.min(h, Math.max(0, best));
  };

  const top = refine(bestStart) / h;
  const bottom = refine(bestStart + bestLen) / h;
  if (bottom - top > 0.97) return full;
  return { top, bottom };
}

/** Converte a faixa em retângulo de crop em pixels (valores pares, exigidos pelo encoder). */
export function bandToCrop(band: CropBand, width: number, height: number) {
  const floorEven = (n: number) => Math.floor(n / 2) * 2;
  const top = Math.min(floorEven(band.top * height), height - 2);
  const bottom = Math.min(height, Math.max(top + 2, Math.round(band.bottom * height)));
  return { left: 0, top, width: floorEven(width), height: floorEven(bottom - top) };
}
