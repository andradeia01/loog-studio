"use client";

import { useMemo, useState } from "react";
import JSZip from "jszip";
import { cn, slugify, timestamp } from "@/lib/utils";
import { FORMAT_LABEL, TemplateFormat } from "@/lib/types";

export interface ReadyArt {
  id: string;
  title: string;
  category: string;
  format: string;
  image_url: string;
  thumbnail_url: string | null;
  folder_id?: string | null;
}

export interface ReadyFolder {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  count: number;
}

export function ReadyArtsGallery({
  arts,
  folders = [],
}: {
  arts: ReadyArt[];
  folders?: ReadyFolder[];
}) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null | "orphan">(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const orphanArts = useMemo(() => arts.filter((a) => !a.folder_id), [arts]);
  const artsInFolder = useMemo(() => {
    if (currentFolder === null) return [];
    if (currentFolder === "orphan") return orphanArts;
    return arts.filter((a) => a.folder_id === currentFolder);
  }, [arts, currentFolder, orphanArts]);

  const currentFolderMeta =
    currentFolder && currentFolder !== "orphan" ? folders.find((f) => f.id === currentFolder) : null;
  const allSelected = artsInFolder.length > 0 && artsInFolder.every((a) => selected.has(a.id));
  const someSelected = selected.size > 0;

  function toggleOne(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(artsInFolder.map((a) => a.id)));
  }
  function clearSelection() {
    setSelected(new Set());
  }
  function enterFolder(folder: string | "orphan") {
    setCurrentFolder(folder);
    setSelected(new Set());
  }
  function exitFolder() {
    setCurrentFolder(null);
    setSelected(new Set());
  }

  async function onDownload(a: ReadyArt) {
    setDownloading(a.id);
    try {
      const res = await fetch(a.image_url, { cache: "no-store" });
      const blob = await res.blob();
      const filename = `LOOG-${slugify(a.title)}-${timestamp()}.png`;
      const file = new File([blob], filename, { type: blob.type || "image/png" });
      const nav =
        typeof navigator !== "undefined"
          ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> })
          : null;
      if (nav?.canShare?.({ files: [file] }) && nav?.share) {
        try {
          await nav.share({ files: [file], title: a.title });
          return;
        } catch {
          // fallback download
        }
      }
      triggerBrowserDownload(blob, filename);
    } catch (err) {
      console.error(err);
      alert("Não foi possível baixar essa arte.");
    } finally {
      setDownloading(null);
    }
  }

  async function onBulkDownload() {
    const chosen = artsInFolder.filter((a) => selected.has(a.id));
    if (chosen.length === 0) return;

    // 1 arte só → download direto sem zip
    if (chosen.length === 1) {
      await onDownload(chosen[0]!);
      clearSelection();
      return;
    }

    setBulkBusy(true);
    setBulkProgress({ done: 0, total: chosen.length });
    try {
      const zip = new JSZip();
      let done = 0;
      // baixa em paralelo com limite pra não estourar mobile
      const CONCURRENCY = 4;
      const chunks: ReadyArt[][] = [];
      for (let i = 0; i < chosen.length; i += CONCURRENCY) chunks.push(chosen.slice(i, i + CONCURRENCY));
      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (a) => {
            try {
              const r = await fetch(a.image_url, { cache: "no-store" });
              const blob = await r.blob();
              const ab = await blob.arrayBuffer();
              zip.file(`LOOG-${slugify(a.title)}.png`, ab);
            } catch (err) {
              console.warn("falha:", a.title, err);
            }
            done += 1;
            setBulkProgress({ done, total: chosen.length });
          }),
        );
      }
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const folderLabel =
        currentFolder === "orphan" ? "sem-pasta" : currentFolderMeta?.name ?? "artes";
      const zipName = `LOOG-${slugify(folderLabel)}-${chosen.length}artes-${timestamp()}.zip`;

      // tentar Web Share (mobile)
      const zipFile = new File([zipBlob], zipName, { type: "application/zip" });
      const nav =
        typeof navigator !== "undefined"
          ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> })
          : null;
      if (nav?.canShare?.({ files: [zipFile] }) && nav?.share) {
        try {
          await nav.share({ files: [zipFile], title: zipName });
          clearSelection();
          return;
        } catch {
          // fallback pro download
        }
      }
      triggerBrowserDownload(zipBlob, zipName);
      clearSelection();
    } catch (err) {
      console.error(err);
      alert("Falha ao gerar o ZIP.");
    } finally {
      setBulkBusy(false);
      setBulkProgress(null);
    }
  }

  // ─── Fallback: sem pastas, comportamento antigo ─────────────────────────
  if (folders.length === 0) {
    return <ArtsGrid arts={arts} downloading={downloading} onDownload={onDownload} />;
  }

  // ─── Dentro de uma pasta ────────────────────────────────────────────────
  if (currentFolder !== null) {
    const title = currentFolder === "orphan" ? "Sem pasta" : currentFolderMeta?.name ?? "Pasta";
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exitFolder}
            className="rounded-lg border border-loog-border px-3 py-2 text-xs text-loog-muted hover:border-white/40 hover:text-white"
          >
            ← Voltar
          </button>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{title}</h3>
            {currentFolderMeta?.description && (
              <p className="text-xs text-loog-muted">{currentFolderMeta.description}</p>
            )}
          </div>
          <span className="text-xs text-loog-muted">{artsInFolder.length} artes</span>
        </div>

        {/* Barra de seleção múltipla */}
        {artsInFolder.length > 0 && (
          <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-loog-border bg-loog-panel/90 px-3 py-2 backdrop-blur">
            <button
              type="button"
              onClick={allSelected ? clearSelection : selectAll}
              className="rounded-lg border border-loog-border px-3 py-1.5 text-xs hover:border-white/40"
            >
              {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
            </button>
            <span className="text-xs text-loog-muted">
              {selected.size > 0 ? `${selected.size} de ${artsInFolder.length} selecionadas` : "Toque em uma arte pra selecionar"}
            </span>
            <div className="ml-auto flex gap-2">
              {someSelected && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg border border-loog-border px-3 py-1.5 text-xs hover:border-white/40"
                  disabled={bulkBusy}
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={onBulkDownload}
                disabled={!someSelected || bulkBusy}
                className="btn-primary !py-1.5 !text-xs disabled:opacity-50"
              >
                {bulkBusy
                  ? bulkProgress
                    ? `Baixando… ${bulkProgress.done}/${bulkProgress.total}`
                    : "Preparando…"
                  : selected.size > 1
                    ? `Baixar ${selected.size} (ZIP)`
                    : "Baixar selecionada"}
              </button>
            </div>
          </div>
        )}

        {artsInFolder.length === 0 ? (
          <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
            Essa pasta ainda não tem artes.
          </div>
        ) : (
          <ArtsGrid
            arts={artsInFolder}
            downloading={downloading}
            onDownload={onDownload}
            selectable
            selected={selected}
            onToggle={toggleOne}
          />
        )}
      </div>
    );
  }

  // ─── Estado inicial: grid de pastas ─────────────────────────────────────
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {folders.map((f) => (
        <button
          type="button"
          key={f.id}
          onClick={() => enterFolder(f.id)}
          className="group flex flex-col overflow-hidden rounded-xl border border-loog-border bg-loog-panel text-left transition hover:border-loog-brand/60 hover:shadow-lg hover:shadow-loog-brand/10"
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
            {f.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.cover_url} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-loog-brand/30 to-black text-6xl opacity-70 transition group-hover:scale-105">
                📁
              </div>
            )}
            <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">
              {f.count} artes
            </span>
          </div>
          <div className="flex flex-col gap-1 p-3">
            <div className="truncate text-sm font-semibold" title={f.name}>{f.name}</div>
            {f.description && <div className="line-clamp-2 text-xs text-loog-muted">{f.description}</div>}
          </div>
        </button>
      ))}

      {orphanArts.length > 0 && (
        <button
          type="button"
          onClick={() => enterFolder("orphan")}
          className="group flex flex-col overflow-hidden rounded-xl border border-dashed border-loog-border bg-loog-panel text-left transition hover:border-loog-brand/60"
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
            <div className="flex h-full items-center justify-center text-4xl opacity-60">📄</div>
            <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">
              {orphanArts.length} artes
            </span>
          </div>
          <div className="flex flex-col gap-1 p-3">
            <div className="truncate text-sm font-semibold">Sem pasta</div>
            <div className="text-xs text-loog-muted">Artes não organizadas</div>
          </div>
        </button>
      )}
    </div>
  );
}

