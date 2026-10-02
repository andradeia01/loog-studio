import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import type { VeiculoInfo } from "../placafipe";
import type { CotacaoResult, PlanoCotacao } from "../cotacao";

export interface ConsultantInfo {
  name?: string | null;
  phone?: string | null;
  instagram?: string | null;
  city?: string | null;
}

const AZUL = rgb(0 / 255, 71 / 255, 171 / 255); // #0047AB — Azul LOOG
const AZUL2 = rgb(28 / 255, 99 / 255, 255 / 255); // #1C63FF
const GRAFITE = rgb(35 / 255, 38 / 255, 44 / 255); // #23262C
const PRETO = rgb(5 / 255, 6 / 255, 8 / 255);
const CINZA = rgb(0.45, 0.47, 0.5);
const CINZA_CLARO = rgb(0.92, 0.93, 0.95);
const BRANCO = rgb(1, 1, 1);

export async function gerarPdfCotacao(opts: {
  veiculo: VeiculoInfo;
  cotacao: CotacaoResult;
  consultant: ConsultantInfo;
}): Promise<Uint8Array> {
  const { veiculo, cotacao, consultant } = opts;

  const doc = await PDFDocument.create();
  doc.setTitle(`LOOG — Cotação ${veiculo.placa}`);
  doc.setAuthor("LOOG Proteção Veicular");
  doc.setSubject(`Cotação ${veiculo.marca} ${veiculo.modelo}`);
  doc.setProducer("LOOG Studio");
  doc.setCreator("LOOG Studio");
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = doc.addPage([595.28, 841.89]); // A4
  const W = page.getWidth();
  const H = page.getHeight();
  const M = 36; // margem

  // ======= HEADER (faixa azul LOOG) =======
  page.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: AZUL });
  // ∞ logomark estilizado em branco (desenhado manualmente, elegante)
  drawLoogMark(page, M, H - 65, 36, BRANCO);
  page.drawText("LOOG", { x: M + 50, y: H - 55, size: 28, font: fontBold, color: BRANCO });
  page.drawText("Proteção Veicular Associativa", { x: M + 50, y: H - 72, size: 9, font, color: rgb(0.92, 0.95, 1) });

  // metadados do documento à direita
  const hoje = new Date().toLocaleDateString("pt-BR");
  textRight(page, `Cotação emitida em ${hoje}`, W - M, H - 55, 10, font, BRANCO);
  textRight(page, `Nº ${nowProtocol()}`, W - M, H - 70, 9, font, rgb(0.9, 0.93, 1));

  let y = H - 90 - 24;

  // ======= TÍTULO =======
  page.drawText("Cotação de Proteção Veicular", { x: M, y, size: 20, font: fontBold, color: PRETO });
  y -= 10;
  page.drawRectangle({ x: M, y: y - 4, width: 60, height: 3, color: AZUL2 });
  y -= 24;

  // ======= DADOS DO CONSULTOR =======
  if (consultant.name || consultant.phone || consultant.instagram) {
    y = sectionLabel(page, M, y, "SEU CONSULTOR LOOG", fontBold);
    const dados: string[] = [];
    if (consultant.name) dados.push(consultant.name);
    const contato: string[] = [];
    if (consultant.phone) contato.push(`Tel.: ${consultant.phone}`);
    if (consultant.instagram) contato.push(`Instagram: ${consultant.instagram}`);
    if (consultant.city) contato.push(consultant.city);
    page.drawText(dados.join(""), { x: M, y, size: 12, font: fontBold, color: PRETO });
    y -= 14;
    if (contato.length) {
      page.drawText(contato.join("  ·  "), { x: M, y, size: 9.5, font, color: CINZA });
      y -= 18;
    }
    y -= 6;
  }

  // ======= VEÍCULO =======
  y = sectionLabel(page, M, y, "VEÍCULO CONSULTADO", fontBold);
  const boxH = 110;
  page.drawRectangle({
    x: M, y: y - boxH, width: W - M * 2, height: boxH,
    color: CINZA_CLARO,
    borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.5,
  });
  // placa destacada
  const placaW = 140;
  page.drawRectangle({ x: M + 14, y: y - 44, width: placaW, height: 30, color: PRETO });
  page.drawRectangle({ x: M + 14, y: y - 14, width: placaW, height: 10, color: AZUL });
  page.drawText("MERCOSUL BR", { x: M + 20, y: y - 12, size: 6, font: fontBold, color: BRANCO });
  page.drawText(veiculo.placa, {
    x: M + 14 + (placaW - fontBold.widthOfTextAtSize(veiculo.placa, 20)) / 2,
    y: y - 38, size: 20, font: fontBold, color: BRANCO,
  });
  // marca/modelo
  const nome = `${veiculo.marca ?? "-"} ${veiculo.modelo ?? ""}`.trim();
  page.drawText(trunc(nome, 42), { x: M + 14 + placaW + 18, y: y - 24, size: 15, font: fontBold, color: PRETO });
  const subTxt = [
    veiculo.ano_modelo ? `Ano ${veiculo.ano_modelo}` : null,
    veiculo.cor,
    veiculo.combustivel,
    veiculo.segmento,
  ].filter(Boolean).join("  ·  ");
  page.drawText(subTxt, { x: M + 14 + placaW + 18, y: y - 42, size: 10, font, color: CINZA });

  // grid de atributos
  const colX = [M + 14, M + (W - M * 2) / 3 + 14, M + (2 * (W - M * 2)) / 3 + 14];
  const gridY = y - 70;
  grid(page, colX[0], gridY, "Chassi", veiculo.chassi, font, fontBold);
  grid(page, colX[1], gridY, "Município / UF", `${veiculo.municipio ?? "-"} / ${veiculo.uf ?? "-"}`, font, fontBold);
  grid(page, colX[2], gridY, "Cilindradas", veiculo.cilindradas ? `${veiculo.cilindradas} cc` : null, font, fontBold);
  grid(page, colX[0], gridY - 24, "Categoria", cotacao.categoria, font, fontBold);
  grid(page, colX[1], gridY - 24, "Idade", `${cotacao.idade_veiculo} anos`, font, fontBold);
  grid(page, colX[2], gridY - 24, "Subsegmento", veiculo.sub_segmento, font, fontBold);

  y -= boxH + 20;

  // ======= VALOR FIPE =======
  y = sectionLabel(page, M, y, "VALOR DE REFERÊNCIA (TABELA FIPE)", fontBold);
  const fipeH = 56;
  page.drawRectangle({
    x: M, y: y - fipeH, width: W - M * 2, height: fipeH,
    color: AZUL,
  });
  page.drawText("Valor FIPE do veículo", { x: M + 18, y: y - 20, size: 10, font, color: rgb(0.85, 0.9, 1) });
  page.drawText(cotacao.valor_fipe_formatado, {
    x: M + 18, y: y - 42, size: 24, font: fontBold, color: BRANCO,
  });
  textRight(page, `Referência: ${cotacao.mes_referencia}`, W - M - 18, y - 20, 9, font, rgb(0.85, 0.9, 1));
  textRight(page, `fator estimado ${cotacao.fator_mensal_pct.toFixed(2)}% / mês`, W - M - 18, y - 38, 10, fontBold, BRANCO);
  y -= fipeH + 22;

  // ======= PLANOS =======
  y = sectionLabel(page, M, y, "PLANOS DISPONÍVEIS — ESTIMATIVA MENSAL", fontBold);
  const cardW = (W - M * 2 - 16) / 3;
  const cardH = 180;
  cotacao.planos.forEach((p, idx) => {
    drawPlanoCard(page, M + idx * (cardW + 8), y - cardH, cardW, cardH, p, idx === 1, font, fontBold);
  });
  y -= cardH + 20;

  // ======= OBSERVAÇÕES =======
  y = sectionLabel(page, M, y, "OBSERVAÇÕES", fontBold);
  for (const obs of cotacao.observacoes) {
    const lines = wrap(obs, font, 9, W - M * 2 - 10);
    for (const line of lines) {
      if (y < M + 60) break;
      page.drawText(`• ${line}`, { x: M, y, size: 9, font, color: GRAFITE });
      y -= 12;
    }
  }

  // ======= FOOTER =======
  drawFooter(page, W, M, font, fontOblique);

  const bytes = await doc.save();
  return bytes;
}

