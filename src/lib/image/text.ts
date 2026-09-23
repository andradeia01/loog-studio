import path from "node:path";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { TextStyle } from "../types";

/**
 * Renderiza um bloco de texto como PNG usando @napi-rs/canvas.
 * Trocamos Sharp+Pango porque o Pango do Netlify Lambda não estava
 * carregando as fontes custom via fontfile, resultando em tofu.
 *
 * Fonte: TTFs em public/fonts/ registrados globalmente com nome "Inter".
 * Se o arquivo não existir localmente (bundle Lambda sem tracing), baixa
 * do próprio CDN público do site pra /tmp/loog-fonts/.
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
}

const FONT_SPECS: FontSpec[] = [
  { weight: 400, filename: "Inter-Regular.ttf" },
  { weight: 600, filename: "Inter-SemiBold.ttf" },
  { weight: 700, filename: "Inter-Bold.ttf" },
  { weight: 900, filename: "Inter-Black.ttf" },
];

const PUBLIC_DIR = path.join(process.cwd(), "public", "fonts");
const CACHE_DIR = path.join(os.tmpdir(), "loog-fonts");
const CDN_BASE =
  process.env.LOOG_FONT_CDN
  || process.env.NEXT_PUBLIC_SITE_URL
  || "https://loogstudio.netlify.app";

let registered = false;
let registrationPromise: Promise<void> | null = null;

async function ensureRegistered(): Promise<void> {
  if (registered) return;
  if (registrationPromise) return registrationPromise;
  registrationPromise = (async () => {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
    for (const spec of FONT_SPECS) {
      const localPath = path.join(PUBLIC_DIR, spec.filename);
      let resolved: string | null = null;
      if (fs.existsSync(localPath)) {
        resolved = localPath;
      } else {
        const tmpPath = path.join(CACHE_DIR, spec.filename);
        if (!fs.existsSync(tmpPath)) {
          const url = `${CDN_BASE.replace(/\/$/, "")}/fonts/${spec.filename}`;
          const r = await fetch(url);
          if (!r.ok) {
            console.warn(`[text] falha ao baixar ${spec.filename}: HTTP ${r.status}`);
            continue;
          }
          const buf = Buffer.from(await r.arrayBuffer());
          await fsp.writeFile(tmpPath, buf);
          console.log(`[text] fonte ${spec.filename} baixada (${buf.length} bytes)`);
        }
        resolved = tmpPath;
      }
      if (resolved) {
        try {
          // Registra todas com a MESMA família "Inter"; canvas escolhe por weight.
          GlobalFonts.registerFromPath(resolved, "Inter");
        } catch (err) {
          console.warn(`[text] falha ao registrar ${spec.filename}`, err);
        }
      }
    }
    registered = true;
  })();
  return registrationPromise;
}

function alignToTextAlign(a: TextStyle["align"]): "left" | "center" | "right" {
  return a;
}

/**
 * Quebra linhas por palavra respeitando maxWidth (measureText).
 * Sem hyphenation: se uma palavra passa, quebra por char.
 */
function wrapLines(
  ctx: import("@napi-rs/canvas").SKRSContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    const words = p.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(trial).width <= maxWidth) {
        cur = trial;
      } else {
        if (cur) lines.push(cur);
        // se a palavra sozinha excede, quebra por char
        if (ctx.measureText(w).width > maxWidth) {
          let acc = "";
          for (const ch of w) {
            if (ctx.measureText(acc + ch).width <= maxWidth) acc += ch;
            else { if (acc) lines.push(acc); acc = ch; }
          }
          cur = acc;
        } else {
          cur = w;
        }
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

async function renderOnce(
  text: string,
  style: TextStyle,
  fontSize: number,
  maxWidth: number,
): Promise<RenderedText | null> {
  try {
    await ensureRegistered();
    const size = Math.round(fontSize);

    // canvas de medição
    const measure = createCanvas(1, 1);
    const mctx = measure.getContext("2d");
    mctx.font = `${style.fontWeight} ${size}px Inter`;

    const lines = wrapLines(mctx, text, maxWidth);
    const lineHeight = Math.round(size * style.lineHeight);
    const height = Math.max(lineHeight, lines.length * lineHeight);
    const width = Math.max(1, Math.round(maxWidth));

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.font = `${style.fontWeight} ${size}px Inter`;
    ctx.fillStyle = style.color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = alignToTextAlign(style.align);

    // letter-spacing (approx: draw char por char quando >0)
    const ls = style.letterSpacing || 0;

    const baseY = Math.round(size * 0.85);
    for (let i = 0; i < lines.length; i++) {
      const y = baseY + i * lineHeight;
      const line = lines[i]!;
      const x =
        ctx.textAlign === "center" ? width / 2 :
        ctx.textAlign === "right" ? width :
        0;

      if (ls > 0) {
        // Manual letter-spacing (canvas API não tem nativo)
        let cursor = x;
        if (ctx.textAlign === "center") {
          const totalW = ctx.measureText(line).width + ls * (line.length - 1);
          cursor = (width - totalW) / 2;
        } else if (ctx.textAlign === "right") {
          const totalW = ctx.measureText(line).width + ls * (line.length - 1);
          cursor = width - totalW;
        }
        ctx.textAlign = "left";
        for (const ch of line) {
          ctx.fillText(ch, cursor, y);
          cursor += ctx.measureText(ch).width + ls;
        }
        ctx.textAlign = alignToTextAlign(style.align);
      } else {
        ctx.fillText(line, x, y);
      }
    }

    const buffer = await canvas.encode("png");
    return { buffer, width, height, fontSize };
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