// ─── Helper de download simples ──────────────────────────────────────────
function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ─── Grid de artes (com opção selecionável) ──────────────────────────────
function ArtsGrid({
  arts,
  downloading,
  onDownload,
  selectable = false,
  selected,
  onToggle,
}: {
  arts: ReadyArt[];
  downloading: string | null;
  onDownload: (a: ReadyArt) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {arts.map((a) => {
        const aspect =
          a.format === "story-9x16"
            ? "aspect-[9/16]"
            : a.format === "feed-4x5"
              ? "aspect-[4/5]"
              : "aspect-square";
        const busy = downloading === a.id;
        const isSelected = selectable && selected?.has(a.id);
        return (
          <div
            key={a.id}
            className={cn(
              "group flex flex-col overflow-hidden rounded-xl border bg-loog-panel transition",
              isSelected ? "border-loog-brand2 ring-2 ring-loog-brand2" : "border-loog-border hover:border-loog-brand/50",
            )}
          >
            <div
              className={cn("relative w-full overflow-hidden bg-black", aspect, selectable && "cursor-pointer")}
              onClick={selectable ? () => onToggle?.(a.id) : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.thumbnail_url ?? a.image_url} alt={a.title} loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">
                {FORMAT_LABEL[a.format as TemplateFormat] ?? a.format}
              </span>
              {selectable && (
                <span
                  className={cn(
                    "absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition",
                    isSelected
                      ? "border-loog-brand2 bg-loog-brand2 text-white"
                      : "border-white/60 bg-black/60 text-transparent group-hover:text-white/40",
                  )}
                >
                  ✓
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 p-3">
              <div className="truncate text-sm font-semibold" title={a.title}>{a.title}</div>
              <button
                type="button"
                className="btn-primary !py-2 !text-xs"
                onClick={() => onDownload(a)}
                disabled={busy}
              >
                {busy ? "Baixando…" : "Baixar / compartilhar"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