// ============ helpers ============

function sectionLabel(page: PDFPage, x: number, y: number, label: string, fontBold: PDFFont): number {
  page.drawText(label, { x, y, size: 9, font: fontBold, color: AZUL });
  return y - 16;
}

function textRight(page: PDFPage, text: string, xRight: number, y: number, size: number, font: PDFFont, color = PRETO) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xRight - w, y, size, font, color });
}

function grid(page: PDFPage, x: number, y: number, label: string, value: string | null | undefined, font: PDFFont, fontBold: PDFFont) {
  page.drawText(label.toUpperCase(), { x, y, size: 7, font: fontBold, color: CINZA });
  page.drawText(value && value !== "null" ? trunc(value, 24) : "—", { x, y: y - 11, size: 10, font, color: PRETO });
}

function drawPlanoCard(page: PDFPage, x: number, y: number, w: number, h: number, plano: PlanoCotacao, destaque: boolean, font: PDFFont, fontBold: PDFFont) {
  if (destaque) {
    page.drawRectangle({ x, y, width: w, height: h, color: AZUL });
    const label = "MAIS ESCOLHIDO";
    const lw = fontBold.widthOfTextAtSize(label, 7);
    page.drawRectangle({ x: x + (w - lw - 12) / 2, y: y + h - 12, width: lw + 12, height: 14, color: AZUL2 });
    page.drawText(label, { x: x + (w - lw) / 2, y: y + h - 9, size: 7, font: fontBold, color: BRANCO });
    page.drawText(plano.nome, { x: x + 14, y: y + h - 36, size: 16, font: fontBold, color: BRANCO });
    page.drawText("R$", { x: x + 14, y: y + h - 68, size: 10, font, color: rgb(0.85, 0.9, 1) });
    page.drawText(plano.mensalidade.toFixed(2).replace(".", ","), { x: x + 32, y: y + h - 76, size: 26, font: fontBold, color: BRANCO });
    page.drawText("/mês · adesão isenta", { x: x + 14, y: y + h - 92, size: 8, font, color: rgb(0.85, 0.9, 1) });
    drawDestaques(page, plano.destaques, x + 14, y + h - 108, w - 28, font, BRANCO, rgb(0.85, 0.9, 1));
  } else {
    page.drawRectangle({ x, y, width: w, height: h, color: BRANCO, borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 1 });
    page.drawText(plano.nome, { x: x + 14, y: y + h - 24, size: 14, font: fontBold, color: PRETO });
    page.drawText("R$", { x: x + 14, y: y + h - 56, size: 9, font, color: CINZA });
    page.drawText(plano.mensalidade.toFixed(2).replace(".", ","), { x: x + 30, y: y + h - 64, size: 22, font: fontBold, color: AZUL });
    page.drawText("/mês · adesão isenta", { x: x + 14, y: y + h - 80, size: 8, font, color: CINZA });
    drawDestaques(page, plano.destaques, x + 14, y + h - 96, w - 28, font, GRAFITE, CINZA);
  }
}

