/**
 * OCR estruturado de documentos brasileiros via GPT-4o Vision.
 *
 * Suporta 3 tipos de documento:
 *   - CRLV (Certificado de Registro e Licenciamento do Veículo)
 *   - CNH (Carteira Nacional de Habilitação)
 *   - Comprovante de residência (conta de luz/água/internet/etc)
 *
 * Devolve JSON estruturado + campos faltantes marcados como null.
 * Nunca inventa dado — se não ler, retorna null naquele campo.
 */

import { getOpenAI } from "./openai";

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
  data_nascimento: string | null; // formato ISO YYYY-MM-DD quando possível
  categoria: string | null;
  numero_registro: string | null;
  validade: string | null;        // ISO
  primeira_habilitacao: string | null;
  cidade_emissao: string | null;
  uf_emissao: string | null;
}

export interface ResidenciaData {
  titular: string | null;
  endereco: string | null;        // rua + número + complemento
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  tipo_conta: string | null;      // "energia" | "agua" | "internet" | "telefone" | "outros"
  data_emissao: string | null;    // ISO
}

export type OCRResult = {
  tipo: "crlv"; dados: CRLVData;
} | {
  tipo: "cnh"; dados: CNHData;
} | {
  tipo: "residencia"; dados: ResidenciaData;
};

const PROMPTS: Record<DocumentoTipo, string> = {
  crlv: `Você é um extrator de dados de CRLV (Certificado de Registro e Licenciamento do Veículo brasileiro). Analise a imagem e retorne APENAS um JSON com estes campos (null se o campo não aparecer na imagem):

{"placa":string|null,"chassi":string|null,"renavam":string|null,"marca":string|null,"modelo":string|null,"ano_fabricacao":string|null,"ano_modelo":string|null,"cor":string|null,"combustivel":string|null,"categoria":string|null,"municipio":string|null,"uf":string|null,"proprietario":string|null,"cpf_cnpj":string|null}

Regras:
- Placa: só letras/números, sem traço (ex: ABC1D23)
- CPF/CNPJ: só dígitos
- Chassi: 17 caracteres alfanuméricos
- Renavam: só dígitos
- Nunca invente — se não ler claro, retorne null
- Retorne SOMENTE o JSON, sem markdown, sem explicação`,

  cnh: `Você é um extrator de dados de CNH (Carteira Nacional de Habilitação brasileira). Analise a imagem e retorne APENAS um JSON com estes campos (null se o campo não aparecer na imagem):

{"nome":string|null,"cpf":string|null,"rg":string|null,"data_nascimento":string|null,"categoria":string|null,"numero_registro":string|null,"validade":string|null,"primeira_habilitacao":string|null,"cidade_emissao":string|null,"uf_emissao":string|null}

Regras:
- CPF e RG: só dígitos
- Datas no formato YYYY-MM-DD (ISO)
- Categoria: letra A, B, C, D, E (ou combinações como AB)
- Nunca invente — se não ler claro, retorne null
- Retorne SOMENTE o JSON, sem markdown, sem explicação`,

  residencia: `Você é um extrator de dados de comprovante de residência brasileiro (conta de luz, água, gás, internet, telefone ou outros). Analise a imagem e retorne APENAS um JSON com estes campos (null se o campo não aparecer na imagem):

{"titular":string|null,"endereco":string|null,"bairro":string|null,"cidade":string|null,"uf":string|null,"cep":string|null,"tipo_conta":string|null,"data_emissao":string|null}

Regras:
- endereco: rua + número + complemento numa string só (ex: "Av. Paulista, 1000 ap 42")
- CEP só dígitos (8 caracteres)
- tipo_conta: energia | agua | internet | telefone | gas | outros
- data_emissao: ISO YYYY-MM-DD
- UF: sigla 2 letras maiúsculas
- Nunca invente — se não ler claro, retorne null
- Retorne SOMENTE o JSON, sem markdown, sem explicação`,
};

/**
 * Extrai dados de uma imagem de documento.
 * @param tipo tipo do documento
 * @param imageDataUrl data URL completo (ex: "data:image/jpeg;base64,/9j/4AAQ...")
 */
export async function extrairDocumento(tipo: DocumentoTipo, imageDataUrl: string): Promise<OCRResult> {
  const openai = await getOpenAI();
  if (!openai) throw new Error("OpenAI não configurado. Peça pro admin adicionar a chave em /admin/config.");

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPTS[tipo] },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 500,
    response_format: { type: "json_object" },
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(raw);
  } catch {
    throw new Error(`OCR retornou JSON inválido: ${raw.slice(0, 200)}`);
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
