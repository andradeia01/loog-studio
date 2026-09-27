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
  fields: TemplateField[];
}

export function CopyStudio() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [model, setModel] = useState<"gpt-4o" | "gpt-4o-mini">("gpt-4o-mini");
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
      .catch(() => setError("Falha ao carregar geradores."));
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
        body: JSON.stringify({ template: selectedKey, fields: values, model }),
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
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Sidebar de geradores */}
      <aside className="card p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-loog-muted">
          Geradores prontos
        </h3>
        <ul className="space-y-1">
          {templates.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => { setSelectedKey(t.key); setValues({}); setResult(null); setError(null); }}
                className={cn(
                  "flex w-full flex-col rounded-lg px-3 py-2 text-left transition",
                  selectedKey === t.key ? "bg-loog-brand text-white" : "hover:bg-white/5",
                )}
              >
                <span className="text-sm font-semibold">{t.label}</span>
                <span className={cn("text-[11px]", selectedKey === t.key ? "text-white/80" : "text-loog-muted")}>
                  {t.description}
                </span>
              </button>
            </li>
          ))}
          {templates.length === 0 && (
            <li className="rounded-lg border border-dashed border-loog-border p-3 text-xs text-loog-muted">
              Nenhum gerador disponível. Verifique se a API key da OpenAI foi configurada em /admin/config.
            </li>
          )}
        </ul>
      </aside>

      {/* Área principal */}
      <div className="space-y-4">
        {selected ? (
          <>
            <form onSubmit={submit} className="card space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">{selected.label}</h2>
                <p className="mt-1 text-xs text-loog-muted/80">{selected.description}</p>
              </div>
              <div className="space-y-3">
                {selected.fields.map((f) => (
                  <div key={f.name}>
                    <label className="label mb-1.5">
                      {f.label}
                      {!f.required && <span className="ml-2 text-[10px] text-loog-muted">opcional</span>}
                    </label>
                    <textarea
                      className="input min-h-[80px] resize-y"
                      required={f.required}
                      placeholder={f.placeholder}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-loog-muted">
                  Modelo:
                  <select
                    className="input ml-2 !inline-block !w-auto !py-1 !text-xs"
                    value={model}
                    onChange={(e) => setModel(e.target.value as "gpt-4o" | "gpt-4o-mini")}
                  >
                    <option value="gpt-4o-mini">GPT-4o mini (rápido, barato)</option>
                    <option value="gpt-4o">GPT-4o (melhor qualidade)</option>
                  </select>
                </label>
                <button type="submit" className="btn-primary !py-2 !text-xs" disabled={loading}>
                  {loading ? "Gerando…" : "✨ Gerar com IA"}
                </button>
              </div>
              {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
            </form>

            {result && (
              <div className="card space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Resultado</h3>
                  <div className="flex gap-2">
                    <button type="button" onClick={copyToClipboard} className="rounded-lg border border-loog-border px-3 py-1.5 text-xs hover:border-white/40">
                      {copied ? "✓ Copiado" : "📋 Copiar"}
                    </button>
                    {typeof navigator !== "undefined" && "share" in navigator && (
                      <button type="button" onClick={shareText} className="rounded-lg border border-loog-border px-3 py-1.5 text-xs hover:border-white/40">
                        📤 Compartilhar
                      </button>
                    )}
                  </div>
                </div>
                <div className="prose-copy whitespace-pre-wrap rounded-lg border border-loog-border bg-loog-panel/40 p-4 text-sm leading-relaxed">
                  {result}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card p-8 text-center text-loog-muted">Escolha um gerador à esquerda.</div>
        )}
      </div>
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
