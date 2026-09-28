/**
 * Marca d'água LOOG aplicada em TODOS os vídeos/imagens exportados.
 *
 * - Canto inferior direito, ~14% da largura
 * - Padding 4% em cada eixo (respeita safe area do Instagram Reels)
 * - Sombra sutil pra garantir legibilidade sobre qualquer fundo
 * - Opacidade 88%
 *
 * Funções separadas pra <canvas> (browser) e <offscreen> (worker/mediabunny).
 */

const LOGO_URL = "/brand/loog-full.png";
const REL_WIDTH = 0.14;   // 14% da largura do frame
const REL_PADDING = 0.035; // 3.5% em cada eixo
const OPACITY = 0.88;

// Cache de bitmap por sessão pra não refetchar
let cachedBitmap: ImageBitmap | null = null;
let cachedImage: HTMLImageElement | null = null;
let pendingBitmap: Promise<ImageBitmap | null> | null = null;
let pendingImage: Promise<HTMLImageElement | null> | null = null;

async function loadBitmap(): Promise<ImageBitmap | null> {
  if (cachedBitmap) return cachedBitmap;
  if (pendingBitmap) return pendingBitmap;
  pendingBitmap = (async () => {
    try {
      const r = await fetch(LOGO_URL, { cache: "force-cache" });
      if (!r.ok) return null;
      const blob = await r.blob();
      cachedBitmap = await createImageBitmap(blob);
      return cachedBitmap;
    } catch (e) {
      console.warn("[watermark] falha ao carregar logo:", e);
      return null;
    } finally {
      pendingBitmap = null;
    }
  })();
  return pendingBitmap;
}

async function loadImage(): Promise<HTMLImageElement | null> {
  if (cachedImage) return cachedImage;
  if (pendingImage) return pendingImage;
  pendingImage = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { cachedImage = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = LOGO_URL;
  }).finally(() => { pendingImage = null; });
  return pendingImage;
}

/** Pré-carrega o logo pra evitar delay no primeiro frame. Chamar no mount da tela. */
export async function preloadWatermark() {
  return Promise.all([loadBitmap(), loadImage()]);
}

/** Retorna o bitmap já carregado (pra uso em loops de encode síncronos). */
export async function getWatermarkBitmap(): Promise<ImageBitmap | null> {
  return loadBitmap();
}

/** Desenha marca d'água usando um bitmap JÁ pré-carregado, síncrono. */
export function drawWatermarkWithBitmap(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  frameWidth: number,
  frameHeight: number,
) {
  const logoW = Math.round(frameWidth * REL_WIDTH);
  const logoH = Math.round((bitmap.height / bitmap.width) * logoW);
  const padX = Math.round(frameWidth * REL_PADDING);
  const padY = Math.round(frameHeight * REL_PADDING);
  const x = frameWidth - logoW - padX;
  const y = frameHeight - logoH - padY;

  ctx.save();
  ctx.globalAlpha = OPACITY;
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = Math.max(8, Math.round(frameWidth * 0.008));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(bitmap, x, y, logoW, logoH);
  ctx.restore();
}

/** Desenha a marca d'água num canvas 2D já existente. */
export async function drawWatermark(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
) {
  const bitmap = await loadBitmap();
  if (!bitmap) return;

  const logoW = Math.round(frameWidth * REL_WIDTH);
  // preserva proporção
  const logoH = Math.round((bitmap.height / bitmap.width) * logoW);
  const padX = Math.round(frameWidth * REL_PADDING);
  const padY = Math.round(frameHeight * REL_PADDING);
  const x = frameWidth - logoW - padX;
  const y = frameHeight - logoH - padY;

  ctx.save();
  ctx.globalAlpha = OPACITY;
  // Sombra pra legibilidade sobre qualquer fundo (claro ou escuro).
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = Math.max(8, Math.round(frameWidth * 0.008));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(bitmap, x, y, logoW, logoH);
  ctx.restore();
}

/** Versão sync usando HTMLImageElement (pra loops de canvas na main thread). */
export function drawWatermarkSync(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
) {
  const img = cachedImage;
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const logoW = Math.round(frameWidth * REL_WIDTH);
  const logoH = Math.round((img.naturalHeight / img.naturalWidth) * logoW);
  const padX = Math.round(frameWidth * REL_PADDING);
  const padY = Math.round(frameHeight * REL_PADDING);
  const x = frameWidth - logoW - padX;
  const y = frameHeight - logoH - padY;

  ctx.save();
  ctx.globalAlpha = OPACITY;
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = Math.max(8, Math.round(frameWidth * 0.008));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.drawImage(img, x, y, logoW, logoH);
  ctx.restore();
}
