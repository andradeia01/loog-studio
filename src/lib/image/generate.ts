import sharp, { OverlayOptions } from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  Consultant,
  ConsultantPhotoLayer,
  ImageLayer,
  Layer,
  Template,
  TextLayer,
} from "../types";
import { resolvePublicPath } from "../templates";
import { renderText } from "./text";
import { formatInstagram, formatPhoneBR } from "../utils";

/** Baixa uma URL ou lê um path local e retorna o buffer. */
async function fetchImage(src: string): Promise<Buffer | null> {
  const resolved = resolvePublicPath(src);
  if (/^https?:\/\//i.test(resolved)) {
    try {
      const r = await fetch(resolved);
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return Buffer.from(ab);
    } catch (err) {
      console.warn(`[generate] falha ao baixar ${resolved}`, err);
      return null;
    }
  }
  // fallback local (dev)
  const abs = path.isAbsolute(resolved)
    ? resolved
    : path.join(process.cwd(), "public", resolved.replace(/^\/+/, ""));
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

/**
 * Renderiza a arte final para um template + dados do consultor.
 * Retorna PNG em alta resolução (mesma dimensão do template).
 */
export async function generateArt(
  template: Template,
  consultant: Consultant,
): Promise<Buffer> {
  const { width, height } = template;

  // canvas base — se houver background, ele será a primeira camada;
  // caso contrário, começamos com transparente.
  let canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png();

  const overlays: OverlayOptions[] = [];

  for (const layer of template.layers) {
    if (layer.enabled === false) continue;
    const overlay = await buildOverlay(layer, consultant, template);
    if (Array.isArray(overlay)) overlays.push(...overlay);
    else if (overlay) overlays.push(overlay);
  }

  // Marca d'água LOOG (canto inferior direito, ~14% da largura)
  const wm = await buildWatermarkOverlay(width, height).catch((e) => {
    console.warn("[watermark] descartada:", e);
    return null;
  });
  if (wm) overlays.push(wm);

  if (overlays.length > 0) {
    canvas = canvas.composite(overlays);
  }

  const buffer = await canvas.png({ compressionLevel: 9, quality: 95 }).toBuffer();
  return buffer;
}

/**
 * Constrói overlay da marca d'água LOOG. Fallback ordenado:
 *   1) public/brand/loog-full.png no filesystem local (dev + Netlify c/ outputFileTracingIncludes)
 *   2) fetch do CDN público (Netlify serve /brand/* como static asset)
 * Se ambos falharem, retorna null e o export sai sem marca (silent fallback).
 */
async function buildWatermarkOverlay(
  frameW: number,
  frameH: number,
): Promise<OverlayOptions | null> {
  const buffer = await loadLogoBuffer();
  if (!buffer) return null;

  const targetW = Math.round(frameW * 0.14);
  const meta = await sharp(buffer).metadata();
  const scale = targetW / (meta.width ?? targetW);
  const targetH = Math.round((meta.height ?? 1) * scale);

  const resized = await sharp(buffer)
    .resize({ width: targetW, height: targetH, fit: "inside" })
    .ensureAlpha()
    .png()
    .toBuffer();

  const padX = Math.round(frameW * 0.035);
  const padY = Math.round(frameH * 0.035);
  return {
    input: resized,
    left: frameW - targetW - padX,
    top: frameH - targetH - padY,
    // Sharp aceita opacidade global via blend "over" — pra reduzir força usamos wm menor
  };
}

let cachedLogo: Buffer | null = null;
async function loadLogoBuffer(): Promise<Buffer | null> {
  if (cachedLogo) return cachedLogo;
  // 1) filesystem local
  const localPath = path.join(process.cwd(), "public", "brand", "loog-full.png");
  try {
    cachedLogo = await fs.readFile(localPath);
    return cachedLogo;
  } catch { /* fallback */ }
  // 2) CDN
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://loogstudio.netlify.app";
    const r = await fetch(`${base}/brand/loog-full.png`);
    if (!r.ok) return null;
    cachedLogo = Buffer.from(await r.arrayBuffer());
    return cachedLogo;
  } catch (err) {
    console.warn("[watermark] fetch logo falhou:", err);
    return null;
  }
}

