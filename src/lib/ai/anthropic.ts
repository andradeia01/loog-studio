import Anthropic from "@anthropic-ai/sdk";
import { getApiKeys } from "../admin-settings";

let cached: Anthropic | null = null;
let cachedKey = "";

/** Cliente Anthropic usando a key de admin_settings. null se não configurada. */
export async function getAnthropic(): Promise<Anthropic | null> {
  const keys = await getApiKeys();
  const key = keys.anthropic;
  if (!key) return null;
  if (cached && cachedKey === key) return cached;
  cached = new Anthropic({ apiKey: key });
  cachedKey = key;
  return cached;
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
