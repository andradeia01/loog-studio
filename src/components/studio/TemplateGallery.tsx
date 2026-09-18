"use client";

import { FORMAT_LABEL, Template } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  templates: Template[];
  selectedSlug?: string;
  onSelect: (t: Template) => void;
}

export function TemplateGallery({ templates, selectedSlug, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {templates.map((t) => {
        const isActive = selectedSlug === t.slug;
        const aspect =
          t.format === "story-9x16"
            ? "aspect-[9/16]"
            : t.format === "feed-4x5"
            ? "aspect-[4/5]"
            : "aspect-square";
        return (
          <button
            key={t.slug}
            onClick={() => onSelect(t)}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-xl border bg-loog-panel text-left transition",
              "hover:border-loog-brand/50",
              isActive ? "border-loog-brand shadow-glow" : "border-loog-border",
            )}
          >
            <div className={cn("relative w-full overflow-hidden bg-black", aspect)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.thumbnail}
                alt={t.name}
                loading="lazy"
                className="h-full w-full object-cover transition group-hover:scale-[1.02]"
              />
              <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90 backdrop-blur">
                {FORMAT_LABEL[t.format]}
              </span>
            </div>
            <div className="px-3 py-2">
              <div className="truncate text-sm font-semibold">{t.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-loog-muted">
                {t.category}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
