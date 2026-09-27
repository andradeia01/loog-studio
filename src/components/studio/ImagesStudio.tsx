"use client";

import { useEffect, useState } from "react";
import { cn, slugify, timestamp } from "@/lib/utils";

interface Preset {
  key: string;
  label: string;
  description: string;
  icon?: string;
  prompt: string;
}

const FALLBACK_ICON: Record<string, string> = {
  "cena-carro-noturno": "🌃",
  "cliente-feliz": "😊",
  "recrutamento": "💼",
  "assistencia-24h": "🛟",
  "datas-comemorativas": "🎉",
  "sinistro-atendido": "🔧",
};

type Target = "feed" | "story-reel" | "landscape";

export function ImagesStudio() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetKey, setPresetKey] = useState<string>("");
  const [promptExtra, setPromptExtra] = useState("");
  const [target, setTarget] = useState<Target>("feed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string | null; b64?: string; revised?: string } | null>(null);

  useEffect(() => {
    fetch("/api/ai/image")
      .then((r) => r.json())
      .then((d) => {
        setPresets(d.presets ?? []);
        if (d.presets?.[0]) setPresetKey(d.presets[0].key);
      })
      .catch(() => setError("Não consegui carregar os estilos. Recarrega a página."));
  }, []);

  const preset = presets.find((p) => p.key === presetKey);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: presetKey, prompt_extra: promptExtra.trim() || undefined, target }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult({ url: body.url ?? null, b64: body.b64, revised: body.revised_prompt });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  }

  async function download() {
    if (!result) return;
    const src = result.url ?? (result.b64 ? `data:image/png;base64,${result.b64}` : null);
    if (!src) return;
    try {
      const r = await fetch(src);
      const blob = await r.blob();
      const filename = `LOOG-IA-${slugify(presetKey || "custom")}-${timestamp()}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try { await nav.share({ files: [file], title: filename }); return; } catch {}
      }
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-4">
      {/* Presets em grid mobile-first */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {presets.map((p) => {
          const icon = p.icon ?? FALLBACK_ICON[p.key] ?? "🎨";
          const active = presetKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => { setPresetKey(p.key); setResult(null); setError(null); }}
              className={cn(
                "flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center transition",
                active
                  ? "border-loog-brand2 bg-loog-brand/20 text-white shadow-glow"
                  : "border-loog-border bg-loog-panel text-loog-text hover:border-loog-brand2/50",
              )}
            >
              <span className="text-xl">{icon}</span>
              <span className="text-[11px] font-semibold leading-tight sm:text-xs">{p.label}</span>
            </button>
          );
        })}
      </div>

      {preset && (
        <form onSubmit={submit} className="card space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="font-display text-lg font-bold">
              <span className="mr-2">{preset.icon ?? FALLBACK_ICON[preset.key] ?? "🎨"}</span>
              {preset.label}
            </h2>
            <p className="mt-0.5 text-xs text-loog-muted">{preset.description}</p>
          </div>

          <div>
            <label className="label mb-1.5">Onde vai postar?</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { k: "feed" as Target, label: "Feed (1:1)", hint: "quadrado" },
                  { k: "story-reel" as Target, label: "Story / Reel", hint: "9:16" },
                  { k: "landscape" as Target, label: "Horizontal", hint: "16:9" },
                ]
              ).map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setTarget(t.k)}
                  className={cn(
                    "flex flex-col items-center rounded-lg border px-2 py-2.5 text-xs transition",
                    target === t.k
                      ? "border-loog-brand2 bg-loog-brand/20 font-semibold text-white"
                      : "border-loog-border text-loog-muted hover:text-white",
                  )}
                >
                  <span>{t.label}</span>
                  <span className="text-[10px] opacity-60">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label mb-1.5">
              Detalhes específicos (opcional)
            </label>
            <textarea
              className="input min-h-[70px] resize-y"
              placeholder="Ex.: pessoa segurando as chaves; carro branco; incluir espaço pra headline curta"
              maxLength={500}
              value={promptExtra}
              onChange={(e) => setPromptExtra(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Gerando imagem (15-30s)…" : "🎨 Gerar imagem"}
          </button>
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </form>
      )}

      {result && (
        <div className="card space-y-3 p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Resultado</h3>
          <div className="rounded-xl border border-loog-border bg-black p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.url ?? `data:image/png;base64,${result.b64 ?? ""}`}
              alt="IA"
              className="mx-auto max-h-[600px] w-full max-w-full object-contain"
            />
          </div>
          <button type="button" className="btn-primary w-full" onClick={download}>
            📥 Baixar / Compartilhar
          </button>
        </div>
      )}
    </div>
  );
}
