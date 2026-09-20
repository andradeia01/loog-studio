import sharp from "sharp";
import path from "node:path";
import { TextStyle } from "../types";
import { escapeXml } from "../utils";

/**
 * Renderiza um bloco de texto como PNG usando `sharp({ text: … })`, que
 * internamente aciona Pango + HarfBuzz.
 *
 * IMPORTANTE: no ambiente serverless (Netlify Lambda) o sistema não tem
 * a fonte Inter instalada, então o Pango caía em tofu (□□□). Passamos
 * `fontfile` apontando para os TTFs empacotados em public/fonts/.
 *
 * Faz autofit: tenta o fontSize solicitado; se o resultado não couber em
 * (maxWidth × maxHeight), reduz progressivamente até `minFontSize`.
 */

export interface RenderedText {
  buffer: Buffer;
  width: number;
  height: number;
  fontSize: number;
}

const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

/** Escolhe o TTF do Inter pelo peso; cai no Regular se pedir peso não empacotado. */
function fontFileFor(weight: number): string {
  if (weight >= 900) return path.join(FONTS_DIR, "Inter-Black.ttf");
  if (weight >= 700) return path.join(FONTS_DIR, "Inter-Bold.ttf");
  if (weight >= 600) return path.join(FONTS_DIR, "Inter-SemiBold.ttf");
  return path.join(FONTS_DIR, "Inter-Regular.ttf");
}

/** Nome da família como o Pango vai enxergar depois de carregar o arquivo. */
function fontFamilyFor(weight: number): string {
  if (weight >= 900) return "Inter Black";
  if (weight >= 700) return "Inter Bold";
  if (weight >= 600) return "Inter SemiBold";
  return "Inter";
}

function fontString(style: TextStyle, size: number): string {
  const family = fontFamilyFor(style.fontWeight);
  // Sharp/Pango espera "Family Style Size" em pontos (não pixels).
  return `${family} ${Math.round(size)}`;
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
    const image = sharp({
      text: {
        text: markup(text, style),
        font: fontString(style, fontSize),
        fontfile: fontFileFor(style.fontWeight),
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
    // Sharp text dá quebra automática dentro de `width`. Checamos só altura.
    if (heightOk) return r;
    fontSize -= 2;
  }
  return renderOnce(text, style, minFont, maxWidth);
}
