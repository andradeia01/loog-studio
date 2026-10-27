/**
 * OCR estruturado de documentos brasileiros com FALLBACK AUTOMÁTICO:
 *   1. Tenta Claude Vision (Haiku 4.5)
 *   2. Se falhar por qualquer motivo, cai pra GPT-4o Vision
 *
 * Suporta CRLV, CNH, Comprovante de residência.
 * Aceita imagem (JPG/PNG) ou PDF via data URL.
 */

import { getAnthropic, MODEL_OCR as CLAUDE_MODEL } from "./anthropic";
import { getOpenAI } from "./openai";

export type DocumentoTipo = "crlv" | "cnh" | "residencia";

export interface CRLVData {
  placa: string | null; chassi: string | null; renavam: string | null;
  marca: string | null; modelo: string | null; ano_fabricacao: string | null;
  ano_modelo: string | null; cor: string | null; combustivel: string | null;
  categoria: string | null; municipio: string | null; uf: string | null;
  proprietario: string | null; cpf_cnpj: string | null;
}
export interface CNHData {
  nome: string | null; cpf: string | null; rg: string | null;
  data_nascimento: string | null; categoria: string | null;
  numero_registro: string | null; validade: string | null;
  primeira_habilitacao: string | null;
  cidade_emissao: string | null; uf_emissao: string | null;
}
export interface ResidenciaData {
  titular: string | null; endereco: string | null; bairro: string | null;
  cidade: string | null; uf: string | null; cep: string | null;
  tipo_conta: string | null; data_emissao: string | null;
}

export type OCRResult = { tipo: "crlv"; dados: CRLVData; provider: "claude" | "openai" }
  | { tipo: "cnh"; dados: CNHData; provider: "claude" | "openai" }
  | { tipo: "residencia"; dados: ResidenciaData; provider: "claude" | "openai" };

const PROMPTS: Record<DocumentoTipo, string> = {
  crlv: `Você é um extrator de dados de CRLV (Certificado de Registro e Licenciamento do Veículo brasileiro). Analise o documento e retorne APENAS um JSON com estes campos (null se o campo não aparecer):

{"placa":string|null,"chassi":string|null,"renavam":string|null,"marca":string|null,"modelo":string|null,"ano_fabricacao":string|null,"ano_modelo":string|null,"cor":string|null,"combustivel":string|null,"categoria":string|null,"municipio":string|null,"uf":string|null,"proprietario":string|null,"cpf_cnpj":string|null}

Regras: Placa sem traço (ABC1D23). CPF/CNPJ só dígitos. Chassi 17 alfanuméricos. Nunca invente - null se não ler. Retorne SOMENTE o JSON cru.`,

  cnh: `Você é um extrator de dados de CNH brasileira. Retorne APENAS um JSON:

{"nome":string|null,"cpf":string|null,"rg":string|null,"data_nascimento":string|null,"categoria":string|null,"numero_registro":string|null,"validade":string|null,"primeira_habilitacao":string|null,"cidade_emissao":string|null,"uf_emissao":string|null}

Regras: CPF/RG só dígitos. Datas YYYY-MM-DD. Categoria A/B/C/D/E. Nunca invente - null se não ler. SOMENTE o JSON cru.`,

  residencia: `Você é um extrator de dados de comprovante de residência brasileiro (conta de luz/água/gás/internet/telefone). Retorne APENAS um JSON:

{"titular":string|null,"endereco":string|null,"bairro":string|null,"cidade":string|null,"uf":string|null,"cep":string|null,"tipo_conta":string|null,"data_emissao":string|null}

Regras: endereco com rua+número+complemento. CEP 8 dígitos. tipo_conta: energia|agua|internet|telefone|gas|outros. data_emissao YYYY-MM-DD. UF 2 letras maiúsculas. Nunca invente - null se não ler. SOMENTE o JSON cru.`,
};

interface ParsedDataUrl { mediaType: string; base64: string }
function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("data URL inválida");
  return { mediaType: match[1], base64: match[2] };
}