function drawDestaques(page: PDFPage, destaques: string[], x: number, y: number, maxW: number, font: PDFFont, color: ReturnType<typeof rgb>, bullet: ReturnType<typeof rgb>) {
  let yy = y;
  for (const d of destaques) {
    const lines = wrap(d, font, 8, maxW - 10);
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) page.drawText("•", { x, y: yy, size: 8, font, color: bullet });
      page.drawText(lines[i], { x: x + 10, y: yy, size: 8, font, color });
      yy -= 10;
    }
  }
}

function drawLoogMark(page: PDFPage, x: number, y: number, size: number, color: ReturnType<typeof rgb>) {
  // ∞ estilizado: duas elipses sobrepostas
  const r = size / 4;
  page.drawCircle({ x: x + r, y: y + r, size: r, borderColor: color, borderWidth: 2 });
  page.drawCircle({ x: x + 2.6 * r, y: y + r, size: r, borderColor: color, borderWidth: 2 });
}

function drawFooter(page: PDFPage, W: number, M: number, font: PDFFont, fontOblique: PDFFont) {
  const y = 36;
  page.drawRectangle({ x: 0, y: 0, width: W, height: 24, color: AZUL });
  page.drawText("loogprotecaoveicular.com.br", { x: M, y: 10, size: 8, font, color: BRANCO });
  textRight(page, "0800 400 8888  ·  LOOG — movimento conecta o amanhã", W - M, 10, 8, font, BRANCO);
  page.drawText(
    "Documento gerado automaticamente pelo LOOG Studio. Valores são estimativas e não constituem proposta formal.",
    { x: M, y: y + 2, size: 7, font: fontOblique, color: CINZA },
  );
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

function nowProtocol(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
