/**
 * Gerador de PDF premium LOOG — identidade visual oficial, cover-page style.
 *
 * ARQUITETURA DO LAYOUT:
 *   - Fluxo vertical decrescente (cursor `y` desce após cada bloco)
 *   - Cada render retorna o novo `y` para o próximo bloco
 *   - Se o cursor passar do bottom reservado, abre nova página
 *   - Rodapé é a última coisa desenhada (altura fixa reservada)
 *
 * Regra da diretoria: lista de benefícios só com NOMES, sem valor por cobertura
 * (valor por item atrapalha o fechamento).
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage, LineCapStyle } from "pdf-lib";
import { promises as fs } from "node:fs";
import path from "node:path";

// Paleta LOOG oficial
const AZUL = rgb(0 / 255, 71 / 255, 171 / 255);        // #0047AB
const AZUL2 = rgb(28 / 255, 99 / 255, 255 / 255);      // #1C63FF
const AZUL_PROFUNDO = rgb(0.02, 0.05, 0.14);
const AZUL_PO = rgb(0.88, 0.93, 1);
const GRAFITE = rgb(35 / 255, 38 / 255, 44 / 255);
const PRETO = rgb(5 / 255, 6 / 255, 8 / 255);
const CINZA = rgb(0.45, 0.47, 0.5);
const CINZA_LINHA = rgb(0.86, 0.88, 0.92);
const CREME = rgb(0.985, 0.985, 0.98);
const BRANCO = rgb(1, 1, 1);
const VERDE = rgb(0.09, 0.6, 0.33);
const AMBAR = rgb(0.95, 0.72, 0.1);
const VERMELHO = rgb(0.75, 0.2, 0.2);

const A4 = { W: 595.28, H: 841.89 } as const;
const MARGIN_X = 40;
const FOOTER_H = 44;      // altura reservada p/ rodapé
const BOTTOM_LIMIT = FOOTER_H + 20; // y abaixo disso = fim da página

export interface Consultant {
  name?: string | null;
  phone?: string | null;
  instagram?: string | null;
  city?: string | null;
}

export interface CenarioImagem {
  cenario: "incendio" | "enchente" | "batida" | "roubo";
  label: string;
  emoji: string;
  perdaPct: number;      // 0..1 (fator sobre FIPE)
  buffer: Uint8Array;    // PNG binário
}

export interface PremiumPdfInput {
  cliente: { nome: string; telefone?: string };
  veiculo: {
    placa: string;
    brand: string;
    model: string;
    modelYear: number;
    color?: string | null;
    categoria: string;
    fipeFormatted: string;
    fipeValueCents?: number; // novo — pra calcular perdas em R$
  };
  valores: {
    mensalidade: number;
    adesao: number;
    investimentoInicial: number;
    mensalidadeFormatted: string;
    adesaoFormatted: string;
    investimentoInicialFormatted: string;
  };
  protecaoBase: string[];
  adicionais: string[];
  diferenciais: Array<{ ok: boolean; texto: string }>;
  validadeDias: number;
  consultor: Consultant;
  protocolo: string;
  cenarios?: CenarioImagem[]; // opcional — se vier, adiciona página 2
}

interface FontBag {
  font: PDFFont;
  fontBold: PDFFont;
  fontObli: PDFFont;
  fontBoldObli: PDFFont;
}

export async function gerarPdfPremium(input: PremiumPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`LOOG — Cotação ${input.veiculo.placa}`);
  doc.setAuthor("LOOG Proteção Veicular");
  doc.setSubject(`Cotação ${input.veiculo.brand} ${input.veiculo.model}`);
  doc.setProducer("LOOG Studio");
  doc.setCreator("LOOG Studio");
  doc.setCreationDate(new Date());

  const fonts: FontBag = {
    font: await doc.embedFont(StandardFonts.Helvetica),
    fontBold: await doc.embedFont(StandardFonts.HelveticaBold),
    fontObli: await doc.embedFont(StandardFonts.HelveticaOblique),
    fontBoldObli: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const logo = await tryLoadLogo(doc);

  let page = doc.addPage([A4.W, A4.H]);
  page.drawRectangle({ x: 0, y: 0, width: A4.W, height: A4.H, color: CREME });

  // Fluxo linear
  let y = renderHero(page, input, fonts, logo);
  y = renderVeiculo(page, input, fonts, y - 24);
  y = renderValores(page, input, fonts, y - 22);
  y = renderBeneficios(page, input, fonts, y - 20);
  y = renderDiferenciais(page, input, fonts, y - 18);
  y = renderConsultor(page, input, fonts, y - 14);

  renderFooter(page, fonts);

  // ─── PÁGINA 2: Cenários de perda (quando temos imagens geradas) ─────────────
  if (input.cenarios && input.cenarios.length > 0) {
    await renderPaginaCenarios(doc, input, fonts, logo);
  }

  return await doc.save();
}

// ============================================================
// SEÇÕES
// ============================================================

function renderHero(page: PDFPage, input: PremiumPdfInput, f: FontBag, logo: PDFImage | null): number {
  const H = 200;
  const topY = A4.H;
  const base = topY - H;

  page.drawRectangle({ x: 0, y: base, width: A4.W, height: H, color: AZUL });
  page.drawRectangle({ x: 0, y: base, width: A4.W, height: H, color: AZUL_PROFUNDO, opacity: 0.18 });
  page.drawRectangle({ x: 0, y: base - 2, width: A4.W, height: 2, color: AMBAR });

  // Logo
  if (logo) {
    const maxW = 110;
    const ratio = logo.height / logo.width;
    page.drawImage(logo, { x: MARGIN_X, y: topY - 72, width: maxW, height: maxW * ratio });
  } else {
    drawLogoVector(page, MARGIN_X, topY - 60, 36, BRANCO);
    page.drawText("LOOG", { x: MARGIN_X + 52, y: topY - 50, size: 28, font: f.fontBold, color: BRANCO });
  }

  // Etiqueta + linha âmbar
  page.drawText("PROPOSTA DE PROTEÇÃO VEICULAR", {
    x: MARGIN_X, y: topY - 110, size: 8, font: f.fontBold, color: AMBAR,
  });
  page.drawRectangle({ x: MARGIN_X, y: topY - 116, width: 24, height: 1.5, color: AMBAR });

  // Saudação
  const primNome = (input.cliente.nome.trim().split(/\s+/)[0] || "cliente").toUpperCase();
  page.drawText(`Olá, ${primNome}.`, { x: MARGIN_X, y: topY - 150, size: 30, font: f.fontBold, color: BRANCO });
  page.drawText("Sua proteção começa aqui.", {
    x: MARGIN_X, y: topY - 174, size: 12, font: f.fontBoldObli, color: AZUL_PO,
  });

  // Metadados à direita
  textRight(page, "EMITIDA EM", A4.W - MARGIN_X, topY - 48, 7, f.fontBold, AMBAR);
  textRight(page, new Date().toLocaleDateString("pt-BR"), A4.W - MARGIN_X, topY - 62, 11, f.fontBold, BRANCO);
  textRight(page, "PROTOCOLO", A4.W - MARGIN_X, topY - 86, 7, f.fontBold, AMBAR);
  textRight(page, input.protocolo, A4.W - MARGIN_X, topY - 100, 10, f.font, BRANCO);
  textRight(page, "VÁLIDA POR", A4.W - MARGIN_X, topY - 122, 7, f.fontBold, AMBAR);
  textRight(page, `${input.validadeDias} dias`, A4.W - MARGIN_X, topY - 136, 11, f.fontBold, BRANCO);

  return base; // cursor sai no bottom do hero
}

function renderVeiculo(page: PDFPage, input: PremiumPdfInput, f: FontBag, yTop: number): number {
  const H = 118;
  const bw = A4.W - MARGIN_X * 2;
  const yBot = yTop - H;

  page.drawRectangle({ x: MARGIN_X, y: yBot, width: bw, height: H, color: BRANCO, borderColor: CINZA_LINHA, borderWidth: 0.8 });

  // etiqueta
  page.drawText(catLabelUpper(input.veiculo.categoria), {
    x: MARGIN_X + 14, y: yTop - 16, size: 8, font: f.fontBold, color: AZUL,
  });

  // placa Mercosul
  const placaW = 148, placaH = 42;
  const placaX = MARGIN_X + 14;
  const placaY = yTop - 20 - placaH - 4;
  page.drawRectangle({ x: placaX, y: placaY, width: placaW, height: placaH, color: PRETO });
  page.drawRectangle({ x: placaX, y: placaY + placaH - 10, width: placaW, height: 10, color: AZUL });
  page.drawText("BR  MERCOSUL", { x: placaX + 8, y: placaY + placaH - 8, size: 6, font: f.fontBold, color: BRANCO });
  page.drawCircle({ x: placaX + placaW - 14, y: placaY + placaH - 5, size: 2.5, color: AMBAR });
  const fs2 = 22;
  const txtW = f.fontBold.widthOfTextAtSize(input.veiculo.placa, fs2);
  page.drawText(input.veiculo.placa, {
    x: placaX + (placaW - txtW) / 2, y: placaY + 8, size: fs2, font: f.fontBold, color: BRANCO,
  });

  // marca/modelo lado direito
  const infoX = placaX + placaW + 20;
  page.drawText(trunc(input.veiculo.brand, 32), { x: infoX, y: yTop - 32, size: 10, font: f.fontBold, color: AMBAR });
  page.drawText(trunc(input.veiculo.model, 46), { x: infoX, y: yTop - 48, size: 14, font: f.fontBold, color: PRETO });
  const sub = [
    `Ano modelo ${input.veiculo.modelYear}`,
    input.veiculo.color,
  ].filter(Boolean).join("  ·  ");
  page.drawText(sub, { x: infoX, y: yTop - 64, size: 9.5, font: f.font, color: CINZA });

  // FIPE no canto inferior direito do card
  const fipeX = A4.W - MARGIN_X - 170;
  const fipeY = yBot + 24;
  textRight(page, "VALOR FIPE", A4.W - MARGIN_X - 14, fipeY + 14, 7, f.fontBold, CINZA);
  textRight(page, input.veiculo.fipeFormatted, A4.W - MARGIN_X - 14, fipeY, 15, f.fontBold, AZUL);

  return yBot;
}

function renderValores(page: PDFPage, input: PremiumPdfInput, f: FontBag, yTop: number): number {
  const H = 108;
  const yBot = yTop - H;
  const bw = A4.W - MARGIN_X * 2;
  const halfW = (bw - 12) / 2;

  // CARD 1 — Investimento Inicial (azul monumental)
  const c1x = MARGIN_X;
  page.drawRectangle({ x: c1x, y: yBot, width: halfW, height: H, color: AZUL });
  page.drawRectangle({ x: c1x, y: yBot + H - 3, width: halfW, height: 3, color: AMBAR });
  page.drawText("INVESTIMENTO INICIAL", { x: c1x + 16, y: yTop - 20, size: 8.5, font: f.fontBold, color: AMBAR });
  page.drawText(input.valores.investimentoInicialFormatted, {
    x: c1x + 16, y: yTop - 60, size: 28, font: f.fontBold, color: BRANCO,
  });
  page.drawText("1º boleto do associado", { x: c1x + 16, y: yTop - 78, size: 8.5, font: f.fontBoldObli, color: AZUL_PO });
  page.drawText(`${input.valores.mensalidadeFormatted} mensalidade + ${input.valores.adesaoFormatted} adesão`, {
    x: c1x + 16, y: yTop - 92, size: 8, font: f.font, color: AZUL_PO,
  });

  // CARD 2 — Valor Total do Plano
  const c2x = MARGIN_X + halfW + 12;
  page.drawRectangle({ x: c2x, y: yBot, width: halfW, height: H, color: BRANCO, borderColor: AZUL, borderWidth: 1.5 });
  page.drawText("VALOR TOTAL DO PLANO", { x: c2x + 16, y: yTop - 20, size: 8.5, font: f.fontBold, color: AZUL });
  page.drawText(input.valores.mensalidadeFormatted, {
    x: c2x + 16, y: yTop - 60, size: 28, font: f.fontBold, color: AZUL,
  });
  page.drawText("mensalidade recorrente", { x: c2x + 16, y: yTop - 78, size: 8.5, font: f.fontBoldObli, color: GRAFITE });
  page.drawText("boleto, cartão ou PIX", { x: c2x + 16, y: yTop - 92, size: 8, font: f.font, color: CINZA });

  return yBot;
}

function renderBeneficios(page: PDFPage, input: PremiumPdfInput, f: FontBag, yTop: number): number {
  const bw = A4.W - MARGIN_X * 2 - 16;
  let y = yTop;

  page.drawText("O QUE JÁ ESTÁ INCLUSO NO SEU PLANO", {
    x: MARGIN_X, y, size: 10, font: f.fontBold, color: PRETO,
  });
  page.drawRectangle({ x: MARGIN_X, y: y - 5, width: 32, height: 1.5, color: AMBAR });
  y -= 20;

  // Proteção Contratada
  page.drawText("Proteção Contratada", { x: MARGIN_X, y, size: 9.5, font: f.fontBold, color: AZUL });
  y -= 13;
  for (const item of input.protecaoBase) {
    y = drawCheckLine(page, MARGIN_X, y, item, f.font, VERDE, bw);
  }
  y -= 4;

  if (input.adicionais.length > 0) {
    page.drawText("Adicionais Contratados", { x: MARGIN_X, y, size: 9.5, font: f.fontBold, color: AZUL });
    y -= 13;
    for (const item of input.adicionais) {
      y = drawCheckLine(page, MARGIN_X, y, item, f.font, VERDE, bw);
    }
  }

  return y;
}

function renderDiferenciais(page: PDFPage, input: PremiumPdfInput, f: FontBag, yTop: number): number {
  // Altura dinâmica: 2 colunas, ceil(items/2) linhas * 14pt + 32 de padding
  const rows = Math.ceil(input.diferenciais.length / 2);
  const H = 24 + rows * 14 + 10;
  const bw = A4.W - MARGIN_X * 2;
  const yBot = yTop - H;

  page.drawRectangle({ x: MARGIN_X, y: yBot, width: bw, height: H, color: BRANCO, borderColor: AMBAR, borderWidth: 1 });
  page.drawRectangle({ x: MARGIN_X, y: yTop - 3, width: 72, height: 3, color: AMBAR });

  page.drawText("DIFERENCIAIS LOOG", { x: MARGIN_X + 16, y: yTop - 20, size: 9, font: f.fontBold, color: AZUL });

  const colX = [MARGIN_X + 16, MARGIN_X + bw / 2];
  let colY = yTop - 36;
  for (let i = 0; i < input.diferenciais.length; i++) {
    const d = input.diferenciais[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const yy = colY - row * 14;
    const xx = colX[col];
    if (d.ok) drawCheckGlyph(page, xx, yy + 3, 8, VERDE);
    else drawXGlyph(page, xx + 1, yy + 6, 7, VERMELHO);
    page.drawText(d.texto, { x: xx + 14, y: yy, size: 9, font: f.font, color: GRAFITE });
  }

  return yBot;
}

function renderConsultor(page: PDFPage, input: PremiumPdfInput, f: FontBag, yTop: number): number {
  const nome = input.consultor.name;
  if (!nome && !input.consultor.phone) return yTop; // sem consultor cadastrado, pula

  const H = 46;
  const bw = A4.W - MARGIN_X * 2;
  const yBot = yTop - H;

  page.drawRectangle({ x: MARGIN_X, y: yBot, width: bw, height: H, color: PRETO });
  page.drawRectangle({ x: MARGIN_X, y: yBot, width: 4, height: H, color: AMBAR });

  page.drawText("SEU CONSULTOR LOOG", { x: MARGIN_X + 16, y: yTop - 14, size: 7.5, font: f.fontBold, color: AMBAR });
  page.drawText((nome ?? "LOOG Studio").toUpperCase(), {
    x: MARGIN_X + 16, y: yTop - 30, size: 12, font: f.fontBold, color: BRANCO,
  });
  const contato = [
    input.consultor.phone,
    input.consultor.instagram,
    input.consultor.city,
  ].filter(Boolean).join("  ·  ");
  page.drawText(contato, { x: MARGIN_X + 16, y: yTop - 42, size: 9, font: f.font, color: AZUL_PO });

  return yBot;
}

/**
 * PÁGINA 2 — Cenários de perda com imagens geradas por IA.
 * Grid 2×2 com fundo dark-tech, cada card mostra:
 *   - imagem da cena específica do veículo
 *   - label do cenário + emoji
 *   - valor estimado da perda em R$ (fator × FIPE)
 * Fecha com comparativo "Pague R$ XX vs perca R$ YY".
 */
