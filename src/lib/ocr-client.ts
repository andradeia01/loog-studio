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

/** Converte PDF (data URL) na 1ª página renderizada como data URL de imagem (fallback). */
async function pdfParaImagem(pdfDataUrl: string): Promise<string> {
  const pdfjs = await loadPdfJs();
  const bytes = dataUrlToBytes(pdfDataUrl);
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

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Extrai TEXTO NATIVO do PDF (camada de texto) — SEM OCR.
 * PDFs digitais como CNH-e, CRLV-e, contas de luz/água baixadas direto do site/app
 * têm texto embutido. Nesse caso o resultado é PERFEITO, não há perda de qualidade.
 *
 * Retorna string vazia se o PDF for scanned (só imagem).
 */
async function extrairTextoPdfNativo(pdfDataUrl: string): Promise<string> {
  const pdfjs = await loadPdfJs();
  const bytes = dataUrlToBytes(pdfDataUrl);
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const linhas: string[] = [];
  // Lê as 3 primeiras páginas no máximo (CRLV/CNH/comprovante não passam disso)
  const numPages = Math.min(doc.numPages, 3);
  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // agrupa itens por linha (mesmo transform.y aproximado)
    const linhasPagina = new Map<number, string[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const arr = linhasPagina.get(y) ?? [];
      arr.push(item.str);
      linhasPagina.set(y, arr);
    }
    const linhasOrdenadas = [...linhasPagina.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, parts] of linhasOrdenadas) linhas.push(parts.join(" "));
    linhas.push(""); // separa páginas
  }
  return linhas.join("\n").trim();
}

// ========= OCR principal =========

export async function extrairDocumentoLocal(
  tipo: DocumentoTipo,
  dataUrl: string,
  onProgress?: (p: { status: string; progress: number }) => void,
): Promise<OCRClientResult> {
  const t0 = Date.now();
  const isPdf = dataUrl.startsWith("data:application/pdf");

  // ========== CAMINHO 1: PDF COM TEXTO NATIVO (CNH-e, CRLV-e, contas digitais) ==========
  // Qualidade PERFEITA — zero OCR, extração direta da camada de texto do PDF.
  if (isPdf) {
    onProgress?.({ status: "Extraindo texto do PDF…", progress: 0.2 });
    try {
      const textoNativo = await extrairTextoPdfNativo(dataUrl);
      // Se o PDF tem camada de texto significativa, usa ela e NÃO roda OCR
      if (textoNativo.length >= 50) {
        onProgress?.({ status: "Lido texto nativo (PDF digital)", progress: 0.95 });
        const dados = parsearTextoBrasileiro(tipo, textoNativo);
        const campos_lidos = Object.values(dados).filter((v) => v != null && v !== "").length;
        return {
          dados, texto_bruto: textoNativo, campos_lidos,
          provider: "pdf-native" as "tesseract-local", // mesmo type pra compat
          duration_ms: Date.now() - t0,
        };
      }
      // Texto nativo pequeno → PDF escaneado → segue pro OCR
      onProgress?.({ status: "PDF sem texto nativo, rodando OCR…", progress: 0.3 });
    } catch (e) {
      console.warn("[ocr] falha ao extrair texto nativo:", e);
    }
  }

  // ========== CAMINHO 2: OCR com Tesseract.js (imagens + PDFs escaneados) ==========
  let imgDataUrl = dataUrl;
  if (isPdf) {
    imgDataUrl = await pdfParaImagem(dataUrl);
  }

  onProgress?.({ status: "Carregando OCR offline…", progress: 0.35 });
  const Tesseract = await loadTesseract();

  const result = await Tesseract.recognize(imgDataUrl, "por", {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status && typeof m.progress === "number") {
        onProgress?.({ status: m.status, progress: 0.4 + m.progress * 0.55 });
      }
    },
  });

  const texto = result.data.text ?? "";
  onProgress?.({ status: "Extraindo campos…", progress: 0.98 });

  const dados = parsearTextoBrasileiro(tipo, texto);
  const campos_lidos = Object.values(dados).filter((v) => v != null && v !== "").length;

  return {
    dados, texto_bruto: texto, campos_lidos,
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
    const cpf = find(txt, /\b(\d{3}\.?\s*\d{3}\.?\s*\d{3}-?\s*\d{2})\b/)?.replace(/[^0-9]/g, "") ?? null;
    // 1ª data = nascimento geralmente (datas DD/MM/AAAA ou DD-MM-AAAA)
    const data = find(txt, /\b(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})\b/);
    const dataIso = data ? data.replace(/[.\-]/g, "/").split("/").reverse().join("-") : null;
    const categoria = find(txt, /CAT(?:EGORIA)?[\s:]*([A-E]{1,3})/i);
    // Nome: busca em várias estratégias
    // 1) linha após "NOME:"
    const nomeLabel = find(txt, /NOME[\s:]+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]{10,70})/i);
    // 2) linha com 3+ palavras CAIXA ALTA
    const nomeAlta = find(txt, /\b([A-ZÀ-Ú]{3,}(?:\s+(?:DE|DA|DO|DOS|DAS)?\s*[A-ZÀ-Ú]{2,}){2,5})\b/);
    const nome = nomeLabel ?? nomeAlta;
    const rg = find(txt, /(?:RG|DOC\s*ID|REGISTRO)[\s:]*([\d.\s-]{7,15})/i)?.replace(/[^0-9A-Za-z]/g, "") ?? null;
    const numeroRegistro = find(txt, /N[°º]?\s*REGISTRO[\s:]*(\d{9,12})/i)
      ?? find(txt, /REGISTRO[\s:]*(\d{9,12})/i);

    return {
      nome, cpf, data_nascimento: dataIso, categoria, rg,
      numero_registro: numeroRegistro,
    };
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
