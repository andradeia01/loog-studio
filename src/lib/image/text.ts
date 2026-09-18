import sharp from "sharp";
import { TextStyle } from "../types";
import { escapeXml } from "../utils";

/**
 * Renderiza um bloco de texto como PNG usando `sharp({ text: … })`, que
 * internamente aciona Pango + HarfBuzz — cobre fontes do sistema, kerning
 * e Unicode completo (Ã, Ç, á, etc.), diferente do renderer SVG do librsvg.
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

function fontString(style: TextStyle, size: number): string {
  const weight =
    style.fontWeight >= 800 ? "Heavy" :
    style.fontWeight >= 700 ? "Bold" :
    style.fontWeight >= 600 ? "Semibold" :
    style.fontWeight >= 500 ? "Medium" :
    "Regular";
  // Pango espera "Family Style Size" em pontos. Ex.: "Inter Bold 42"
  // Sharp aceita string única — usa em ordem os famílias separadas por vírgula.
  return `${style.fontFamily}, Arial, sans-serif ${weight} ${size}`;
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
    // Sharp text dá quebra automática dentro de `width` — checamos só altura.
    if (heightOk) return r;
    fontSize -= 2;
  }
  // último recurso: renderiza no mínimo, aceitando estouro visual.
  return renderOnce(text, style, minFont, maxWidth);
}
