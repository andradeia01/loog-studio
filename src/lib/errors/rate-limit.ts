/**
 * Rate limit em memória por consultor (userId) ao invés de IP.
 *
 * Motivo: um escritório LOOG tem múltiplos consultores atrás do mesmo IP
 * NAT corporativo. Limitar por IP mata TODO o escritório quando um só
 * passa do limite. Por consultor cada um tem seu próprio bucket.
 *
 * Fallback: quando não há userId (ex: dev sem Supabase), usa IP.
 *
 * Janela: 60s. Limite default 60 req/min = 1 req/s por consultor — generoso
 * o bastante pra uma sessão intensa de pesquisa, mas corta loop/script.
 */

const BUCKETS = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  limited: boolean;
  /** Segundos até o próximo reset (quando limited=true). */
  retryAfterSecs: number;
  /** Quantas requests restam na janela atual. */
  remaining: number;
}

/**
 * Verifica o bucket do consultor (ou IP) e incrementa.
 *
 * @param key          Identificador único (userId é preferido; IP como fallback)
 * @param limit        Limite de requests por janela
 * @param windowMs     Tamanho da janela em ms (padrão 60s)
 */
export function checkRateLimit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  const rec = BUCKETS.get(key);
  if (!rec || rec.resetAt < now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSecs: 0, remaining: limit - 1 };
  }
  rec.count += 1;
  if (rec.count > limit) {
    return {
      limited: true,
      retryAfterSecs: Math.ceil((rec.resetAt - now) / 1000),
      remaining: 0,
    };
  }
  return {
    limited: false,
    retryAfterSecs: 0,
    remaining: Math.max(0, limit - rec.count),
  };
}

/** Mnemonic helper: monta a chave priorizando userId; usa IP só se não houver user. */
export function rateLimitKey(userId: string | null | undefined, ip: string, scope: string): string {
  return `${scope}:${userId ?? `ip:${ip}`}`;
}
