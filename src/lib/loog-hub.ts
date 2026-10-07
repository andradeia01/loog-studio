/**
 * Cliente HTTP do LOOG AI SDR Integration Hub (projeto SDR - LOOG - PROTEÇÃO VEICULAR).
 *
 * O Hub expõe endpoints Fastify autenticados por Bearer `LOOG_HUB_API_KEY` e
 * encapsula toda a integração com Sivisweb (login + BuscaPlaca + resolve FIPE +
 * cadeia salvarLead → buscarServicos → buscarCoberturas → updateLead →
 * getModeloWhats + proxy de PDF).
 *
 * O LOOG Studio deve usar APENAS este cliente. Nunca falar direto com Sivisweb.
 */

const DEFAULT_TIMEOUT_MS = 25_000;

export interface HubVehicle {
  plate: string;
  brand: string;
  model: string;
  modelYear: number;
  color?: string;
  fipeCode: string;
  fipeFormatted: string;
  vehicleType: number;
  vehicleCategory: "carro" | "moto" | "caminhão" | string;
}

export interface HubPlan {
  productId: string | number;
  name: string;
  monthlyValueCents?: number;
  monthlyValueFormatted?: string;
  joinFeeValueCents?: number;
  joinFeeFormatted?: string;
  defaultServices?: Array<{ id: string; name: string; valueFormatted: string }>;
  defaultCoverages?: Array<{ id: string; name: string; valueFormatted: string }>;
}

export interface HubQuoteResult {
  quoteId: string;
  provider: string;
  plan?: HubPlan;
  whatsappMessage?: string;
  portalUrl?: string;
  printUrl?: string;
  pdfUrl?: string;
  vehicle?: HubVehicle;
}

export interface HubEnvelope<T> {
  success: boolean;
  data: T;
  requestId?: string;
}

export class HubError extends Error {
  constructor(message: string, public status: number, public code?: string, public payload?: unknown) {
    super(message);
    this.name = "HubError";
  }
}

function baseUrl(): string {
  const raw = process.env.LOOG_HUB_URL?.trim();
  if (!raw) throw new HubError("LOOG_HUB_URL não configurado.", 500, "HUB_URL_MISSING");
  return raw.replace(/\/+$/, "");
}

function apiKey(): string {
  const key = process.env.LOOG_HUB_API_KEY?.trim();
  if (!key) throw new HubError("LOOG_HUB_API_KEY não configurado.", 500, "HUB_KEY_MISSING");
  return key;
}

function headers(): HeadersInit {
  return {
    "Authorization": `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "LoogStudio/1.0",
  };
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    cache: "no-store",
  });
  const payload = await res.json().catch(async () => {
    const t = await res.text().catch(() => "");
    return t ? { _raw: t } : null;
  });
  if (!res.ok) {
    const p = payload as Record<string, unknown> | null;
    const code = (p?.error as { code?: string } | undefined)?.code;
    const msg = (p?.error as { message?: string } | undefined)?.message ?? `HUB ${path} → ${res.status}`;
    throw new HubError(msg, res.status, code, payload);
  }
  return payload as T;
}

/**
 * Endpoint one-shot: recebe apenas placa + cliente, Hub faz:
 *   lookup placa (provider configurado) → resolve FIPE no Sivisweb →
 *   cadeia completa salvarLead → ... → getModeloWhats →
 *   proxy de PDF em pdfUrl.
 *
 * Campos opcionais extras (cpf, endereço, CEP, etc.) são enviados ao Hub
 * que repassa pro SIVIS no salvarUsuario — útil pra cotação completa com OCR.
 */
export async function quoteFromPlate(input: {
  plate: string;
  customerName: string;
  customerPhone: string;
  customerCpf?: string;
  customerBirthDate?: string;
  customerCep?: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  leadId?: string;
  idempotencyKey?: string;
  productId?: string | number;
}): Promise<HubQuoteResult> {
  const envelope = await post<HubEnvelope<HubQuoteResult>>("/v1/quote/from-plate", input);
  return envelope.data;
}

/**
 * Cria cotação a partir de dados já conhecidos (quando a placa não resolve FIPE
 * ou quando o veículo é novo/zero km). Mesmo retorno de quoteFromPlate.
 */
export async function quoteFromText(input: {
  brand: string;
  model: string;
  modelYear: number;
  fuel?: string;
  fuelInitial?: string;
  plate?: string;
  /** Código FIPE oficial (ex: "001255-6"). Quando enviado, o Hub DEVE usar ele
   *  direto ao invés de fazer matching por string em marca/modelo — evita
   *  divergência de valor FIPE em modelos com múltiplas versões. */
  fipeCode?: string;
  customerName: string;
  customerPhone: string;
  customerCpf?: string;
  customerBirthDate?: string;
  customerCep?: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  leadId?: string;
  idempotencyKey?: string;
  productId?: string | number;
}): Promise<HubQuoteResult> {
  const envelope = await post<HubEnvelope<HubQuoteResult>>("/v1/quote/from-text", input);
  return envelope.data;
}

export function hubStatus() {
  return {
    hasUrl: !!process.env.LOOG_HUB_URL,
    hasKey: !!process.env.LOOG_HUB_API_KEY,
    url: process.env.LOOG_HUB_URL?.replace(/\/+$/, "") ?? null,
  };
}
