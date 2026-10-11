"use client";

import { useEffect } from "react";

/**
 * Intercepta o back-button do Android no PWA (modo standalone).
 *
 * Sem isso, apertar "voltar" no celular FECHA o app. Com isso, voltamos
 * entre as abas internas (sub → mundo → home), e só fecha quando o usuário
 * aperta voltar já estando na home — comportamento familiar tipo Instagram.
 *
 * Como funciona:
 *  1. Ao montar, empurramos um history state "sentinela" ({ loogShell: true }).
 *  2. Quando o usuário aperta voltar, popstate dispara. Se nossa sentinela
 *     for consumida (state atual != sentinela), chamamos onBack() e empurramos
 *     a sentinela de novo pra interceptar o próximo back.
 *  3. onBack() recebe o estado atual e decide: fecha drawer? volta de sub pra
 *     mundo? volta de mundo pra home? ou (na home) não faz nada.
 *
 * Importante: só ativa em modo standalone (PWA instalado) pra não interferir
 * com a navegação normal do browser.
 */
export function useAndroidBack(onBack: () => boolean | void) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Só ativa quando o app está rodando como PWA standalone
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (!isStandalone) return;

    const SENTINEL = { loogShell: true, t: Date.now() };

    const pushSentinel = () => {
      try { window.history.pushState(SENTINEL, "", window.location.href); } catch { /* ignore */ }
    };

    pushSentinel();

    const handlePop = (_e: PopStateEvent) => {
      // onBack retorna true se "consumiu" (navegou internamente).
      // Se retornar false/undefined, deixa o browser prosseguir (fecha o app na home).
      const consumed = onBack();
      if (consumed === true) {
        // re-arma a sentinela pra interceptar o próximo back
        pushSentinel();
      }
    };

    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [onBack]);
}
