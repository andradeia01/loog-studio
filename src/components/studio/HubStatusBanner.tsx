"use client";

/**
 * Banner global que aparece no topo do /studio quando o LOOG Hub está offline.
 * Faz polling do /api/hub/health a cada 30s. Enquanto Hub fora, consultor sabe
 * que não é bug dele — é a infra LOOG.
 *
 * Exportado também o hook useHubStatus() pra outros componentes (ex: PlacaStudio)
 * desabilitarem o botão "Gerar cotação" enquanto Hub tá offline.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface HubStatus {
  ok: boolean;
  url?: string | null;
  error?: string;
  latencyMs?: number;
}

let CACHED_STATUS: HubStatus | null = null;
const LISTENERS = new Set<(s: HubStatus) => void>();
let POLL_TIMER: ReturnType<typeof setInterval> | null = null;

async function fetchStatus(): Promise<HubStatus> {
  try {
    const r = await fetch("/api/hub/health", { cache: "no-store" });
    const j = await r.json();
    return j as HubStatus;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "offline" };
  }
}

function startPolling() {
  if (POLL_TIMER) return;
  const run = async () => {
    const s = await fetchStatus();
    CACHED_STATUS = s;
    LISTENERS.forEach((l) => l(s));
  };
  run();
  POLL_TIMER = setInterval(run, 30_000);
}

function stopPollingIfNoListeners() {
  if (LISTENERS.size === 0 && POLL_TIMER) {
    clearInterval(POLL_TIMER);
    POLL_TIMER = null;
  }
}

/** Hook: devolve o status atual do Hub, polling automaticamente. */
export function useHubStatus(): HubStatus {
  const [status, setStatus] = useState<HubStatus>(CACHED_STATUS ?? { ok: true });
  useEffect(() => {
    LISTENERS.add(setStatus);
    startPolling();
    if (CACHED_STATUS) setStatus(CACHED_STATUS);
    return () => {
      LISTENERS.delete(setStatus);
      stopPollingIfNoListeners();
    };
  }, []);
  return status;
}

export function HubStatusBanner() {
  const status = useHubStatus();
  if (status.ok) return null;
  return (
    <div className={cn(
      "sticky top-0 z-40 border-b border-red-500/50 bg-gradient-to-r from-red-600/90 to-red-700/90 px-4 py-2 text-xs text-white backdrop-blur",
    )}>
      <div className="container-loog flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <div>
            <b>Sistema LOOG Hub temporariamente offline</b>
            <span className="ml-2 opacity-80">
              — cotações oficiais indisponíveis até o servidor voltar.
              {status.error && <span className="ml-1 opacity-60">({status.error})</span>}
            </span>
          </div>
        </div>
        <span className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest">
          Admin notificado
        </span>
      </div>
    </div>
  );
}
