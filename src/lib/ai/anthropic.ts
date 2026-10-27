import Anthropic from "@anthropic-ai/sdk";
import { getApiKeys } from "../admin-settings";

let cached: Anthropic | null = null;
let cachedKey = "";

/** Cliente Anthropic. Prefere key de admin_settings (ajustável sem redeploy);
 *  cai pra ANTHROPIC_API_KEY da env quando o banco não tem nada. Retorna null
 *  só se ambas as fontes estiverem vazias. */
export async function getAnthropic(): Promise<Anthropic | null> {
  const keys = await getApiKeys();
  const key = keys.anthropic || process.env.ANTHROPIC_API_KEY || "";
  if (!key) return null;
  if (cached && cachedKey === key) return cached;
  cached = new Anthropic({ apiKey: key });
  cachedKey = key;
  return cached;
}

/** Fonte da chave atualmente em uso. Útil pro admin diagnosticar 401. */
export async function getAnthropicKeySource(): Promise<"db" | "env" | "none"> {
  const keys = await getApiKeys();
  if (keys.anthropic) return "db";
  if (process.env.ANTHROPIC_API_KEY) return "env";
  return "none";
}

/** Modelo padrão pra OCR estruturado — Haiku 4.5 é rápido, barato e excelente em JSON. */
export const MODEL_OCR = "claude-haiku-4-5-20251001" as const;

/** Pricing aproximado USD / 1M tokens (nov 2026). */
export const ANTHROPIC_PRICING = {
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-opus-5-5": { in: 15, out: 75 },
} as const;

export function calcAnthropicCost(model: keyof typeof ANTHROPIC_PRICING, tokensIn: number, tokensOut: number): number {
  const p = ANTHROPIC_PRICING[model];
  if (!p) return 0;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}
