/**
 * Extrai a wordmark e o símbolo de infinito da arte-quadrada oficial da LOOG.
 * Gera:
 *   /public/brand/loog-full.png       — wordmark + símbolo (logo horizontal, fundo transparente)
 *   /public/brand/loog-mark.png       — só o símbolo de infinito (para favicon / avatar)
 *   /public/brand/loog-full-black.png — versão com fundo preto oficial
 *   /public/favicon.ico               — favicon derivado
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC = "C:/Users/admin.immuno/Desktop/HALISSON - LOOG/assets/logo-loog-square-1x1.png";
const OUT_DIR = path.join(process.cwd(), "public", "brand");

await fs.mkdir(OUT_DIR, { recursive: true });

// Detecta bounding box de pixels não-pretos usando threshold.
async function detectBBox(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // pixel não-preto: soma > 60
      if (r + g + b > 60) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const srcBuf = await fs.readFile(SRC);
const bbox = await detectBBox(srcBuf);
console.log("bbox do logo:", bbox);

// versão sobre fundo preto — cropada tight
const blackBg = await sharp(srcBuf).extract(bbox).png({ compressionLevel: 9 }).toBuffer();
await fs.writeFile(path.join(OUT_DIR, "loog-full-black.png"), blackBg);

// Torna pixels do fundo preto transparentes preservando o metálico do infinito.
// Estratégia: alpha ≡ max(r,g,b) — pixels totalmente pretos ficam invisíveis,
// cinzas do metálico ficam semi-transparentes, brancos/azuis 100% opacos.
// Depois multiplicamos os canais RGB por (255/alpha) para compensar o pré-
// multiplicação e manter as cores originais quando compostas sobre qualquer fundo.
async function keyOutBlack(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    const alpha = Math.max(r, g, b);
    if (alpha === 0) {
      out[i + 3] = 0;
    } else {
      // preserva a cor do pixel dividindo pelo alpha (equivale a "unmultiply")
      const scale = 255 / alpha;
      out[i] = Math.min(255, Math.round(r * scale));
      out[i + 1] = Math.min(255, Math.round(g * scale));
      out[i + 2] = Math.min(255, Math.round(b * scale));
      out[i + 3] = alpha;
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const transparent = await keyOutBlack(blackBg);
await fs.writeFile(path.join(OUT_DIR, "loog-full.png"), transparent);

// símbolo (esquerda do logo): pegar aprox 30% da largura
const markW = Math.round(bbox.width * 0.28);
const markBuf = await sharp(srcBuf)
  .extract({ left: bbox.left, top: bbox.top, width: markW, height: bbox.height })
  .png()
  .toBuffer();
const markT = await keyOutBlack(markBuf);
await fs.writeFile(path.join(OUT_DIR, "loog-mark.png"), markT);

// favicon 128x128 quadrado com fundo preto
const favicon = await sharp(blackBg)
  .resize({ width: 128, height: 128, fit: "contain", background: "#08090B" })
  .png()
  .toBuffer();
await fs.writeFile(path.join(process.cwd(), "public", "icon.png"), favicon);

console.log("[brand] arquivos salvos em", OUT_DIR);
