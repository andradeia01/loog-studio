/**
 * Gera artes-placeholder para os 3 templates iniciais.
 *
 * Substitua os PNGs em /public/templates/<slug>/background.png (e thumbnail.jpg)
 * pelas suas artes reais. Enquanto isso, este script fabrica um background dark
 * com identidade LOOG para o sistema já funcionar de ponta a ponta.
 */

import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "public", "templates");

interface PlaceholderSpec {
  slug: string;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  variant: "protecao" | "vendas" | "recrutamento";
}

const SPECS: PlaceholderSpec[] = [
  {
    slug: "template-001",
    width: 1080,
    height: 1350,
    title: "PROTEÇÃO\nSEM APÓLICE",
    subtitle: "LOOG PROTEÇÃO VEICULAR",
    variant: "protecao",
  },
  {
    slug: "template-002",
    width: 1080,
    height: 1080,
    title: "FALE COMIGO\nAGORA",
    subtitle: "CONSULTOR AUTORIZADO LOOG",
    variant: "vendas",
  },
  {
    slug: "template-003",
    width: 1080,
    height: 1920,
    title: "SEJA UM\nCONSULTOR\nLOOG",
    subtitle: "PROGRAMA DE PARCEIROS",
    variant: "recrutamento",
  },
];

function accent(v: PlaceholderSpec["variant"]) {
  switch (v) {
    case "protecao":
      return "#0047AB";
    case "vendas":
      return "#1668E3";
    case "recrutamento":
      return "#3B82F6";
  }
}

function backgroundSvg(spec: PlaceholderSpec): string {
  const c = accent(spec.variant);
  const titleLines = spec.title.split("\n");
  const titleFontSize = Math.round(spec.width * 0.11);
  const subtitleFontSize = Math.round(spec.width * 0.028);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0A0E14"/>
      <stop offset="1" stop-color="#05070A"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="15%" r="55%">
      <stop offset="0" stop-color="${c}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${c}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <g stroke="#FFFFFF" stroke-opacity="0.06" stroke-width="1">
    ${Array.from({ length: 24 }).map((_, i) => `<line x1="0" y1="${(i * spec.height) / 24}" x2="${spec.width}" y2="${(i * spec.height) / 24}"/>`).join("")}
  </g>
  <g font-family="Inter, Arial, sans-serif" fill="#FFFFFF">
    <text x="60" y="120" font-size="${subtitleFontSize}" font-weight="700" letter-spacing="6" opacity="0.85">LOOG</text>
    <text x="60" y="${120 + subtitleFontSize + 6}" font-size="${subtitleFontSize * 0.7}" letter-spacing="4" opacity="0.55">${spec.subtitle}</text>
    ${titleLines
      .map(
        (ln, i) =>
          `<text x="60" y="${240 + titleFontSize + i * (titleFontSize + 8)}" font-size="${titleFontSize}" font-weight="800" letter-spacing="-2">${ln}</text>`,
      )
      .join("")}
    <rect x="60" y="${spec.height - 260}" width="${Math.round(spec.width * 0.4)}" height="4" fill="${c}"/>
  </g>
</svg>`;
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function writeIfMissing(file: string, buffer: Buffer) {
  try {
    await fs.access(file);
    return false; // já existe, não sobrescreve
  } catch {
    await fs.writeFile(file, buffer);
    return true;
  }
}

async function run() {
  for (const spec of SPECS) {
    const dir = path.join(ROOT, spec.slug);
    await ensureDir(dir);

    const svg = Buffer.from(backgroundSvg(spec));
    const bgPng = await sharp(svg).png({ compressionLevel: 9 }).toBuffer();
    const thumbJpg = await sharp(bgPng)
      .resize({ width: 720, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    const bgPath = path.join(dir, "background.png");
    const thumbPath = path.join(dir, "thumbnail.jpg");
    const bgWrote = await writeIfMissing(bgPath, bgPng);
    const thWrote = await writeIfMissing(thumbPath, thumbJpg);
    console.log(
      `[seed] ${spec.slug}: bg=${bgWrote ? "novo" : "mantido"} thumb=${thWrote ? "novo" : "mantido"}`,
    );
  }
  console.log("[seed] pronto.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
