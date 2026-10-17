"use client";

/**
 * Fetch wrapper com DUAS garantias:
 *
 * 1) Keep-alive de sessão: a cada 4min pinga /api/me em background enquanto
 *    tem aba aberta. Isso faz o middleware do Next renovar o cookie Supabase
 *    (que dura 1h) ANTES de expirar, matando o problema do "fica 1h fazendo
 *    pesquisa e começa a dar falha, falha, falha".
 *
 * 2) Auto-refresh em 401: se um fetch bater num 401 (sessão realmente expirou
 *    por qualquer motivo — reboot do servidor, cookie corrompido, etc), tenta
 *    `supabase.auth.refreshSession()` e refaz a request UMA vez. Se o refresh
 *    falhar, dispara evento "session-expired" — o SessionGuard escuta e mostra
 *    o modal "Entrar de novo".
 *
 * Uso em componentes:
 *   import { apiFetch } from "@/lib/errors/api-fetch";
 *   const res = await apiFetch("/api/cotacao", { method: "POST", body: ... });
 *
 * Montagem global: SessionGuard chama startKeepalive() uma vez na raiz do app.
 */

import { createSupabaseBrowser } from "@/lib/supabase/client";

const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4min — Supabase JWT dura 1h
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let lastKeepalive = 0;

/** Dispara "session-expired" event que o SessionGuard escuta. */
function dispatchSessionExpired() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("loog:session-expired"));
}

/** Inicia o keep-alive. Idempotente — múltiplas chamadas não duplicam o timer. */
export function startSessionKeepalive() {
  if (typeof window === "undefined" || keepaliveTimer) return;
  const ping = async () => {
    // Economiza: só pinga se a aba está visível (não roda em segundo plano por horas)
    if (document.hidden) return;
    try {
      const res = await fetch("/api/me", { credentials: "include", cache: "no-store" });
      lastKeepalive = Date.now();
      if (res.status === 401) dispatchSessionExpired();
    } catch { /* offline — tudo bem, próximo tick tenta de novo */ }
  };
  keepaliveTimer = setInterval(ping, KEEPALIVE_INTERVAL_MS);
  // Primeiro ping imediato quando a aba volta pro foco após ficar oculta
  const onVisible = () => {
    if (!document.hidden && Date.now() - lastKeepalive > KEEPALIVE_INTERVAL_MS) void ping();
  };
  document.addEventListener("visibilitychange", onVisible);
  // Primeira execução depois de 10s (dá tempo da UI montar)
  setTimeout(ping, 10_000);
}

export function stopSessionKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

/**
 * Fetch com retry automático em caso de 401 (tenta refreshSession, refaz request).
 * Se refresh falhar, dispara evento "loog:session-expired" pra UI mostrar modal.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const first = await fetch(input, { credentials: "include", ...init });
  if (first.status !== 401) return first;

  // 401 → tenta refresh de sessão UMA vez
  try {
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) {
      dispatchSessionExpired();
      return first;
    }
    // Refaz a request com cookie novo
    const retry = await fetch(input, { credentials: "include", ...init });
    if (retry.status === 401) dispatchSessionExpired();
    return retry;
  } catch {
    dispatchSessionExpired();
    return first;
  }
}
