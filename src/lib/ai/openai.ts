import OpenAI from "openai";
import { getApiKeys } from "../admin-settings";

let cached: OpenAI | null = null;
let cachedKey = "";

/** Retorna cliente OpenAI usando a key do admin_settings; null se não configurada. */
export async function getOpenAI(): Promise<OpenAI | null> {
  const keys = await getApiKeys();
  const key = keys.openai;
  if (!key) return null;
  if (cached && cachedKey === key) return cached;
  cached = new OpenAI({ apiKey: key });
  cachedKey = key;
  return cached;
}

/** Preços aproximados em USD por 1M tokens (GPT-4o outubro 2025). Atualizar quando mudar. */
export const MODEL_PRICING = {
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
} as const;

/** Preço fixo por imagem DALL-E 3 (standard 1024x1024) em USD. */
export const IMAGE_PRICING = {
  "dall-e-3-1024": 0.04,
  "dall-e-3-1024-hd": 0.08,
  "dall-e-3-1024x1792": 0.08,
} as const;

export function calcTextCost(model: keyof typeof MODEL_PRICING, tokensIn: number, tokensOut: number): number {
  const p = MODEL_PRICING[model];
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}
