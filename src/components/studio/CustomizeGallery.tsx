"use client";

import { useMemo, useState } from "react";
import { Consultant, Template, TemplateCategory } from "@/lib/types";
import { slugify, timestamp, cn } from "@/lib/utils";
import { TemplatePreview } from "./TemplatePreview";

interface Props {
  templates: Template[];
  consultant: Consultant;
  dataOk: boolean;
  category: TemplateCategory | "todos";
}

/**
 * Grid de todos os templates personalizáveis mostrando preview em tempo real
 * com os dados do consultor. Suporta:
 *  - Baixar 1 arte direto (share em mobile, download em desktop)
 *  - Selecionar N artes e baixar em ZIP via /api/generate-batch
 */
export function CustomizeGallery({ templates, consultant, dataOk, category }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [oneBusy, setOneBusy] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null); // preview grande

  const visible = useMemo(() => {
    if (category === "todos") return templates;
    return templates.filter((t) => t.category === category);
  }, [templates, category]);

  const allSelected = visible.length > 0 && visible.every((t) => selected.has(t.slug));
  const someSelected = selected.size > 0;

  function toggle(slug: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(visible.map((t) => t.slug)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function downloadOne(t: Template) {
    if (!dataOk) return alertMissing();
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
    if (!dataOk) return alertMissing();
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

  function alertMissing() {
    alert("Preencha seu nome e telefone antes de gerar as artes.");
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
      {/* Barra de seleção sticky */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-loog-border bg-loog-panel/90 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={allSelected ? clearSelection : selectAll}
          className="rounded-lg border border-loog-border px-3 py-1.5 text-xs hover:border-white/40"
        >
          {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
        </button>
        <span className="text-xs text-loog-muted">
          {someSelected ? `${selected.size} de ${visible.length} selecionadas` : "Toque nas artes que quer baixar"}
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
                  : "Selecione artes"}
          </button>
        </div>
      </div>

      {!dataOk && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          ⚠️ Preencha seu nome e telefone à esquerda pra liberar as gerações.
        </div>
      )}

      {/* Grid de templates com preview aplicado */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((t) => {
          const isSel = selected.has(t.slug);
          const busy = oneBusy === t.slug;
          const aspect =
            t.format === "story-9x16" ? "aspect-[9/16]"
            : t.format === "feed-4x5" ? "aspect-[4/5]"
            : "aspect-square";
          return (
            <div
              key={t.slug}
              className={cn(
                "group flex flex-col overflow-hidden rounded-xl border bg-loog-panel transition",
                isSel ? "border-loog-brand2 ring-2 ring-loog-brand2" : "border-loog-border hover:border-loog-brand/50",
              )}
            >
              <div
                className={cn("relative w-full overflow-hidden bg-black", aspect, "cursor-pointer")}
                onClick={() => toggle(t.slug)}
              >
                <MiniPreview template={t} consultant={consultant} />
                <span
                  className={cn(
                    "absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition",
                    isSel
                      ? "border-loog-brand2 bg-loog-brand2 text-white"
                      : "border-white/70 bg-black/60 text-transparent group-hover:text-white/50",
                  )}
                >
                  ✓
                </span>
                <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">
                  {FORMAT_SHORT[t.format]}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-3">
                <div className="truncate text-sm font-semibold" title={t.name}>{t.name}</div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-primary flex-1 !py-1.5 !text-[11px]"
                    onClick={() => downloadOne(t)}
                    disabled={busy || batchBusy || !dataOk}
                  >
                    {busy ? "Gerando…" : "Baixar"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 !text-[11px]"
                    onClick={() => setExpanded(t.slug)}
                    title="Ver em tamanho maior"
                  >
                    👁
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de preview grande */}
      {expanded && (() => {
        const t = templates.find((x) => x.slug === expanded);
        if (!t) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setExpanded(null)}
          >
            <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <TemplatePreview template={t} consultant={consultant} />
              <div className="mt-3 flex justify-center gap-3">
                <button
                  type="button"
                  className="btn-primary !text-xs"
                  onClick={() => { setExpanded(null); void downloadOne(t); }}
                  disabled={!dataOk}
                >
                  Baixar essa
                </button>
                <button
                  type="button"
                  className="btn-ghost !text-xs"
                  onClick={() => setExpanded(null)}
                >
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

const FORMAT_SHORT: Record<Template["format"], string> = {
  "feed-1x1": "1:1",
  "feed-4x5": "4:5",
  "story-9x16": "9:16",
};

/** Preview miniatura: mesma composição do TemplatePreview mas em contêiner de tamanho fixo. */
function MiniPreview({ template, consultant }: { template: Template; consultant: Consultant }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="origin-top-left"
        style={{
          width: template.width,
          height: template.height,
          transform: `scale(${Math.min(1, 480 / template.width)})`,
          transformOrigin: "top left",
        }}
      >
        <TemplatePreview template={template} consultant={consultant} />
      </div>
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
