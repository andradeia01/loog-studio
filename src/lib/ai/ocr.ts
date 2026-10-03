/**
 * OCR estruturado de documentos brasileiros via Claude Vision (Haiku 4.5).
 *
 * Antes usava GPT-4o Vision — trocado por Anthropic pra reduzir dependência
 * de uma única chave e porque Haiku 4.5 tem OCR estruturado excelente,
 * mais barato e mais rápido.
 *
 * Suporta: CRLV, CNH, Comprovante de residência.
 * Entrada: data URL (image/jpeg, image/png, application/pdf).
 */

import { getAnthropic, MODEL_OCR } from "./anthropic";

export type DocumentoTipo = "crlv" | "cnh" | "residencia";

export interface CRLVData {
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
  marca: string | null;
  modelo: string | null;
  ano_fabricacao: string | null;
  ano_modelo: string | null;
  cor: string | null;
  combustivel: string | null;
  categoria: string | null;
  municipio: string | null;
  uf: string | null;
  proprietario: string | null;
  cpf_cnpj: string | null;
}

export interface CNHData {
  nome: string | null;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  categoria: string | null;
  numero_registro: string | null;
  validade: string | null;
  primeira_habilitacao: string | null;
  cidade_emissao: string | null;
  uf_emissao: string | null;
}

export interface ResidenciaData {
  titular: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  tipo_conta: string | null;
  data_emissao: string | null;
}

export type OCRResult = {
  tipo: "crlv"; dados: CRLVData;
} | {
  tipo: "cnh"; dados: CNHData;
} | {
  tipo: "residencia"; dados: ResidenciaData;
};

const PROMPTS: Record<DocumentoTipo, string> = {
  crlv: `Você é um extrator de dados de CRLV (Certificado de Registro e Licenciamento do Veículo brasileiro). Analise o documento e retorne APENAS um JSON com estes campos (null se o campo não aparecer):

{"placa":string|null,"chassi":string|null,"renavam":string|null,"marca":string|null,"modelo":string|null,"ano_fabricacao":string|null,"ano_modelo":string|null,"cor":string|null,"combustivel":string|null,"categoria":string|null,"municipio":string|null,"uf":string|null,"proprietario":string|null,"cpf_cnpj":string|null}

Regras:
- Placa: só letras/números sem traço (ex: ABC1D23)
- CPF/CNPJ: só dígitos
- Chassi: 17 caracteres alfanuméricos
- Nunca invente — se não ler claro, retorne null
- Retorne SOMENTE o JSON cru, sem \`\`\`json, sem explicação`,

  cnh: `Você é um extrator de dados de CNH (Carteira Nacional de Habilitação brasileira). Analise o documento e retorne APENAS um JSON com estes campos (null se o campo não aparecer):

{"nome":string|null,"cpf":string|null,"rg":string|null,"data_nascimento":string|null,"categoria":string|null,"numero_registro":string|null,"validade":string|null,"primeira_habilitacao":string|null,"cidade_emissao":string|null,"uf_emissao":string|null}

Regras:
- CPF e RG: só dígitos
- Datas no formato YYYY-MM-DD (ISO)
- Categoria: letra única ou combinação (A, B, C, D, E, AB, AC)
- Nunca invente — se não ler claro, retorne null
- Retorne SOMENTE o JSON cru, sem \`\`\`json, sem explicação`,

  residencia: `Você é um extrator de dados de comprovante de residência brasileiro (conta de luz, água, gás, internet, telefone). Analise o documento e retorne APENAS um JSON com estes campos (null se o campo não aparecer):

{"titular":string|null,"endereco":string|null,"bairro":string|null,"cidade":string|null,"uf":string|null,"cep":string|null,"tipo_conta":string|null,"data_emissao":string|null}

Regras:
- endereco: rua + número + complemento numa string única
- CEP: 8 dígitos
- tipo_conta: "energia" | "agua" | "internet" | "telefone" | "gas" | "outros"
- data_emissao: YYYY-MM-DD
- UF: sigla 2 letras maiúsculas
- Nunca invente — se não ler claro, retorne null
- Retorne SOMENTE o JSON cru, sem \`\`\`json, sem explicação`,
};

interface ContentBlock {
  type: "text" | "image" | "document";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

/**
 * Extrai dados estruturados de uma imagem ou PDF de documento.
 * @param tipo tipo do documento (crlv | cnh | residencia)
 * @param dataUrl data URL (ex: "data:image/jpeg;base64,/9j/..." ou "data:application/pdf;base64,...")
 */
export async function extrairDocumento(tipo: DocumentoTipo, dataUrl: string): Promise<OCRResult> {
  const client = await getAnthropic();
  if (!client) {
    throw new Error("Anthropic não configurado. Peça pro admin adicionar a chave em /admin/config → API Keys.");
  }

  // parse data URL: "data:<mime>;base64,<data>"
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("data URL inválida — esperado 'data:<mime>;base64,<data>'");
  const mediaType = match[1];
  const base64 = match[2];

  const isPdf = mediaType === "application/pdf";
  const isImage = mediaType.startsWith("image/");
  if (!isPdf && !isImage) throw new Error(`Media type não suportado: ${mediaType}`);

  // Monta o content block: 'document' pra PDF, 'image' pra imagem
  const docBlock: ContentBlock = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      }
    : {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      };

  const res = await client.messages.create({
    model: MODEL_OCR,
    max_tokens: 1024,
    temperature: 0,
    messages: [
      {
        role: "user",
        // cast pra evitar tipos muito restritos do SDK (document support é recente)
        content: [
          docBlock,
          { type: "text", text: PROMPTS[tipo] },
        ] as unknown as Anthropic.Messages.ContentBlockParam[],
      },
    ],
  });

  const raw = res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Remove ```json wrappers se o Claude escapar o formato
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(cleaned);
  } catch {
    throw new Error(`OCR retornou JSON inválido: ${cleaned.slice(0, 200)}`);
  }

  // Normalização por tipo
  if (tipo === "crlv") {
    if (dados.placa && typeof dados.placa === "string") {
      dados.placa = dados.placa.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    }
    if (dados.cpf_cnpj && typeof dados.cpf_cnpj === "string") {
      dados.cpf_cnpj = dados.cpf_cnpj.replace(/[^0-9]/g, "");
    }
    return { tipo: "crlv", dados: dados as unknown as CRLVData };
  }
  if (tipo === "cnh") {
    if (dados.cpf && typeof dados.cpf === "string") dados.cpf = dados.cpf.replace(/[^0-9]/g, "");
    if (dados.rg && typeof dados.rg === "string") dados.rg = dados.rg.replace(/[^0-9A-Za-z]/g, "");
    return { tipo: "cnh", dados: dados as unknown as CNHData };
  }
  if (dados.cep && typeof dados.cep === "string") dados.cep = dados.cep.replace(/[^0-9]/g, "");
  if (dados.uf && typeof dados.uf === "string") dados.uf = dados.uf.toUpperCase().slice(0, 2);
  return { tipo: "residencia", dados: dados as unknown as ResidenciaData };
}

// precisamos importar o tipo do SDK pra o cast interno — reimport aqui pra TS
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Anthropic from "@anthropic-ai/sdk";
