"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Twenty CRM embutido no Studio.
 *
 * Twenty roda num container Docker na VPS LOOG (porta 127.0.0.1:3013)
 * e é exposto via Caddy em https://crm.loogstudio.tech com:
 *   - X-Frame-Options strippado
 *   - CSP frame-ancestors permitindo loogstudio.netlify.app
 *
 * Se o iframe não carregar em 8s (DNS não resolveu, Twenty bloqueou),
 * mostramos fallback com link pra abrir em nova aba + instrução admin.
 */

const TWENTY_URL = "https://crm.loogstudio.tech";
const IFRAME_TIMEOUT_MS = 8_000;

export function TwentyCrmPane() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "timeout">("loading");
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      if (state === "loading") setState("timeout");
    }, IFRAME_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloads]);

  function reload() {
    setReloads((n) => n + 1);
    setState("loading");
    if (iframeRef.current) iframeRef.current.src = `${TWENTY_URL}?r=${Date.now()}`;
  }

  return (
    <div className="relative flex h-[calc(100vh-180px)] min-h-[500px] w-full flex-col overflow-hidden rounded-xl border border-loog-border bg-loog-panel">
      {/* Header com indicador + ações */}
      <div className="flex items-center justify-between gap-3 border-b border-loog-border/60 bg-loog-bg/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xl">💎</span>
          <div>
            <h2 className="font-display text-sm font-bold text-white">Twenty CRM</h2>
            <p className="text-[11px] text-loog-muted">Alternativa open-source ao Salesforce · rodando na VPS LOOG</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            state === "ready" ? "border-green-500/40 bg-green-500/10 text-green-300" :
            state === "timeout" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" :
            "border-sky-500/40 bg-sky-500/10 text-sky-300"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              state === "ready" ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" :
              state === "timeout" ? "bg-amber-400" :
              "animate-pulse bg-sky-400"
            }`} />
            {state === "ready" ? "online" : state === "timeout" ? "inacessível" : "conectando"}
          </span>
          <button
            onClick={reload}
            className="rounded border border-loog-border bg-loog-bg px-2.5 py-1 text-[11px] text-white/80 hover:border-loog-brand"
            title="Recarregar"
          >
            ↻ Recarregar
          </button>
          <a
            href={TWENTY_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-loog-brand/40 bg-loog-brand/10 px-2.5 py-1 text-[11px] text-loog-brand hover:bg-loog-brand/20"
          >
            ↗ Abrir em nova aba
          </a>
        </div>
      </div>

      {/* Iframe + overlays */}
      <div className="relative flex-1">
        <iframe
          ref={iframeRef}
          key={reloads}
          src={TWENTY_URL}
          title="Twenty CRM"
          className="h-full w-full border-0 bg-white"
          allow="clipboard-read; clipboard-write; fullscreen"
          onLoad={() => setState("ready")}
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-top-navigation-by-user-activation"
        />

        {state === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-loog-bg/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-loog-brand border-t-transparent" />
              <p className="text-sm text-loog-muted">Conectando ao Twenty CRM...</p>
            </div>
          </div>
        )}

        {state === "timeout" && (
          <div className="absolute inset-0 flex items-center justify-center bg-loog-bg/90 backdrop-blur-sm">
            <div className="max-w-md space-y-4 p-6 text-center">
              <div className="mx-auto text-5xl">🛑</div>
              <h3 className="font-display text-lg font-bold text-white">Twenty não respondeu em 8s</h3>
              <div className="space-y-2 text-left text-sm text-loog-muted">
                <p>Possíveis causas:</p>
                <ul className="ml-4 list-disc space-y-1 text-[13px]">
                  <li>DNS <code className="rounded bg-loog-panel px-1 text-white">crm.loogstudio.tech</code> ainda não foi criado no painel Hostinger</li>
                  <li>Twenty está reiniciando no container Docker</li>
                  <li>Caddy ainda não emitiu certificado SSL (leva 1-2min)</li>
                </ul>
                <p className="pt-2">
                  Workaround: abrir em nova aba <strong className="text-white">(funciona sem DNS, apenas pelo IP interno via SSH tunnel)</strong>:
                </p>
                <pre className="overflow-x-auto rounded-lg border border-loog-border bg-loog-bg p-2 text-[11px] text-white/80">
{`ssh -L 3013:127.0.0.1:3013 \\
    root@2.25.189.22
# Abre: http://localhost:3013`}
                </pre>
              </div>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  onClick={reload}
                  className="rounded-lg bg-loog-brand px-4 py-2 text-sm font-semibold text-white shadow-glow hover:brightness-110"
                >
                  Tentar de novo
                </button>
                <a
                  href={TWENTY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-loog-border bg-loog-bg px-4 py-2 text-sm text-white/80 hover:border-loog-brand"
                >
                  Abrir nova aba
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
