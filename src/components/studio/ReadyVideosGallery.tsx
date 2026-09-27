"use client";

import { useMemo, useState } from "react";
import { cn, slugify, timestamp } from "@/lib/utils";

export interface ReadyVideo {
  id: string;
  title: string;
  category: string;
  format: "reel-9x16" | "square-1x1" | "landscape-16x9";
  video_url: string;
  thumbnail_url: string | null;
  folder_id?: string | null;
  duration_sec?: number | null;
}

export interface VideoFolder {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  count: number;
}

export function ReadyVideosGallery({
  videos,
  folders = [],
}: {
  videos: ReadyVideo[];
  folders?: VideoFolder[];
}) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null | "orphan">(null);

  const orphan = useMemo(() => videos.filter((v) => !v.folder_id), [videos]);
  const inFolder = useMemo(() => {
    if (currentFolder === null) return [];
    if (currentFolder === "orphan") return orphan;
    return videos.filter((v) => v.folder_id === currentFolder);
  }, [videos, currentFolder, orphan]);
  const currentFolderMeta = currentFolder && currentFolder !== "orphan" ? folders.find((f) => f.id === currentFolder) : null;

  async function onDownload(v: ReadyVideo) {
    setDownloading(v.id);
    try {
      const res = await fetch(v.video_url, { cache: "no-store" });
      const blob = await res.blob();
      const filename = `LOOG-${slugify(v.title)}-${timestamp()}.mp4`;
      const file = new File([blob], filename, { type: blob.type || "video/mp4" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try { await nav.share({ files: [file], title: v.title }); return; } catch {}
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error(err); alert("Não foi possível baixar esse vídeo.");
    } finally { setDownloading(null); }
  }

  if (folders.length === 0) {
    return <VideosGrid videos={videos} downloading={downloading} onDownload={onDownload} />;
  }

  if (currentFolder !== null) {
    const title = currentFolder === "orphan" ? "Sem pasta" : currentFolderMeta?.name ?? "Pasta";
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setCurrentFolder(null)}
            className="rounded-lg border border-loog-border px-3 py-2 text-xs text-loog-muted hover:border-white/40 hover:text-white">
            ← Voltar
          </button>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{title}</h3>
            {currentFolderMeta?.description && <p className="text-xs text-loog-muted">{currentFolderMeta.description}</p>}
          </div>
          <span className="text-xs text-loog-muted">{inFolder.length} vídeos</span>
        </div>
        {inFolder.length === 0 ? (
          <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">Sem vídeos nessa pasta.</div>
        ) : <VideosGrid videos={inFolder} downloading={downloading} onDownload={onDownload} />}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {folders.map((f) => (
        <button key={f.id} type="button" onClick={() => setCurrentFolder(f.id)}
          className="group flex flex-col overflow-hidden rounded-xl border border-loog-border bg-loog-panel text-left transition hover:border-loog-brand/60">
          <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
            {f.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.cover_url} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-loog-brand/30 to-black text-6xl opacity-70 transition group-hover:scale-105">📁</div>
            )}
            <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">{f.count} vídeos</span>
          </div>
          <div className="flex flex-col gap-1 p-3">
            <div className="truncate text-sm font-semibold" title={f.name}>{f.name}</div>
            {f.description && <div className="line-clamp-2 text-xs text-loog-muted">{f.description}</div>}
          </div>
        </button>
      ))}

      {orphan.length > 0 && (
        <button type="button" onClick={() => setCurrentFolder("orphan")}
          className="group flex flex-col overflow-hidden rounded-xl border border-dashed border-loog-border bg-loog-panel text-left transition hover:border-loog-brand/60">
          <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
            <div className="flex h-full items-center justify-center text-4xl opacity-60">🎬</div>
            <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold">{orphan.length} vídeos</span>
          </div>
          <div className="flex flex-col gap-1 p-3">
            <div className="truncate text-sm font-semibold">Sem pasta</div>
            <div className="text-xs text-loog-muted">Vídeos não organizados</div>
          </div>
        </button>
      )}
    </div>
  );
}

function VideosGrid({ videos, downloading, onDownload }: {
  videos: ReadyVideo[]; downloading: string | null; onDownload: (v: ReadyVideo) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v) => {
        const aspect = v.format === "reel-9x16" ? "aspect-[9/16]" : v.format === "square-1x1" ? "aspect-square" : "aspect-video";
        const busy = downloading === v.id;
        return (
          <div key={v.id} className={cn("group flex flex-col overflow-hidden rounded-xl border border-loog-border bg-loog-panel", "hover:border-loog-brand/50")}>
            <div className={cn("relative w-full overflow-hidden bg-black", aspect)}>
              <video src={v.video_url} controls preload="metadata"
                poster={v.thumbnail_url ?? undefined}
                className="h-full w-full object-contain" />
            </div>
            <div className="flex flex-col gap-2 p-3">
              <div className="truncate text-sm font-semibold" title={v.title}>{v.title}</div>
              {v.duration_sec ? <span className="text-[10px] text-loog-muted">{formatDur(v.duration_sec)}</span> : null}
              <button type="button" className="btn-primary !py-2 !text-xs" onClick={() => onDownload(v)} disabled={busy}>
                {busy ? "Baixando…" : "Baixar / compartilhar"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
