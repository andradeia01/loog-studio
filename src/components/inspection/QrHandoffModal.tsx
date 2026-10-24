"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Modal "Fazer no celular" — gera token + QR code pro consultor escanear
 * no celular e continuar a vistoria lá. Útil quando ele tá no desktop e
 * quer migrar pra câmera do próprio celular sem precisar logar de novo.
 *
 * Token válido 2h. Cria rascunho em branco no banco pra ele preencher.
 */
export function QrHandoffModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [link, setLink] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/inspection/handoff", { method: "POST" });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error ?? "falha ao gerar link");
        setLink(json.link);
        setExpiresAt(json.expiresAt);
        const qr = await QRCode.toDataURL(json.link, {
          width: 320,
          margin: 2,
          color: { dark: "#0A1030", light: "#FFFFFF" },
        });
        setQrDataUrl(qr);
        setState("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
        setState("error");
      }
    })();
  }, []);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-purple-500/40 bg-loog-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-loog-border/60 px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-white">📱 Vistoria no celular</h3>
            <p className="text-xs text-loog-muted">Escaneie o QR no celular pra continuar lá</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-loog-muted hover:bg-loog-bg hover:text-white"
            aria-label="Fechar"
          >✕</button>
        </div>

        <div className="space-y-4 px-5 py-6">
          {state === "loading" && (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-loog-brand border-t-transparent" />
              <p className="text-sm text-loog-muted">Gerando QR seguro…</p>
            </div>
          )}

          {state === "error" && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
              ⚠️ {error}
            </div>
          )}

          {state === "ready" && qrDataUrl && link && (
            <>
              <div className="rounded-xl bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR code vistoria" className="mx-auto h-auto w-full max-w-[280px]" />
              </div>

              <ol className="space-y-1 text-sm text-white/90">
                <li>1. Abra a câmera do celular</li>
                <li>2. Aponte pro QR acima</li>
                <li>3. Clique na notificação pra abrir no navegador</li>
                <li>4. Faça a vistoria direto no celular</li>
              </ol>

              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={link}
                  className="input w-full text-[11px]"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="shrink-0 rounded-lg bg-loog-brand px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
                >
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>

              <p className="text-center text-[11px] text-loog-muted">
                Link válido até {expiresAt ? new Date(expiresAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
