"use client";

import { useEffect } from "react";

/**
 * Registra o /sw.js no primeiro paint do app + atualização FORÇADA automática.
 *
 * Fluxo quando sai versão nova no deploy:
 *   1. Browser detecta sw.js mudou (byte-diff, graças ao header Cache-Control:
 *      no-cache em public/_headers)
 *   2. SW novo é instalado + ativa (skipWaiting + clients.claim)
 *   3. SW manda postMessage pros clients → recarregamos a aba automático
 *
 * Além disso, chama reg.update() a cada 30s pra forçar check — garante que
 * mesmo PWAs instalados há dias peguem a atualização assim que entrarem.
 */
export function ServiceWorkerBoot() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let reloaded = false;

    const safeReload = () => {
      if (reloaded) return;
      reloaded = true;
      // Pequeno delay pra evitar race com outras ações in-flight
      setTimeout(() => window.location.reload(), 300);
    };

    const bootTimer = setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Força check de atualização agora
          reg.update().catch(() => { /* silencioso */ });

          // E a cada 30s enquanto a aba estiver aberta — pega updates sem reload manual
          intervalId = setInterval(() => {
            reg.update().catch(() => { /* silencioso */ });
          }, 30_000);

          // Escuta quando o novo SW instalou e ativou
          reg.addEventListener("updatefound", () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener("statechange", () => {
              if (sw.state === "activated" && navigator.serviceWorker.controller) {
                // Novo SW ativo em aba existente → recarrega pra pegar o código novo
                console.log("[sw-boot] nova versão ativada, recarregando...");
                safeReload();
              }
            });
          });

          // Escuta mensagem do próprio SW (postMessage no activate)
          navigator.serviceWorker.addEventListener("message", (ev) => {
            if (ev.data?.type === "LOOG_SW_UPDATED") {
              console.log("[sw-boot] SW anunciou atualização, recarregando...", ev.data.version);
              safeReload();
            }
          });

          // Controllerchange = SW novo assumiu — recarrega pra sincronizar
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            console.log("[sw-boot] controller change, recarregando...");
            safeReload();
          });
        })
        .catch((err) => console.warn("[sw-boot] falha ao registrar SW:", err));
    }, 1200);

    return () => {
      clearTimeout(bootTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return null;
}
