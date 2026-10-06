/**
 * OCR 100% CLIENTE (sem API key, sem rede, sem conta) via Tesseract.js.
 *
 * Fluxo híbrido:
 *   1. Roda Tesseract.js no browser (WASM, modelo português)
 *   2. Extrai texto bruto da imagem/PDF
 *   3. Aplica regex específicas por tipo de documento BR
 *   4. Devolve estrutura idêntica aos providers de nuvem
 *   5. Se Tesseract achar < 3 campos, caller pode fazer fallback pra API
 *
 * Tesseract.js (~2MB) carrega lazy só quando precisa.
 * pdfjs-dist renderiza 1ª página do PDF em canvas pra alimentar o Tesseract.
 *
 * Repo Tesseract.js (MIT): https://github.com/naptha/tesseract.js
 * 50k+ stars, usado por milhares de apps em produção.
 */

export type DocumentoTipo = "crlv" | "cnh" | "residencia";

export interface OCRClientResult {
  dados: Record<string, string | null>;
  texto_bruto: string;
  campos_lidos: number;
  provider: "tesseract-local";
  duration_ms: number;
}

// ========= Lazy loader do Tesseract =========

let tesseractLoader: Promise<typeof import("tesseract.js")> | null = null;
function loadTesseract() {
  if (!tesseractLoader) tesseractLoader = import("tesseract.js");
  return tesseractLoader;
}

// ========= Lazy loader do pdf.js (pra PDFs) =========

let pdfjsLoader: Promise<typeof import("pdfjs-dist")> | null = null;
async function loadPdfJs() {
  if (!pdfjsLoader) {
    pdfjsLoader = import("pdfjs-dist").then((m) => {
      // worker da CDN (zero config)
      m.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${m.version}/build/pdf.worker.min.mjs`;
      return m;
    });
  }
  return pdfjsLoader;
}

/** Converte PDF (data URL) na 1ª página renderizada como data URL de imagem. */
async function pdfParaImagem(pdfDataUrl: string): Promise<string> {
  const pdfjs = await loadPdfJs();
  const bin = atob(pdfDataUrl.split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sem canvas");
  await page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
  return canvas.toDataURL("image/png");
}

// ========= OCR principal =========

export async function extrairDocumentoLocal(
  tipo: DocumentoTipo,
  dataUrl: string,
  onProgress?: (p: { status: string; progress: number }) => void,
): Promise<OCRClientResult> {
  const t0 = Date.now();

  // Se for PDF, converte 1ª página pra imagem
  let imgDataUrl = dataUrl;
  if (dataUrl.startsWith("data:application/pdf")) {
    onProgress?.({ status: "Convertendo PDF…", progress: 0.05 });
    imgDataUrl = await pdfParaImagem(dataUrl);
  }

  onProgress?.({ status: "Carregando OCR offline…", progress: 0.1 });
  const Tesseract = await loadTesseract();

  const result = await Tesseract.recognize(imgDataUrl, "por", {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status && typeof m.progress === "number") {
        onProgress?.({ status: m.status, progress: 0.2 + m.progress * 0.75 });
      }
    },
  });

  const texto = result.data.text ?? "";
  onProgress?.({ status: "Extraindo campos…", progress: 0.98 });

  const dados = parsearTextoBrasileiro(tipo, texto);
  const campos_lidos = Object.values(dados).filter((v) => v != null && v !== "").length;

  return {
    dados,
    texto_bruto: texto,
    campos_lidos,
    provider: "tesseract-local",
    duration_ms: Date.now() - t0,
  };
}

// ========= Parsers por tipo (regex BR) =========

/** Normaliza: trim, upper, remove espaços duplos. */
function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Procura padrão no texto, devolve 1º match ou null. */
function find(txt: string, re: RegExp): string | null {
  const m = txt.match(re);
  return m ? clean(m[1] ?? m[0]) : null;
}

function parsearTextoBrasileiro(tipo: DocumentoTipo, texto: string): Record<string, string | null> {
  const txt = texto.replace(/[|│]/g, " "); // Tesseract às vezes vê "|" onde é espaço

  if (tipo === "crlv") {
    const placa = find(txt, /\b([A-Z]{3}[\s-]*\d[\s]*[A-Z0-9][\s]*\d{2})\b/)?.replace(/[\s-]/g, "") ?? null;
    const chassi = find(txt, /\b([A-HJ-NPR-Z0-9]{17})\b/); // chassi padrão (sem I, O, Q)
    const renavam = find(txt, /RENAVAM[\s:]*(\d{9,11})/i) ?? find(txt, /\b(\d{11})\b/);
    const cpfCnpj = find(txt, /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/)?.replace(/[^0-9]/g, "")
      ?? find(txt, /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/)?.replace(/[^0-9]/g, "");
    const ano = find(txt, /ANO[\s/]*MOD(?:ELO)?[\s:]*(\d{4})/i)
      ?? find(txt, /\b(19\d{2}|20\d{2})\b/);
    const cor = find(txt, /COR[\s:]+([A-Z]+)/i);
    const uf = find(txt, /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
    const municipio = find(txt, /MUNIC(?:[IÍ])PIO[\s:]+([A-ZÀ-Ú ]+?)(?=\s{2,}|$|UF)/i);

    return { placa, chassi, renavam, cpf_cnpj: cpfCnpj ?? null, ano_modelo: ano, cor, uf, municipio };
  }

  if (tipo === "cnh") {
    // CNH tem nome em caixa alta, CPF, data nascimento
    const cpf = find(txt, /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/)?.replace(/[^0-9]/g, "") ?? null;
    const data = find(txt, /\b(\d{2}\/\d{2}\/\d{4})\b/); // 1ª data = nascimento geralmente
    const dataIso = data ? data.split("/").reverse().join("-") : null;
    const categoria = find(txt, /CAT[A-Z]*[\s:]*([A-E]{1,3})/i);
    // Nome: linha com 3+ palavras em CAIXA ALTA
    const nome = find(txt, /\b([A-ZÀ-Ú]{2,}\s+[A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,5})\b/);

    return { nome, cpf, data_nascimento: dataIso, categoria };
  }

  // residencia
  const cep = find(txt, /\b(\d{5}-?\d{3})\b/)?.replace(/[^0-9]/g, "") ?? null;
  const uf = find(txt, /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  // Endereço: linha que começa com Rua/Av/Alameda/Travessa/Praça
  const endereco = find(txt, /\b((?:Rua|R\.|Av\.?(?:enida)?|Alameda|Al\.|Travessa|Trav\.|Praça|Pç\.?)[^\n]{10,80})/i);
  // Cidade: pode estar antes do UF ou numa linha "Cidade: ..."
  const cidade = find(txt, /CIDADE[\s:]+([A-ZÀ-Úa-zà-ú ]+)/i)
    ?? find(txt, /\n([A-ZÀ-Úa-zà-ú ]+?)\s*[-\/]\s*(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  const titular = find(txt, /\b([A-ZÀ-Ú]{2,}\s+[A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,}){1,5})\b/);
  // Detecta tipo de conta
  const low = txt.toLowerCase();
  const tipoConta = low.includes("energia") || low.includes("eletric") ? "energia"
    : low.includes("gua") && low.includes("esgoto") ? "agua"
    : low.includes("telefon") ? "telefone"
    : low.includes("internet") || low.includes("banda larga") ? "internet"
    : low.includes("gás") || low.includes("gas natural") ? "gas"
    : "outros";

  return { titular, endereco, bairro: null, cidade, uf, cep, tipo_conta: tipoConta };
}
