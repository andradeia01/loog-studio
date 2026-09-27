"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TemplateField {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}
interface Template {
  key: string;
  label: string;
  description: string;
  icon?: string;
  fields: TemplateField[];
}

/** Ícones fallback caso o backend não devolva */
const FALLBACK_ICON: Record<string, string> = {
  "post-vendas": "🎯",
  "story-sequencial": "📱",
  "legenda-arte": "📝",
  "roteiro-reels": "🎬",
  "resposta-dm": "💬",
  "ideias-semana": "📅",
};

export function CopyStudio() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/ai/text")
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.templates ?? []);
        if (d.templates?.[0]) setSelectedKey(d.templates[0].key);
      })
      .catch(() => setError("Não consegui carregar os geradores. Recarrega a página."));
  }, []);

  const selected = templates.find((t) => t.key === selectedKey);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/ai/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: selectedKey, fields: values }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult(body.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(stripMarkdown(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }
  async function shareText() {
    if (!result || typeof navigator === "undefined" || !navigator.share) return;
    try { await navigator.share({ text: stripMarkdown(result) }); } catch {}
  }

  return (
    <div className="space-y-4">
      {/* Grid de geradores (mobile-first: cards grandes tap-friendly) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {templates.map((t) => {
          const icon = t.icon ?? FALLBACK_ICON[t.key] ?? "✨";
          const active = selectedKey === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => { setSelectedKey(t.key); setValues({}); setResult(null); setError(null); }}
              className={cn(
                "flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center transition",
                active
                  ? "border-loog-brand2 bg-loog-brand/20 text-white shadow-glow"
                  : "border-loog-border bg-loog-panel text-loog-text hover:border-loog-brand2/50",
              )}
            >
              <span className="text-xl">{icon}</span>
              <span className="text-[11px] font-semibold leading-tight sm:text-xs">{t.label}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <>
          <form onSubmit={submit} className="card space-y-4 p-4 sm:p-5">
            <div>
              <h2 className="font-display text-lg font-bold">
                <span className="mr-2">{selected.icon ?? FALLBACK_ICON[selected.key] ?? "✨"}</span>
                {selected.label}
              </h2>
              <p className="mt-0.5 text-xs text-loog-muted">{selected.description}</p>
            </div>
            {selected.fields.map((f) => (
              <div key={f.name}>
                <label className="label mb-1.5">
                  {f.label}
                  {!f.required && <span className="ml-2 text-[10px] normal-case text-loog-muted">(opcional)</span>}
                </label>
                <textarea
                  className="input min-h-[70px] resize-y"
                  required={f.required}
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                />
              </div>
            ))}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Gerando…" : "✨ Gerar com ChatGPT"}
            </button>
            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}
          </form>

          {result && (
            <div className="card space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Resultado</h3>
                <div className="flex gap-2">
                  <button type="button" onClick={copyToClipboard} className="rounded-lg border border-loog-border px-3 py-2 text-xs hover:border-white/40">
                    {copied ? "✓ Copiado" : "📋 Copiar"}
                  </button>
                  {typeof navigator !== "undefined" && "share" in navigator && (
                    <button type="button" onClick={shareText} className="rounded-lg border border-loog-border px-3 py-2 text-xs hover:border-white/40">
                      📤 Enviar
                    </button>
                  )}
                </div>
              </div>
              <div className="whitespace-pre-wrap rounded-lg border border-loog-border bg-loog-panel/40 p-4 text-sm leading-relaxed">
                {result}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^\*\*(.+?)\*\*/gm, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#+\s/gm, "");
}
