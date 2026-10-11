"use client";

import { useEffect } from "react";

/**
 * Registra o /sw.js no primeiro paint do app — INDEPENDENTE de push notification.
 * Antes, o SW só subia quando o usuário ligava push em SdrPane. Resultado: PWA
 * instalado sem SW = sem offline-shell, sem cache de assets, carregamento lento.
 *
 * O sw.js atual tem handlers de install/activate/push/notificationclick (sem
 * fetch handler, ou seja, não intercepta requests). Registrar no boot é seguro
 * — só adiciona o controle (que push + futuras funções de cache precisam).
 */
export function ServiceWorkerBoot() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Delay pequeno pra não bloquear o first paint
    const t = setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("[sw-boot] falha ao registrar SW:", err));
    }, 1200);

    return () => clearTimeout(t);
  }, []);

  return null;
}
