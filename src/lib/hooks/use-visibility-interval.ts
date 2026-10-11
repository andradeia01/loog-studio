"use client";

import { useEffect, useRef } from "react";

/**
 * setInterval que PAUSA quando a aba fica oculta (`document.hidden === true`)
 * e dispara UMA execução imediata ao retomar.
 *
 * Economiza bateria/dados em mobile e evita custo com polls quando o usuário
 * não tá olhando. Essencial em PWA pra não gastar bateria em background.
 *
 * Uso:
 *   useVisibilityInterval(() => {
 *     void fetchStatus();
 *   }, 8_000);
 */
export function useVisibilityInterval(callback: () => void, intervalMs: number) {
  // Guarda callback num ref pra o useEffect do interval não re-rodar quando o
  // callback mudar de referência (o padrão clássico).
  const cbRef = useRef(callback);
  useEffect(() => { cbRef.current = callback; }, [callback]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer != null) return;
      timer = setInterval(() => { cbRef.current(); }, intervalMs);
    };
    const stop = () => {
      if (timer == null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // Ao voltar, roda 1x imediatamente pra pegar o que perdeu
        cbRef.current();
        start();
      }
    };

    // Começa (se visível) e escuta mudanças
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
