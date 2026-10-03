/**
 * Gerador de PDF premium LOOG — identidade visual oficial, cover-page style.
 *
 * Objetivo: elevar a percepção de valor do consultor. O PDF é a "capa de vitrine"
 * da proposta, não um relatório técnico. Por isso:
 *   - Hero com veículo + investimento inicial em escala monumental
 *   - Benefícios mostrados COMO NOMES (sem valores por cobertura) — isso é regra
 *     da diretoria: valor detalhado por item atrapalha o fechamento
 *   - Diferenciais LOOG como selo de confiança
 *   - Consultor assinando o documento (ponte emocional)
 *
 * Stack: pdf-lib puro (sem binários nativos — Netlify Functions friendly).
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from "pdf-lib";
import { promises as fs } from "node:fs";
import path from "node:path";

// Paleta LOOG oficial — nunca improvisar fora dela
const AZUL = rgb(0 / 255, 71 / 255, 171 / 255);        // #0047AB
const AZUL2 = rgb(28 / 255, 99 / 255, 255 / 255);      // #1C63FF
const AZUL_PROFUNDO = rgb(0.02, 0.05, 0.14);           // overlay escuro p/ depth
const AZUL_PO = rgb(0.88, 0.93, 1);                    // texto sobre azul
const GRAFITE = rgb(35 / 255, 38 / 255, 44 / 255);     // #23262C
const PRETO = rgb(5 / 255, 6 / 255, 8 / 255);          // #050608
const CINZA = rgb(0.45, 0.47, 0.5);
const CINZA_LINHA = rgb(0.86, 0.88, 0.92);
const CREME = rgb(0.985, 0.985, 0.98);
const BRANCO = rgb(1, 1, 1);
const VERDE = rgb(0.09, 0.6, 0.33);
const AMBAR = rgb(0.95, 0.72, 0.1);

const A4 = { W: 595.28, H: 841.89 } as const;

export interface Consultant {
  name?: string | null;
  phone?: string | null;
  instagram?: string | null;
  city?: string | null;
}

export interface PremiumPdfInput {
  cliente: { nome: string; telefone?: string };
  veiculo: {
    placa: string;
    brand: string;
    model: string;
    modelYear: number;
    color?: string | null;
    categoria: string; // "carro" | "moto" | "caminhão"
    fipeFormatted: string;
  };
  valores: {
    mensalidade: number;              // em reais, ex: 326.90
    adesao: number;
    investimentoInicial: number;
    mensalidadeFormatted: string;
    adesaoFormatted: string;
    investimentoInicialFormatted: string;
  };
  // "Proteção Contratada" (base, não desligável)
  protecaoBase: string[];
  // "Adicionais Contratados" (toggles — já filtrados pelos ligados)
  adicionais: string[];
  diferenciais: Array<{ ok: boolean; texto: string }>;
  validadeDias: number;
  consultor: Consultant;
  protocolo: string;
}

export async function gerarPdfPremium(input: PremiumPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`LOOG — Cotação ${input.veiculo.placa}`);
  doc.setAuthor("LOOG Proteção Veicular");
  doc.setSubject(`Cotação ${input.veiculo.brand} ${input.veiculo.model}`);
  doc.setProducer("LOOG Studio");
  doc.setCreator("LOOG Studio");
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontObli = await doc.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldObli = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  const logo = await tryLoadLogo(doc);

  const page = doc.addPage([A4.W, A4.H]);

  // Fundo creme sutil (não branco puro — mais editorial)
  page.drawRectangle({ x: 0, y: 0, width: A4.W, height: A4.H, color: CREME });

  renderHero(page, { ...input, logo, font, fontBold, fontBoldObli });
  renderVeiculo(page, { ...input, font, fontBold });
  renderValores(page, { ...input, font, fontBold });
  renderBeneficios(page, { ...input, font, fontBold });
  renderDiferenciais(page, { ...input, font, fontBold });
  renderConsultor(page, { ...input, font, fontBold, fontObli });
  renderFooter(page, { font, fontObli });

  return await doc.save();
}

// ============================================================
// SEÇÕES
// ============================================================

interface SecCtx extends PremiumPdfInput {
  font: PDFFont;
  fontBold: PDFFont;
  fontObli?: PDFFont;
  fontBoldObli?: PDFFont;
  logo?: PDFImage | null;
}

function renderHero(page: PDFPage, ctx: SecCtx) {
  const H = 220;
  // Faixa azul profundo
  page.drawRectangle({ x: 0, y: A4.H - H, width: A4.W, height: H, color: AZUL });
  // Camada escura 20% sobreposta p/ profundidade (gradient fake)
  page.drawRectangle({ x: 0, y: A4.H - H, width: A4.W, height: H, color: AZUL_PROFUNDO, opacity: 0.18 });
  // Linha dourada sutil embaixo
  page.drawRectangle({ x: 0, y: A4.H - H - 2, width: A4.W, height: 2, color: AMBAR });

  // Logo LOOG (PNG) ou fallback vetor
  const logoY = A4.H - 72;
  if (ctx.logo) {
    const maxW = 110;
    const ratio = ctx.logo.height / ctx.logo.width;
    const w = maxW;
    const h = w * ratio;
    page.drawImage(ctx.logo, { x: 40, y: logoY - h / 2, width: w, height: h });
  } else {
    desenharMarcaVector(page, 40, logoY - 20, 40, BRANCO);
    page.drawText("LOOG", { x: 92, y: logoY - 8, size: 28, font: ctx.fontBold, color: BRANCO });
  }

  // Etiqueta "PROPOSTA DE PROTEÇÃO"
  const etiqY = A4.H - 118;
  page.drawText("PROPOSTA DE PROTEÇÃO VEICULAR", { x: 40, y: etiqY, size: 8, font: ctx.fontBold, color: AMBAR });
  // Barra divisória
  page.drawRectangle({ x: 40, y: etiqY - 6, width: 24, height: 1.5, color: AMBAR });

  // Saudação monumental
  const primNome = (ctx.cliente.nome.trim().split(/\s+/)[0] || "cliente").toUpperCase();
  page.drawText(`Olá, ${primNome}.`, { x: 40, y: A4.H - 160, size: 32, font: ctx.fontBold, color: BRANCO });
  page.drawText("Sua proteção começa aqui.", {
    x: 40, y: A4.H - 185, size: 13, font: (ctx.fontBoldObli ?? ctx.font), color: AZUL_PO,
  });

  // Lado direito — metadados do documento
  const hoje = new Date().toLocaleDateString("pt-BR");
  textRight(page, "EMITIDA EM", A4.W - 40, A4.H - 54, 7, ctx.fontBold, AMBAR);
  textRight(page, hoje, A4.W - 40, A4.H - 68, 11, ctx.fontBold, BRANCO);
  textRight(page, "PROTOCOLO", A4.W - 40, A4.H - 92, 7, ctx.fontBold, AMBAR);
  textRight(page, ctx.protocolo, A4.W - 40, A4.H - 106, 10, ctx.font, BRANCO);
  textRight(page, "VÁLIDA POR", A4.W - 40, A4.H - 128, 7, ctx.fontBold, AMBAR);
  textRight(page, `${ctx.validadeDias} dias`, A4.W - 40, A4.H - 142, 11, ctx.fontBold, BRANCO);
}

function renderVeiculo(page: PDFPage, ctx: SecCtx) {
  const yStart = A4.H - 220 - 32;
  const padX = 40;
  const bw = A4.W - padX * 2;
  const bh = 118;

  page.drawRectangle({
    x: padX, y: yStart - bh, width: bw, height: bh,
    color: BRANCO, borderColor: CINZA_LINHA, borderWidth: 0.8,
  });

  // etiqueta cat
  page.drawText(categoriaLabelUpper(ctx.veiculo.categoria), {
    x: padX + 20, y: yStart - 20, size: 8, font: ctx.fontBold, color: AZUL,
  });

  // Placa Mercosul (estilo chapa real BR)
  const placaW = 148;
  const placaH = 46;
  const placaX = padX + 20;
  const placaY = yStart - 20 - 10 - placaH;
  // moldura preta
  page.drawRectangle({ x: placaX, y: placaY, width: placaW, height: placaH, color: PRETO });
  // faixa azul topo
  page.drawRectangle({ x: placaX, y: placaY + placaH - 10, width: placaW, height: 10, color: AZUL });
  page.drawText("BR  MERCOSUL", {
    x: placaX + 8, y: placaY + placaH - 8, size: 6, font: ctx.fontBold, color: BRANCO,
  });
  // ∞ bandeira (fake)
  page.drawCircle({ x: placaX + placaW - 14, y: placaY + placaH - 5, size: 2.5, color: AMBAR });
  // nº da placa centrado, mono-ish
  const placaTxt = ctx.veiculo.placa;
  const placaFS = 24;
  const placaTxtW = ctx.fontBold.widthOfTextAtSize(placaTxt, placaFS);
  page.drawText(placaTxt, {
    x: placaX + (placaW - placaTxtW) / 2,
    y: placaY + 8,
    size: placaFS, font: ctx.fontBold, color: BRANCO,
  });

  // Lado direito do card: marca/modelo/ano/fipe
  const infoX = placaX + placaW + 28;
  const infoYTop = yStart - 36;
  page.drawText(trunc(ctx.veiculo.brand, 32), { x: infoX, y: infoYTop, size: 10, font: ctx.fontBold, color: AMBAR });
  page.drawText(trunc(ctx.veiculo.model, 48), { x: infoX, y: infoYTop - 18, size: 15, font: ctx.fontBold, color: PRETO });
  const sub = [
    `Ano modelo ${ctx.veiculo.modelYear}`,
    ctx.veiculo.color,
  ].filter(Boolean).join("  ·  ");
  page.drawText(sub, { x: infoX, y: infoYTop - 36, size: 10, font: ctx.font, color: CINZA });

  // bloco FIPE à direita
  const fipeX = A4.W - padX - 170;
  page.drawText("VALOR FIPE", { x: fipeX, y: infoYTop - 60, size: 7, font: ctx.fontBold, color: CINZA });
  page.drawText(ctx.veiculo.fipeFormatted, { x: fipeX, y: infoYTop - 76, size: 16, font: ctx.fontBold, color: AZUL });
}

function renderValores(page: PDFPage, ctx: SecCtx) {
  const yStart = A4.H - 220 - 32 - 118 - 24;
  const padX = 40;
  const bw = A4.W - padX * 2;
  const bh = 128;

  // Card principal — INVESTIMENTO INICIAL (azul monumental)
  const halfW = (bw - 14) / 2;
  const card1X = padX;
  const card1Y = yStart - bh;

  page.drawRectangle({ x: card1X, y: card1Y, width: halfW, height: bh, color: AZUL });
  page.drawRectangle({ x: card1X, y: card1Y, width: halfW, height: bh, color: AZUL_PROFUNDO, opacity: 0.1 });
  // tag âmbar canto
  page.drawRectangle({ x: card1X, y: card1Y + bh - 3, width: halfW, height: 3, color: AMBAR });

  page.drawText("INVESTIMENTO INICIAL", { x: card1X + 18, y: card1Y + bh - 24, size: 8.5, font: ctx.fontBold, color: AMBAR });
  // valor gigante
  page.drawText(ctx.valores.investimentoInicialFormatted, {
    x: card1X + 18, y: card1Y + bh - 68, size: 30, font: ctx.fontBold, color: BRANCO,
  });
  // decomposição
  page.drawText("1º boleto do associado", {
    x: card1X + 18, y: card1Y + bh - 86, size: 9, font: (ctx.fontBoldObli ?? ctx.font), color: AZUL_PO,
  });
  page.drawText(`${ctx.valores.mensalidadeFormatted} mensalidade + ${ctx.valores.adesaoFormatted} adesão`, {
    x: card1X + 18, y: card1Y + bh - 102, size: 8.5, font: ctx.font, color: AZUL_PO,
  });

  // Card secundário — VALOR TOTAL DO PLANO (branco com borda azul)
  const card2X = padX + halfW + 14;
  page.drawRectangle({ x: card2X, y: card1Y, width: halfW, height: bh, color: BRANCO, borderColor: AZUL, borderWidth: 1.5 });
  page.drawText("VALOR TOTAL DO PLANO", { x: card2X + 18, y: card1Y + bh - 24, size: 8.5, font: ctx.fontBold, color: AZUL });
  page.drawText(ctx.valores.mensalidadeFormatted, {
    x: card2X + 18, y: card1Y + bh - 68, size: 30, font: ctx.fontBold, color: AZUL,
  });
  page.drawText("mensalidade recorrente", { x: card2X + 18, y: card1Y + bh - 86, size: 9, font: (ctx.fontBoldObli ?? ctx.font), color: GRAFITE });
  page.drawText("boleto, cartão ou PIX", { x: card2X + 18, y: card1Y + bh - 102, size: 8.5, font: ctx.font, color: CINZA });
}

function renderBeneficios(page: PDFPage, ctx: SecCtx) {
  const yStart = A4.H - 220 - 32 - 118 - 24 - 128 - 24;
  const padX = 40;
  const maxW = A4.W - padX * 2 - 16;

  page.drawText("O QUE JÁ ESTÁ INCLUSO NO SEU PLANO", {
    x: padX, y: yStart, size: 11, font: ctx.fontBold, color: PRETO,
  });
  // linha fina âmbar
  page.drawRectangle({ x: padX, y: yStart - 6, width: 32, height: 1.5, color: AMBAR });

  let y = yStart - 24;

  // Proteção Contratada
  page.drawText("Proteção Contratada", { x: padX, y, size: 10, font: ctx.fontBold, color: AZUL });
  y -= 14;
  for (const item of ctx.protecaoBase) {
    y = drawCheckLine(page, padX, y, item, ctx.font, VERDE, maxW);
  }
  y -= 6;

  // Adicionais Contratados (podem estar vazios se consultor desligou tudo)
  if (ctx.adicionais.length > 0) {
    page.drawText("Adicionais Contratados", { x: padX, y, size: 10, font: ctx.fontBold, color: AZUL });
    y -= 14;
    for (const item of ctx.adicionais) {
      y = drawCheckLine(page, padX, y, item, ctx.font, VERDE, maxW);
    }
  }
}

function renderDiferenciais(page: PDFPage, ctx: SecCtx) {
  // Posicionamento relativo ao bottom
  const yBase = 170;
  const padX = 40;
  const bw = A4.W - padX * 2;
  const bh = 86;

  // bloco com fundo creme + borda âmbar fininha
  page.drawRectangle({ x: padX, y: yBase - bh, width: bw, height: bh, color: BRANCO, borderColor: AMBAR, borderWidth: 1 });
  // etiqueta no canto
  page.drawRectangle({ x: padX, y: yBase - 3, width: 72, height: 3, color: AMBAR });

  page.drawText("DIFERENCIAIS LOOG", { x: padX + 18, y: yBase - 22, size: 9, font: ctx.fontBold, color: AZUL });

  // layout em 2 colunas
  const colX = [padX + 18, padX + bw / 2];
  const colY = yBase - 42;
  for (let i = 0; i < ctx.diferenciais.length; i++) {
    const d = ctx.diferenciais[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const yy = colY - row * 15;
    const xx = colX[col];
    page.drawText(d.ok ? "✓" : "✗", {
      x: xx, y: yy, size: 11, font: ctx.fontBold, color: d.ok ? VERDE : rgb(0.75, 0.2, 0.2),
    });
    page.drawText(d.texto, { x: xx + 14, y: yy, size: 9.5, font: ctx.font, color: GRAFITE });
  }
}

function renderConsultor(page: PDFPage, ctx: SecCtx) {
  const yTop = 72;
  const padX = 40;
  const bw = A4.W - padX * 2;
  const bh = 46;

  // bloco preto editorial com texto branco
  page.drawRectangle({ x: padX, y: yTop, width: bw, height: bh, color: PRETO });
  // detalhe âmbar lateral
  page.drawRectangle({ x: padX, y: yTop, width: 4, height: bh, color: AMBAR });

  page.drawText("SEU CONSULTOR LOOG", { x: padX + 18, y: yTop + bh - 14, size: 7.5, font: ctx.fontBold, color: AMBAR });
  const nome = ctx.consultor.name ?? "LOOG Studio";
  page.drawText(nome.toUpperCase(), { x: padX + 18, y: yTop + bh - 30, size: 13, font: ctx.fontBold, color: BRANCO });

  const contato = [
    ctx.consultor.phone,
    ctx.consultor.instagram,
    ctx.consultor.city,
  ].filter(Boolean).join("  ·  ");
  page.drawText(contato, { x: padX + 18, y: yTop + bh - 42, size: 9, font: ctx.font, color: AZUL_PO });
}

function renderFooter(page: PDFPage, ctx: { font: PDFFont; fontObli: PDFFont }) {
  page.drawRectangle({ x: 0, y: 0, width: A4.W, height: 30, color: AZUL });
  page.drawText("loogprotecaoveicular.com.br", { x: 40, y: 11, size: 8.5, font: ctx.font, color: BRANCO });
  textRight(page, "0800 400 8888  ·  LOOG Proteção Veicular", A4.W - 40, 11, 8.5, ctx.font, BRANCO);
  page.drawText(
    "Associação de proteção veicular — não é seguradora. Valores sujeitos a aceitação e vistoria prévia.",
    { x: 40, y: 36, size: 6.5, font: ctx.fontObli, color: CINZA },
  );
}

// ============================================================
// HELPERS
// ============================================================

async function tryLoadLogo(doc: PDFDocument): Promise<PDFImage | null> {
  for (const file of ["loog-full.png", "loog-mark.png"]) {
    try {
      const buf = await fs.readFile(path.join(process.cwd(), "public", "brand", file));
      return await doc.embedPng(buf);
    } catch { /* try next */ }
  }
  // fallback: fetch de produção
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://loogstudio.netlify.app";
    const r = await fetch(`${base}/brand/loog-full.png`);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return await doc.embedPng(buf);
  } catch {
    return null;
  }
}

