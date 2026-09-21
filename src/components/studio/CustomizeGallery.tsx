"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Consultant, Template, TemplateCategory } from "@/lib/types";
import { slugify, timestamp, cn } from "@/lib/utils";
import { TemplatePreview } from "./TemplatePreview";

interface Props {
  templates: Template[];
  consultant: Consultant;
  dataOk: boolean;
  category: TemplateCategory | "todos";
}

const FORMAT_SHORT: Record<Template["format"], string> = {
  "feed-1x1": "1:1",
  "feed-4x5": "4:5",
  "story-9x16": "9:16",
};

export function CustomizeGallery({ templates, consultant, dataOk, category }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [oneBusy, setOneBusy] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (category === "todos") return templates;
    return templates.filter((t) => t.category === category);
  }, [templates, category]);

  const allSelected = visible.length > 0 && visible.every((t) => selected.has(t.slug));
  const someSelected = selected.size > 0;

  function toggle(slug: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug); else n.add(slug);
      return n;
    });
  }
  const selectAll = () => setSelected(new Set(visible.map((t) => t.slug)));
  const clearSelection = () => setSelected(new Set());

  async function downloadOne(t: Template) {
    if (!dataOk) return alert("Preencha nome e telefone antes de gerar.");
    setOneBusy(t.slug);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlug: t.slug, consultant }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `LOOG-${slugify(consultant.name)}-${slugify(t.slug)}.png`;
      await deliverBlob(blob, filename);
    } catch (err) {
      console.error(err);
      alert("Não foi possível gerar essa arte.");
    } finally {
      setOneBusy(null);
    }
  }

  async function downloadBatch() {
    if (!dataOk) return alert("Preencha nome e telefone antes de gerar.");
    const slugs = Array.from(selected);
    if (slugs.length === 0) return;
    if (slugs.length === 1) {
      const t = templates.find((x) => x.slug === slugs[0]);
      if (t) await downloadOne(t);
      return;
    }
    setBatchBusy(true);
    setProgress(`Preparando ${slugs.length} artes…`);
    try {
      const res = await fetch("/api/generate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlugs: slugs, consultant }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `LOOG-${slugify(consultant.name)}-${slugs.length}artes-${timestamp()}.zip`;
      await deliverBlob(blob, filename);
      clearSelection();
    } catch (err) {
      console.error(err);
      alert("Falha ao gerar o pacote.");
    } finally {
      setBatchBusy(false);
      setProgress(null);
    }
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
        Nenhuma arte personalizável disponível nessa categoria.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra sticky de seleção */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-loog-border bg-loog-panel/95 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={allSelected ? clearSelection : selectAll}
          className="rounded-lg border border-loog-border px-3 py-1.5 text-xs hover:border-white/40"
        >
          {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
        </button>
        <span className="text-xs text-loog-muted">
          {someSelected ? `${selected.size} de ${visible.length}` : "Toque nas artes que quer baixar"}
        </span>
        <div className="ml-auto flex gap-2">
          {someSelected && (
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg border border-loog-border px-3 py-1.5 text-xs hover:border-white/40"
              disabled={batchBusy}
            >
              Limpar
            </button>
          )}
          <button
            type="button"
            onClick={downloadBatch}
            disabled={!someSelected || batchBusy || !dataOk}
            className="btn-primary !py-1.5 !text-xs disabled:opacity-50"
            title={!dataOk ? "Preencha nome e telefone" : ""}
          >
            {batchBusy
              ? progress ?? "Gerando…"
              : selected.size > 1
                ? `Gerar e baixar ${selected.size} (ZIP)`
                : selected.size === 1
                  ? "Gerar e baixar"
                  : "Baixar selecionadas"}
          </button>
        </div>
      </div>

      {!dataOk && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ⚠️ Preencha seu nome e telefone à esquerda pra liberar as gerações.
        </div>
      )}

      {/* Grid de cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => {
          const isSel = selected.has(t.slug);
          const busy = oneBusy === t.slug;
          return (
            <div
              key={t.slug}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-2xl border bg-loog-panel transition",
                isSel ? "border-loog-brand2 ring-2 ring-loog-brand2 shadow-lg shadow-loog-brand/20" : "border-loog-border hover:border-loog-brand/50",
              )}
            >
              <CardPreview
                template={t}
                consultant={consultant}
                onClick={() => toggle(t.slug)}
                selected={isSel}
              />
              {/* format badge */}
              <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">
                {FORMAT_SHORT[t.format]}
              </span>
              {/* Info + botões */}
              <div className="flex flex-col gap-2 border-t border-loog-border/60 p-3">
                <div className="truncate text-sm font-semibold" title={t.name}>{t.name}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary flex-1 !py-2 !text-xs"
                    onClick={() => downloadOne(t)}
                    disabled={busy || batchBusy || !dataOk}
                  >
                    {busy ? "Gerando…" : "Baixar"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-loog-border px-3 py-2 text-xs hover:border-white/40"
                    onClick={() => setExpanded(t.slug)}
                    title="Ver em tela cheia"
                  >
                    Ver
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal preview grande */}
      {expanded && (() => {
        const t = templates.find((x) => x.slug === expanded);
        if (!t) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
            onClick={() => setExpanded(null)}
          >
            <div
              className="relative flex max-h-[92vh] flex-col items-center gap-4 overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <TemplatePreview template={t} consultant={consultant} maxWidth={520} />
              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-primary !text-xs"
                  onClick={() => { setExpanded(null); void downloadOne(t); }}
                  disabled={!dataOk}
                >
                  Baixar essa
                </button>
                <button type="button" className="btn-ghost !text-xs" onClick={() => setExpanded(null)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Wrapper responsivo do preview: mede a largura real do card via ResizeObserver
 * e passa `maxWidth` pro TemplatePreview. Garante que a arte inteira caiba no
 * card e faz overlay do checkbox.
 */
function CardPreview({
  template,
  consultant,
  onClick,
  selected,
}: {
  template: Template;
  consultant: Consultant;
  onClick: () => void;
  selected: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="relative w-full cursor-pointer overflow-hidden bg-black"
    >
      {/* wrapper que centraliza o preview dentro do card */}
      <div className="flex items-center justify-center">
        <TemplatePreview template={template} consultant={consultant} maxWidth={w} bare />
      </div>
      <span
        className={cn(
          "absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition",
          selected
            ? "border-loog-brand2 bg-loog-brand2 text-white"
            : "border-white/70 bg-black/70 text-transparent group-hover:text-white/60",
        )}
      >
        ✓
      </span>
    </div>
  );
}

async function deliverBlob(blob: Blob, filename: string) {
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> })
      : null;
  const type = blob.type || (filename.endsWith(".zip") ? "application/zip" : "image/png");
  const file = new File([blob], filename, { type });
  if (nav?.canShare?.({ files: [file] }) && nav?.share) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch {
      // fallback download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
