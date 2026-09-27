"use client";

import { useEffect, useState } from "react";
import { cn, slugify, timestamp } from "@/lib/utils";

interface Preset {
  key: string;
  label: string;
  description: string;
  prompt: string;
}

export function ImagesStudio() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetKey, setPresetKey] = useState<string>("");
  const [promptExtra, setPromptExtra] = useState("");
  const [size, setSize] = useState<"1024x1024" | "1024x1792" | "1792x1024">("1024x1024");
  const [quality, setQuality] = useState<"standard" | "hd">("standard");
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
      .catch(() => setError("Falha ao carregar presets."));
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
        body: JSON.stringify({ preset: presetKey, prompt_extra: promptExtra.trim() || undefined, size, quality }),
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
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="card p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Presets LOOG</h3>
        <ul className="space-y-1">
          {presets.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => { setPresetKey(p.key); setResult(null); setError(null); }}
                className={cn(
                  "flex w-full flex-col rounded-lg px-3 py-2 text-left transition",
                  presetKey === p.key ? "bg-loog-brand text-white" : "hover:bg-white/5",
                )}
              >
                <span className="text-sm font-semibold">{p.label}</span>
                <span className={cn("text-[11px]", presetKey === p.key ? "text-white/80" : "text-loog-muted")}>{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="space-y-4">
        <form onSubmit={submit} className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">
            {preset ? preset.label : "Gerar imagem"}
          </h2>
          {preset && (
            <div className="rounded-lg border border-loog-border bg-loog-panel/40 p-3 text-[11px] text-loog-muted">
              <b>Prompt base:</b> {preset.prompt}
            </div>
          )}
          <div>
            <label className="label mb-1.5">Detalhes extras (opcional)</label>
            <textarea
              className="input min-h-[80px] resize-y"
              placeholder="Ex.: cliente segurando as chaves; carro branco; incluir texto 'Bem-vindo à família LOOG'"
              maxLength={500}
              value={promptExtra}
              onChange={(e) => setPromptExtra(e.target.value)}
            />
            <p className="mt-1 text-[10px] text-loog-muted">
              {promptExtra.length}/500 caracteres — quanto mais específico, melhor.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1.5">Formato</label>
              <select className="input" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
                <option value="1024x1024">Quadrado 1:1 (Feed)</option>
                <option value="1024x1792">Vertical 9:16 (Story/Reel)</option>
                <option value="1792x1024">Horizontal 16:9</option>
              </select>
            </div>
            <div>
              <label className="label mb-1.5">Qualidade</label>
              <select className="input" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
                <option value="standard">Padrão (mais barato)</option>
                <option value="hd">HD (mais nítido)</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full !py-2" disabled={loading}>
            {loading ? "Gerando imagem (10-30s)…" : "🎨 Gerar imagem"}
          </button>
          {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </form>

        {result && (
          <div className="card space-y-3 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Resultado</h3>
            <div className="rounded-xl border border-loog-border bg-black p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.url ?? `data:image/png;base64,${result.b64 ?? ""}`}
                alt="IA"
                className="mx-auto max-h-[600px] w-full max-w-full object-contain"
              />
            </div>
            <button type="button" className="btn-primary w-full !py-2 !text-xs" onClick={download}>
              📥 Baixar / Compartilhar
            </button>
            {result.revised && (
              <details className="text-[11px] text-loog-muted">
                <summary className="cursor-pointer">Prompt revisado pela IA</summary>
                <div className="mt-2 rounded border border-loog-border/40 p-2">{result.revised}</div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