function desenharMarcaVector(page: PDFPage, x: number, y: number, size: number, color: ReturnType<typeof rgb>) {
  const r = size / 4;
  page.drawCircle({ x: x + r, y: y + r, size: r, borderColor: color, borderWidth: 2.5 });
  page.drawCircle({ x: x + 2.6 * r, y: y + r, size: r, borderColor: color, borderWidth: 2.5 });
}

function textRight(page: PDFPage, text: string, xRight: number, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xRight - w, y, size, font, color });
}

function drawCheckLine(page: PDFPage, x: number, y: number, text: string, font: PDFFont, markColor: ReturnType<typeof rgb>, maxW: number): number {
  const lines = wrap(text, font, 9.5, maxW);
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      page.drawText("✓", { x, y, size: 11, font, color: markColor });
    }
    page.drawText(lines[i], { x: x + 14, y, size: 9.5, font, color: GRAFITE });
    y -= 13;
  }
  return y - 2;
}

function trunc(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function categoriaLabelUpper(cat: string): string {
  const c = cat.toLowerCase();
  if (c === "moto") return "MOTOCICLETA";
  if (c === "caminhão" || c === "caminhao") return "CAMINHÃO";
  return "VEÍCULO PASSEIO";
}

/** Protocolo determinístico — útil pra referência em suporte. */
export function protocolo(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `LG${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Constantes publicadas (mesma lista usada na mensagem WhatsApp). */
export const PROTECAO_BASE = [
  "ASSISTÊNCIA 24H EM TODO TERRITÓRIO NACIONAL",
  "Reboque com KM ILIMITADO em casos de colisão e até 300km (150km ida e 150km volta) para pane Mecânica, Elétrica e Falta de Combustível",
];

export const DIFERENCIAIS_LOOG = [
  { ok: false, texto: "Sem Análise de Perfil" },
  { ok: false, texto: "Sem Consulta SPC e Serasa" },
  { ok: true, texto: "Pagamento mensal via Boleto, Cartão ou PIX" },
  { ok: true, texto: "Proteção MUITO COMPLETA" },
];
