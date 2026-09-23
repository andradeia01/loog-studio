import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import { TextStyle } from "../types";
import { escapeXml } from "../utils";

/**
 * Renderiza um bloco de texto como PNG usando `sharp({ text: … })`, que
 * internamente aciona Pango + HarfBuzz.
 *
 * Estratégia de fontes:
 *   1. Tenta ler os TTFs de public/fonts (funciona em dev e quando o
 *      outputFileTracingIncludes copiou pro bundle da function).
 *   2. Se não achar (Netlify Lambda pode não incluir), baixa do CDN
 *      público do próprio site e cacheia em /tmp/loog-fonts/ (persistente
 *      durante a vida do container Lambda).
 */

export interface RenderedText {
  buffer: Buffer;
  width: number;
  height: number;
  fontSize: number;
}

interface FontSpec {
  weight: number;
  filename: string;
  family: string;
}

const FONT_SPECS: FontSpec[] = [
  { weight: 400, filename: "Inter-Regular.ttf",  family: "Inter" },
  { weight: 600, filename: "Inter-SemiBold.ttf", family: "Inter SemiBold" },
  { weight: 700, filename: "Inter-Bold.ttf",     family: "Inter Bold" },
  { weight: 900, filename: "Inter-Black.ttf",    family: "Inter Black" },
];

const PUBLIC_DIR = path.join(process.cwd(), "public", "fonts");
const CACHE_DIR = path.join(os.tmpdir(), "loog-fonts");
const CDN_BASE =
  process.env.LOOG_FONT_CDN
  || process.env.NEXT_PUBLIC_SITE_URL
  || "https://loogstudio.netlify.app";

const resolvedPaths = new Map<number, string>();

async function ensureFont(spec: FontSpec): Promise<string> {
  const cached = resolvedPaths.get(spec.weight);
  if (cached) return cached;

  const localPath = path.join(PUBLIC_DIR, spec.filename);
  if (fs.existsSync(localPath)) {
    resolvedPaths.set(spec.weight, localPath);
    return localPath;
  }

  // fallback: baixa do CDN pra /tmp
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  const tmpPath = path.join(CACHE_DIR, spec.filename);
  if (!fs.existsSync(tmpPath)) {
    const url = `${CDN_BASE.replace(/\/$/, "")}/fonts/${spec.filename}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`falha ao baixar ${spec.filename}: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await fsp.writeFile(tmpPath, buf);
    console.log(`[text] fonte baixada pra ${tmpPath} (${buf.length} bytes)`);
  }
  resolvedPaths.set(spec.weight, tmpPath);
  return tmpPath;
}

function pickSpec(weight: number): FontSpec {
  if (weight >= 900) return FONT_SPECS[3]!;
  if (weight >= 700) return FONT_SPECS[2]!;
  if (weight >= 600) return FONT_SPECS[1]!;
  return FONT_SPECS[0]!;
}

function markup(text: string, style: TextStyle): string {
  const letterSpacingAttr = style.letterSpacing
    ? ` letter_spacing="${Math.round(style.letterSpacing * 1024)}"`
    : "";
  return `<span foreground="${style.color}"${letterSpacingAttr}>${escapeXml(text)}</span>`;
}

async function renderOnce(
  text: string,
  style: TextStyle,
  fontSize: number,
  maxWidth: number,
): Promise<RenderedText | null> {
  try {
    const spec = pickSpec(style.fontWeight);
    const fontfile = await ensureFont(spec);
    const image = sharp({
      text: {
        text: markup(text, style),
        font: `${spec.family} ${Math.round(fontSize)}`,
        fontfile,
        rgba: true,
        width: Math.max(1, Math.round(maxWidth)),
        align: style.align,
        wrap: "word",
      },
    });
    const buffer = await image.png().toBuffer();
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width ?? 0, height: meta.height ?? 0, fontSize };
  } catch (err) {
    console.warn("[text] falha ao renderizar", err);
    return null;
  }
}

export async function renderText(
  raw: string,
  style: TextStyle,
  maxWidth: number,
  maxHeight?: number,
): Promise<RenderedText | null> {
  const text = style.uppercase ? raw.toLocaleUpperCase("pt-BR") : raw;
  const minFont = Math.max(8, style.minFontSize);
  let fontSize = style.fontSize;

  while (fontSize >= minFont) {
    const r = await renderOnce(text, style, fontSize, maxWidth);
    if (!r) return null;
    const heightOk = maxHeight ? r.height <= maxHeight : true;
    if (heightOk) return r;
    fontSize -= 2;
  }
  return renderOnce(text, style, minFont, maxWidth);
}
