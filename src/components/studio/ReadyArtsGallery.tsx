"use client";

import { useMemo, useState } from "react";
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
  // null = tela inicial (pastas), "orphan" = artes sem pasta, string = pasta específica

  const orphanArts = useMemo(() => arts.filter((a) => !a.folder_id), [arts]);
  const artsInFolder = useMemo(() => {
    if (currentFolder === null) return [];
    if (currentFolder === "orphan") return orphanArts;
    return arts.filter((a) => a.folder_id === currentFolder);
  }, [arts, currentFolder, orphanArts]);

  const currentFolderMeta =
    currentFolder && currentFolder !== "orphan" ? folders.find((f) => f.id === currentFolder) : null;

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
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error(err);
      alert("Não foi possível baixar essa arte.");
    } finally {
      setDownloading(null);
    }
  }

  // ─── Se não há pastas, mostra tudo direto (fallback comportamento antigo) ─
  if (folders.length === 0) {
    return <ArtsGrid arts={arts} downloading={downloading} onDownload={onDownload} />;
  }

  // ─── Estado: dentro de uma pasta ─────────────────────────────────────────
  if (currentFolder !== null) {
    const title = currentFolder === "orphan" ? "Sem pasta" : currentFolderMeta?.name ?? "Pasta";
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentFolder(null)}
            className="rounded-lg border border-loog-border px-3 py-2 text-xs text-loog-muted hover:border-white/40 hover:text-white"
          >
            ← Voltar
          </button>
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {currentFolderMeta?.description && (
              <p className="text-xs text-loog-muted">{currentFolderMeta.description}</p>
            )}
          </div>
          <span className="ml-auto text-xs text-loog-muted">{artsInFolder.length} artes</span>
        </div>
        {artsInFolder.length === 0 ? (
          <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
            Essa pasta ainda não tem artes.
          </div>
        ) : (
          <ArtsGrid arts={artsInFolder} downloading={downloading} onDownload={onDownload} />
        )}
      </div>
    );
  }

  // ─── Estado inicial: grid de pastas + card "Sem pasta" (se houver) ───────
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {folders.map((f) => (
        <button
          key={f.id}
          onClick={() => setCurrentFolder(f.id)}
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
          onClick={() => setCurrentFolder("orphan")}
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

function ArtsGrid({
  arts,
  downloading,
  onDownload,
}: {
  arts: ReadyArt[];
  downloading: string | null;
  onDownload: (a: ReadyArt) => void;
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
        return (
          <div key={a.id} className={cn("group flex flex-col overflow-hidden rounded-xl border border-loog-border bg-loog-panel", "hover:border-loog-brand/50")}>
            <div className={cn("relative w-full overflow-hidden bg-black", aspect)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.thumbnail_url ?? a.image_url} alt={a.title} loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">
                {FORMAT_LABEL[a.format as TemplateFormat] ?? a.format}
              </span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              <div className="truncate text-sm font-semibold" title={a.title}>{a.title}</div>
              <button className="btn-primary !py-2 !text-xs" onClick={() => onDownload(a)} disabled={busy}>
                {busy ? "Baixando…" : "Baixar / compartilhar"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
