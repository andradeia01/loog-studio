import { getQuotas, quotaUsedThisMonth } from "../admin-settings";

export type QuotaKind = "text" | "image" | "voice_chars" | "transcribe_min";
export type Role = "admin" | "gestor" | "consultor";

export function roleKey(role: "admin" | "gestor" | "consultant"): Role {
  if (role === "consultant") return "consultor";
  return role;
}

/**
 * Verifica se o profile pode fazer mais uma geração desse tipo.
 * Retorna { ok: true } ou { ok: false, reason }.
 * Para voice_chars/transcribe_min, `amount` é a métrica a adicionar (chars ou min); pra text/image é 1.
 */
export async function checkQuota(
  profileId: string,
  role: "admin" | "gestor" | "consultant" | "consultant_sdr",
  kind: QuotaKind,
  amount = 1,
): Promise<{ ok: true; limit: number; used: number; remaining: number } | { ok: false; reason: string; limit: number; used: number }> {
  const quotas = await getQuotas();
  // consultant_sdr herda a quota do consultant comum
  const effectiveRole: "admin" | "gestor" | "consultant" =
    role === "consultant_sdr" ? "consultant" : role;
  const limit = quotas[roleKey(effectiveRole)][kind];
  if (limit < 0) return { ok: true, limit: -1, used: 0, remaining: -1 };
  const used = await quotaUsedThisMonth(profileId, kind === "voice_chars" ? "voice" : kind === "transcribe_min" ? "transcribe" : kind);
  if (used + amount > limit) {
    return { ok: false, reason: `Quota mensal esgotada (${used}/${limit}). Peça pro admin aumentar.`, limit, used };
  }
  return { ok: true, limit, used, remaining: limit - used - amount };
}