async function renderPaginaCenarios(doc: PDFDocument, input: PremiumPdfInput, f: FontBag, logo: PDFImage | null): Promise<void> {
  const cenarios = input.cenarios ?? [];
  if (cenarios.length === 0) return;

  const page = doc.addPage([A4.W, A4.H]);
  // Fundo escuro dark-tech
  page.drawRectangle({ x: 0, y: 0, width: A4.W, height: A4.H, color: AZUL_PROFUNDO });

  // Hero da página — altura reduzida pra sobrar grid
  const heroH = 110;
  page.drawRectangle({ x: 0, y: A4.H - heroH, width: A4.W, height: heroH, color: PRETO });
  // Linha âmbar na base do hero
  page.drawRectangle({ x: 0, y: A4.H - heroH, width: A4.W, height: 2, color: AMBAR });

  if (logo) {
    const scale = 32 / logo.height;
    page.drawImage(logo, { x: MARGIN_X, y: A4.H - 48, width: logo.width * scale, height: 32 });
  } else {
    drawLogoVector(page, MARGIN_X, A4.H - 44, 28, BRANCO);
  }

  page.drawText("CENÁRIOS DE PERDA", { x: MARGIN_X, y: A4.H - 72, size: 10, font: f.fontBold, color: AMBAR });
  page.drawText("O QUE VOCÊ PERDERIA SEM A LOOG", {
    x: MARGIN_X, y: A4.H - 92, size: 20, font: f.fontBold, color: BRANCO,
  });

  // ─── Grid 2x2 ─────────────────────────────────────────────────────────────
  const gridTop = A4.H - heroH - 20;
  const gridBottom = 170; // deixa espaço pro comparativo + footer
  const gridH = gridTop - gridBottom;
  const cardW = (A4.W - MARGIN_X * 2 - 12) / 2;
  const cardH = (gridH - 12) / 2;

  const fipeCents = input.veiculo.fipeValueCents ?? parseFipeFormatted(input.veiculo.fipeFormatted);

  for (let i = 0; i < Math.min(4, cenarios.length); i++) {
    const c = cenarios[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN_X + col * (cardW + 12);
    const y = gridTop - cardH - row * (cardH + 12);

    // Card background escuro
    page.drawRectangle({ x, y, width: cardW, height: cardH, color: PRETO, borderColor: AZUL2, borderWidth: 0.6 });

    // Insere imagem — ocupa 70% da altura do card
    const imgH = cardH * 0.6;
    try {
      const img = await doc.embedPng(c.buffer);
      const imgW = cardW - 10;
      const imgY = y + cardH - imgH - 5;
      page.drawImage(img, { x: x + 5, y: imgY, width: imgW, height: imgH });
    } catch {
      // Se falhar, deixa um placeholder cinza
      page.drawRectangle({ x: x + 5, y: y + cardH - imgH - 5, width: cardW - 10, height: imgH, color: GRAFITE });
    }

    // Faixa inferior com label + valor
    const faixaY = y + 6;
    const perdaCents = Math.round(fipeCents * c.perdaPct);
    page.drawText(`${c.emoji}  ${c.label.toUpperCase()}`, {
      x: x + 10, y: faixaY + 20, size: 11, font: f.fontBold, color: AMBAR,
    });
    page.drawText(`Perda estimada: ${brl(perdaCents / 100)}`, {
      x: x + 10, y: faixaY + 6, size: 9, font: f.font, color: BRANCO,
    });
  }

  // ─── Comparativo "Você paga vs perde" ─────────────────────────────────────
  const compY = gridBottom - 20;
  const compH = 90;
  page.drawRectangle({ x: MARGIN_X, y: compY - compH, width: A4.W - MARGIN_X * 2, height: compH, color: PRETO, borderColor: AMBAR, borderWidth: 1 });
  page.drawRectangle({ x: MARGIN_X, y: compY - 4, width: A4.W - MARGIN_X * 2, height: 4, color: AMBAR });

  page.drawText("A DECISÃO É SUA", { x: MARGIN_X + 16, y: compY - 24, size: 9, font: f.fontBold, color: AMBAR });

  // Col esquerda — "você paga"
  page.drawText("VOCÊ PAGA (mensal)", { x: MARGIN_X + 16, y: compY - 46, size: 8, font: f.font, color: AZUL_PO });
  page.drawText(input.valores.mensalidadeFormatted, {
    x: MARGIN_X + 16, y: compY - 68, size: 22, font: f.fontBold, color: VERDE,
  });

  // Col direita — "ou perde"
  const colDirX = A4.W / 2 + 20;
  page.drawText("OU PERDE (sem proteção)", { x: colDirX, y: compY - 46, size: 8, font: f.font, color: AZUL_PO });
  page.drawText(brl(fipeCents / 100), {
    x: colDirX, y: compY - 68, size: 22, font: f.fontBold, color: VERMELHO,
  });

  // ─── Footer dark ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: A4.W, height: 32, color: PRETO });
  page.drawRectangle({ x: 0, y: 32, width: A4.W, height: 1, color: AMBAR });
  page.drawText("LOOG PROTEÇÃO VEICULAR  ·  loogprotecaoveicular.com.br", {
    x: MARGIN_X, y: 12, size: 8, font: f.fontBold, color: BRANCO,
  });
  textRight(page, `Protocolo ${input.protocolo}`, A4.W - MARGIN_X, 12, 8, f.font, AMBAR);
}

/** Extrai cents de uma string tipo "R$ 102.797,00" — fallback quando fipeValueCents não vem. */
function parseFipeFormatted(s: string): number {
  const num = s.replace(/[^\d,]/g, "").replace(",", ".");
  const v = parseFloat(num);
  return isNaN(v) ? 0 : Math.round(v * 100);
}

function brl(reais: number): string {
  return reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function renderFooter(page: PDFPage, f: FontBag) {
  page.drawRectangle({ x: 0, y: 0, width: A4.W, height: 26, color: AZUL });
  page.drawText("loogprotecaoveicular.com.br", { x: MARGIN_X, y: 10, size: 8.5, font: f.font, color: BRANCO });
  textRight(page, "0800 400 8888  ·  LOOG Proteção Veicular", A4.W - MARGIN_X, 10, 8.5, f.font, BRANCO);
  page.drawText(
    "Associação de proteção veicular. Não é seguradora. Valores sujeitos a aceitação e vistoria prévia.",
    { x: MARGIN_X, y: 30, size: 6.5, font: f.fontObli, color: CINZA },
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
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://loogstudio.netlify.app";
    const r = await fetch(`${base}/brand/loog-full.png`);
    if (!r.ok) return null;
    return await doc.embedPng(Buffer.from(await r.arrayBuffer()));
  } catch {
    return null;
  }
}

function drawLogoVector(page: PDFPage, x: number, y: number, size: number, color: ReturnType<typeof rgb>) {
  const r = size / 4;
  page.drawCircle({ x: x + r, y: y + r, size: r, borderColor: color, borderWidth: 2.5 });
  page.drawCircle({ x: x + 2.6 * r, y: y + r, size: r, borderColor: color, borderWidth: 2.5 });
}

function drawCheckGlyph(page: PDFPage, x: number, y: number, size: number, color: ReturnType<typeof rgb>) {
  page.drawLine({
    start: { x, y }, end: { x: x + size * 0.35, y: y - size * 0.4 },
    thickness: 1.6, color, lineCap: LineCapStyle.Round,
  });
  page.drawLine({
    start: { x: x + size * 0.35, y: y - size * 0.4 }, end: { x: x + size, y: y + size * 0.55 },
    thickness: 1.6, color, lineCap: LineCapStyle.Round,
  });
}

function drawXGlyph(page: PDFPage, x: number, y: number, size: number, color: ReturnType<typeof rgb>) {
  page.drawLine({ start: { x, y: y - size }, end: { x: x + size, y }, thickness: 1.4, color, lineCap: LineCapStyle.Round });
  page.drawLine({ start: { x, y }, end: { x: x + size, y: y - size }, thickness: 1.4, color, lineCap: LineCapStyle.Round });
}

function textRight(page: PDFPage, text: string, xRight: number, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xRight - w, y, size, font, color });
}