async function buildOverlay(
  layer: Layer,
  consultant: Consultant,
  template: Template,
): Promise<OverlayOptions | OverlayOptions[] | null> {
  switch (layer.type) {
    case "background":
      return buildImageOverlay(
        { id: layer.id, type: "image", enabled: true, src: layer.src, x: 0, y: 0, width: template.width, height: template.height },
        template,
      );
    case "image":
      return buildImageOverlay(layer, template);
    case "consultantPhoto":
      return buildConsultantPhotoOverlay(layer, consultant);
    case "text":
      return buildTextOverlay(layer, consultant);
    default:
      return null;
  }
}

async function buildImageOverlay(layer: ImageLayer, template: Template): Promise<OverlayOptions | null> {
  const raw = await fetchImage(layer.src);
  if (!raw) {
    console.warn(`[generate] asset não encontrado: ${layer.src} (ignorando)`);
    return null;
  }
  const w = layer.width ?? template.width;
  const h = layer.height ?? template.height;
  const buf = await sharp(raw)
    .resize({ width: Math.round(w), height: Math.round(h), fit: "fill" })
    .png()
    .toBuffer();
  return { input: buf, left: Math.round(layer.x), top: Math.round(layer.y) };
}

async function buildConsultantPhotoOverlay(
  layer: ConsultantPhotoLayer,
  consultant: Consultant,
): Promise<OverlayOptions | null> {
  if (!consultant.photoDataUrl) return null;

  const [, mime, b64] = consultant.photoDataUrl.match(/^data:(.+?);base64,(.+)$/) ?? [];
  if (!b64 || !mime?.startsWith("image/")) return null;

  const raw = Buffer.from(b64, "base64");
  const w = Math.round(layer.width);
  const h = Math.round(layer.height);

  let img = sharp(raw).resize({
    width: w,
    height: h,
    fit: layer.fit === "contain" ? "contain" : "cover",
    position: "attention",
  });

  if (layer.borderRadius && layer.borderRadius > 0) {
    const r = Math.min(layer.borderRadius, Math.min(w, h) / 2);
    const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`;
    img = img.composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }]);
  }

  const buf = await img.png().toBuffer();
  return { input: buf, left: Math.round(layer.x), top: Math.round(layer.y) };
}

function resolveTextSource(layer: TextLayer, consultant: Consultant): string | null {
  switch (layer.source) {
    case "consultantName":
      return consultant.name?.trim() || null;
    case "consultantPhone": {
      const raw = consultant.phone?.trim();
      return raw ? formatPhoneBR(raw) : null;
    }
    case "consultantInstagram":
      return formatInstagram(consultant.instagram) || null;
    case "consultantCity":
      return consultant.city?.trim() || null;
    case "literal":
      return layer.literal ?? null;
    default:
      return null;
  }
}

async function buildTextOverlay(
  layer: TextLayer,
  consultant: Consultant,
): Promise<OverlayOptions | null> {
  const raw = resolveTextSource(layer, consultant);
  if (!raw) return null;

  const rendered = await renderText(raw, layer.style, layer.width, layer.height);
  if (!rendered) return null;
  return {
    input: rendered.buffer,
    left: Math.round(layer.x),
    top: Math.round(layer.y),
  };
}

/** Preview PNG rápido (baixa resolução) usado em testes de admin. */
export async function generatePreview(template: Template, consultant: Consultant): Promise<Buffer> {
  const full = await generateArt(template, consultant);
  return sharp(full)
    .resize({ width: Math.min(720, template.width) })
    .png({ quality: 80 })
    .toBuffer();
}