function normalizar(tipo: DocumentoTipo, dados: Record<string, unknown>): OCRResult["dados"] {
  if (tipo === "crlv") {
    if (dados.placa && typeof dados.placa === "string") dados.placa = dados.placa.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (dados.cpf_cnpj && typeof dados.cpf_cnpj === "string") dados.cpf_cnpj = dados.cpf_cnpj.replace(/[^0-9]/g, "");
    return dados as unknown as CRLVData;
  }
  if (tipo === "cnh") {
    if (dados.cpf && typeof dados.cpf === "string") dados.cpf = dados.cpf.replace(/[^0-9]/g, "");
    if (dados.rg && typeof dados.rg === "string") dados.rg = dados.rg.replace(/[^0-9A-Za-z]/g, "");
    return dados as unknown as CNHData;
  }
  if (dados.cep && typeof dados.cep === "string") dados.cep = dados.cep.replace(/[^0-9]/g, "");
  if (dados.uf && typeof dados.uf === "string") dados.uf = dados.uf.toUpperCase().slice(0, 2);
  return dados as unknown as ResidenciaData;
}

/** OCR principal com fallback: Claude (aceita PDF nativo) → OpenAI (só imagens). */
export async function extrairDocumento(tipo: DocumentoTipo, dataUrl: string): Promise<OCRResult> {
  const erros: string[] = [];
  const { mediaType } = parseDataUrl(dataUrl);
  const isPdf = mediaType === "application/pdf";

  // ===== 1) CLAUDE VISION — provider principal, aceita PDF nativo =====
  try {
    const dados = await extrairComClaude(tipo, dataUrl);
    return { tipo, dados, provider: "claude" } as OCRResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    erros.push(`claude: ${msg}`);
    console.warn("[ocr] Claude falhou, tentando OpenAI:", msg);
  }

  // ===== 2) OPENAI VISION fallback — só funciona com imagem (PDF é só Claude) =====
  if (isPdf) {
    throw new Error(
      `Claude Vision falhou e OpenAI Vision não aceita PDF. Erros: ${erros.join(" | ")}. ` +
      `Peça pro cliente mandar a foto em JPG/PNG, ou verifique a chave Anthropic em /admin/config.`
    );
  }
  try {
    const dados = await extrairComOpenAI(tipo, dataUrl);
    return { tipo, dados, provider: "openai" } as OCRResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    erros.push(`openai: ${msg}`);
    console.error("[ocr] OpenAI tambem falhou:", msg);
  }

  throw new Error(`Nenhum provider OCR funcionou. ${erros.join(" | ")}`);
}

// -------------- CLAUDE --------------

async function extrairComClaude(tipo: DocumentoTipo, dataUrl: string): Promise<OCRResult["dados"]> {
  const client = await getAnthropic();
  if (!client) throw new Error("Anthropic nao configurado — configure ANTHROPIC_API_KEY em /admin/config");

  const { mediaType, base64 } = parseDataUrl(dataUrl);
  const isPdf = mediaType === "application/pdf";

  // Claude Vision aceita PDF via document block e imagem via image block.
  const docBlock = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 } };

  let res;
  try {
    res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [{
        role: "user",
        content: [docBlock, { type: "text", text: PROMPTS[tipo] }],
      }],
    });
  } catch (err) {
    // Erros tipicos: 401 (chave invalida), 404 (modelo nao disponivel), 429 (rate limit)
    const anyErr = err as { status?: number; message?: string };
    if (anyErr?.status === 401) {
      throw new Error("chave Anthropic rejeitada (401) — verifique ANTHROPIC_API_KEY em /admin/config, confirme que é válida e não foi rotacionada");
    }
    if (anyErr?.status === 404) {
      throw new Error(`modelo ${CLAUDE_MODEL} não disponível pra sua chave Anthropic (404) — verifique se a conta tem acesso a Claude Haiku 4.5`);
    }
    if (anyErr?.status === 429) {
      throw new Error("rate limit da API Anthropic (429) — aguarde alguns segundos e tente de novo");
    }
    throw err;
  }

  const raw = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text).join("").trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  if (!cleaned) throw new Error("Claude retornou texto vazio");
  const dados = JSON.parse(cleaned);
  return normalizar(tipo, dados);
}

// -------------- OPENAI FALLBACK --------------

async function extrairComOpenAI(tipo: DocumentoTipo, dataUrl: string): Promise<OCRResult["dados"]> {
  const client = await getOpenAI();
  if (!client) throw new Error("OpenAI nao configurado (verifique OPENAI_API_KEY em /admin/config)");

  const { mediaType } = parseDataUrl(dataUrl);
  // PDFs já foram pré-convertidos pra PNG em extrairDocumento.
  if (!mediaType.startsWith("image/")) {
    throw new Error(`OpenAI Vision esperava imagem, recebeu ${mediaType}`);
  }

  const res = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPTS[tipo] },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ],
    }],
    temperature: 0,
    max_tokens: 1024,
    response_format: { type: "json_object" },
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const dados = JSON.parse(raw);
  return normalizar(tipo, dados);
}