function drawCheckLine(page: PDFPage, x: number, y: number, text: string, font: PDFFont, markColor: ReturnType<typeof rgb>, maxW: number): number {
  const lines = wrap(text, font, 9, maxW);
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) drawCheckGlyph(page, x + 2, y + 3, 8, markColor);
    page.drawText(lines[i], { x: x + 16, y, size: 9, font, color: GRAFITE });
    y -= 12;
  }
  return y - 2;
}

function trunc(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "...";
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

function catLabelUpper(cat: string): string {
  const c = cat.toLowerCase();
  if (c === "moto") return "MOTOCICLETA";
  if (c === "caminhao" || c === "caminhão") return "CAMINHÃO";
  return "VEÍCULO PASSEIO";
}

export function protocolo(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `LG${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Constantes publicadas.
 *  Lista fiel ao modelo oficial LOOG (visweb.com.br — proposta de proteção).
 *  Ordem IMPORTA: coberturas principais (Roubo/Colisão) vêm primeiro —
 *  são o motivo pelo qual o associado contrata, não podem ficar escondidas. */
export const PROTECAO_BASE = [
  "COBERTURA PARA ROUBO E FURTO",
  "COLISÃO, PERDA TOTAL, INCÊNDIO E FENÔMENOS DA NATUREZA",
  "ASSISTÊNCIA 24H EM TODO TERRITÓRIO NACIONAL",
  "REBOQUE ILIMITADO EM CASO DE COLISÃO",
  "Reboque para pane Mecânica, Elétrica e Falta de Combustível até 300km (150km ida + 150km volta)",
  "RECARGA DE BATERIA",
  "CHAVEIRO",
  "TRANSPORTE ALTERNATIVO (Uber ou Táxi)",
  "HOSPEDAGEM EMERGENCIAL",
  "REMOÇÃO INTER-HOSPITALAR",
  "ASSESSORIA JURÍDICA",
];

export const DIFERENCIAIS_LOOG = [
  { ok: false, texto: "Sem Análise de Perfil" },
  { ok: false, texto: "Sem Consulta SPC e Serasa" },
  { ok: true, texto: "Pagamento mensal via Boleto, Cartão ou PIX" },
  { ok: true, texto: "Proteção MUITO COMPLETA" },
];
