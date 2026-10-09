"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Toast flutuante que aparece quando sai uma versão nova do app.
 * Faz polling leve de /api/version a cada 2min; se o commit mudou,
 * mostra o toast com botão "Atualizar". Click = reload hard (limpa
 * cache do service worker junto).
 */
export function UpdateToast() {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const initial = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { commit?: string };
        const commit = data.commit ?? null;
        if (!alive || !commit) return;
        if (initial.current === null) {
          initial.current = commit;
        } else if (commit !== initial.current && commit !== "dev") {
          setNewVersion(commit);
        }
      } catch { /* silencioso */ }
    };
    check();
    const t = setInterval(check, 2 * 60 * 1000); // 2min
    return () => { alive = false; clearInterval(t); };
  }, []);

  const handleUpdate = async () => {
    // Tenta mandar o SW atualizar antes do reload
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
      }
    } catch { /* silencioso */ }
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {newVersion && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="fixed inset-x-4 bottom-20 z-[70] mx-auto max-w-sm rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-600/95 to-emerald-700/95 p-4 shadow-2xl shadow-emerald-500/30 backdrop-blur md:left-auto md:right-6 md:bottom-6"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl">🔄</div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white">Nova versão disponível</div>
              <div className="mt-0.5 text-[11px] text-emerald-50/90">
                Toque pra atualizar e pegar as novidades.
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleUpdate}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow hover:bg-emerald-50"
                >
                  Atualizar agora
                </button>
                <button
                  type="button"
                  onClick={() => setNewVersion(null)}
                  className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                >
                  Depois
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
