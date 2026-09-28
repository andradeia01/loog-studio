import type { CropBand } from "./types";

export interface ProbeResult {
  width: number;
  height: number;
  duration: number;
  thumbnail: string;
  band: CropBand;
}

const SAMPLE_W = 96;
// Mobile Safari/Chrome trava com muitos seeks encadeados — detecta e reduz.
const IS_MOBILE = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const FRAMES = IS_MOBILE ? 4 : 10;
const LOAD_TIMEOUT_MS = 20_000;
const SEEK_TIMEOUT_MS = 3_500;
const TOTAL_TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    // "auto" trava iOS quando o arquivo é grande. metadata basta pra ler dimensões/duração
    // e o seek forçado por baixo carrega os frames sob demanda.
    v.preload = "metadata";
    (v as HTMLVideoElement & { crossOrigin: string }).crossOrigin = "anonymous";

    const cleanup = () => {
      v.onloadedmetadata = null;
      v.onerror = null;
      v.oncanplay = null;
    };
    v.onloadedmetadata = () => {
      cleanup();
      resolve(v);
    };
    v.onerror = () => {
      cleanup();
      reject(new Error("Formato não suportado pelo seu navegador (tente MP4 H.264)."));
    };
    v.src = url;
    // iOS Safari ignora `load()` sem gesture, mas call defensiva.
    try { v.load(); } catch {}
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!Number.isFinite(t) || t < 0) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener("seeked", finish);
      resolve();
    };
    v.addEventListener("seeked", finish, { once: true });
    try {
      v.currentTime = t;
    } catch (err) {
      done = true;
      reject(err);
    }
  });
}

/**
 * Lê o vídeo, gera thumbnail e detecta a faixa de conteúdo.
 *
 * Estratégia mobile-safe:
 * - preload=metadata (não baixa o arquivo inteiro)
 * - timeout por seek (Safari iOS às vezes engole `seeked`)
 * - se falhar/timeout, cai num modo simples: só dimensões + thumbnail do primeiro frame
 */
export async function probeVideo(file: File): Promise<ProbeResult> {
  return withTimeout(probeVideoInner(file), TOTAL_TIMEOUT_MS, "análise de vídeo").catch(async (err) => {
    console.warn("[probeVideo] fallback simples:", err instanceof Error ? err.message : err);
    return probeSimple(file);
  });
}

async function probeVideoInner(file: File): Promise<ProbeResult> {
  const url = URL.createObjectURL(file);
  try {
    const v = await withTimeout(loadVideo(url), LOAD_TIMEOUT_MS, "abrir vídeo");
    const W = v.videoWidth || 1080;
    const H = v.videoHeight || 1920;
    const rawDur = v.duration;
    const duration = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 0;
    const sw = SAMPLE_W;
    const sh = Math.max(16, Math.round((SAMPLE_W * H) / W));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D indisponível.");

    const frames: Float32Array[] = [];
    let thumbnail = "";

    for (let i = 0; i < FRAMES; i++) {
      const t = duration > 0 ? duration * (0.05 + (0.9 * i) / Math.max(1, FRAMES - 1)) : 0;
      try {
        await withTimeout(seek(v, t), SEEK_TIMEOUT_MS, `seek ${t.toFixed(2)}s`);
      } catch {
        // pula esse quadro em vez de travar
        continue;
      }
      try {
        ctx.drawImage(v, 0, 0, sw, sh);
        const px = ctx.getImageData(0, 0, sw, sh).data;
        const gray = new Float32Array(sw * sh);
        for (let p = 0, g = 0; p < px.length; p += 4, g++) {
          gray[g] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
        }
        frames.push(gray);
        if (!thumbnail && i === Math.min(1, FRAMES - 1)) thumbnail = captureThumb(v, W, H);
      } catch {
        // canvas tainted ou frame não decodável — pula
      }
    }
    if (!thumbnail) thumbnail = safeThumbAttempt(v, W, H);

    const band = frames.length >= 2 ? detectBand(frames, sw, sh) : { top: 0, bottom: 1 };
    return { width: W, height: H, duration, thumbnail, band };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Fallback: só carrega metadata + 1 thumb. Sem detecção de faixa (usa o vídeo inteiro).
 * Garante que o usuário mobile pelo menos vê o arquivo carregado e pode processar.
 */
async function probeSimple(file: File): Promise<ProbeResult> {
  const url = URL.createObjectURL(file);
  try {
    const v = await withTimeout(loadVideo(url), LOAD_TIMEOUT_MS, "abrir vídeo (simples)");
    const W = v.videoWidth || 1080;
    const H = v.videoHeight || 1920;
    const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    // pula o thumbnail se seek falhar; pode ficar em branco no card
    const thumbnail = safeThumbAttempt(v, W, H);
    return { width: W, height: H, duration, thumbnail, band: { top: 0, bottom: 1 } };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function safeThumbAttempt(v: HTMLVideoElement, W: number, H: number): string {
  try {
    return captureThumb(v, W, H);
  } catch {
    return "";
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

/**
 * Retângulo de crop (em pixels do vídeo original) que preenche um espaço de
 * proporção `aspect` (largura/altura): parte da faixa de conteúdo e corta o
 * excesso centralizado, como um "cover". Valores pares, exigidos pelo encoder.
 */
export function coverCrop(band: CropBand, width: number, height: number, aspect: number) {
  const floorEven = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  const bandTop = band.top * height;
  const bandH = Math.max(2, (band.bottom - band.top) * height);
  let w = width;
  let h = bandH;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  const cw = floorEven(w);
  const ch = floorEven(h);
  const left = Math.floor((width - cw) / 4) * 2;
  const top = Math.min(height - ch, Math.floor((bandTop + (bandH - h) / 2) / 2) * 2);
  return { left, top: Math.max(0, top), width: cw, height: ch };
}

/** Proporção (largura/altura) da faixa de conteúdo. */
export function bandAspect(band: CropBand, width: number, height: number) {
  return width / Math.max(1, (band.bottom - band.top) * height);
}
