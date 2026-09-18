"use client";

import { useState } from "react";
import { cn, slugify, timestamp } from "@/lib/utils";
import { FORMAT_LABEL, TemplateFormat } from "@/lib/types";

export interface ReadyArt {
  id: string;
  title: string;
  category: string;
  format: string;
  image_url: string;
  thumbnail_url: string | null;
}

export function ReadyArtsGallery({ arts }: { arts: ReadyArt[] }) {
  const [downloading, setDownloading] = useState<string | null>(null);

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
