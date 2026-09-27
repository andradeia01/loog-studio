"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { probeVideo } from "@/lib/reels/detect";
import { checkSupport, renderPreview, renderReel } from "@/lib/reels/render";
import { DEFAULT_SETTINGS, MAX_FILES, type Background, type CropBand, type RenderSettings } from "@/lib/reels/types";
import { cn, timestamp } from "@/lib/utils";
import { CropEditor } from "./CropEditor";

type Status = "probing" | "ready" | "queued" | "processing" | "done" | "error";

interface Item {
  id: string;
  file: File;
  status: Status;
  progress: number;
  width: number;
  height: number;
  duration: number;
  thumbnail: string;
  band: CropBand;
  autoBand: CropBand;
  output: Blob | null;
  error: string | null;
}

const CONCURRENCY = 2;

const BACKGROUNDS: { key: Background; label: string }[] = [
  { key: "blur", label: "Desfocado" },
  { key: "black", label: "Preto" },
  { key: "white", label: "Branco" },
  { key: "color", label: "Cor" },
];

function outputName(file: File) {
  return `${file.name.replace(/\.[^.]+$/, "")}-reels.mp4`;
}

function formatDuration(s: number) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ReelsFactory() {
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [support, setSupport] = useState<string | null | undefined>(undefined);
  const [dragOver, setDragOver] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const running = useRef(0);
  const aborts = useRef(new Map<string, AbortController>());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkSupport().then(setSupport).catch(() => setSupport("Não foi possível iniciar o editor neste navegador."));
  }, []);

  const patch = useCallback((id: string, p: Partial<Item>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }, []);

  // ---------------------------------------------------------------- upload
  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const videos = Array.from(files).filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name));
      const room = MAX_FILES - itemsRef.current.length;
      if (videos.length > room) setNotice(`Limite de ${MAX_FILES} vídeos por vez. ${videos.length - room} ficaram de fora.`);
      const accepted = videos.slice(0, Math.max(0, room));
      if (!accepted.length) return;

      const fresh: Item[] = accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "probing",
        progress: 0,
        width: 0,
        height: 0,
        duration: 0,
        thumbnail: "",
        band: { top: 0, bottom: 1 },
        autoBand: { top: 0, bottom: 1 },
        output: null,
        error: null,
      }));
      setItems((list) => [...list, ...fresh]);
      setPreviewId((p) => p ?? fresh[0].id);

      // Leitura sequencial: cada probe decodifica vários quadros.
      for (const it of fresh) {
        try {
          const r = await probeVideo(it.file);
          patch(it.id, {
            status: "ready",
            width: r.width,
            height: r.height,
            duration: r.duration,
            thumbnail: r.thumbnail,
            band: r.band,
            autoBand: r.band,
          });
        } catch (e) {
          patch(it.id, { status: "error", error: e instanceof Error ? e.message : "Vídeo inválido." });
        }
      }
    },
    [patch],
  );

  // ----------------------------------------------------------------- queue
  const pump = useCallback(() => {
    while (running.current < CONCURRENCY) {
      const next = itemsRef.current.find((it) => it.status === "queued");
      if (!next) return;
      running.current++;
      itemsRef.current = itemsRef.current.map((it) => (it.id === next.id ? { ...it, status: "processing" } : it));
      patch(next.id, { status: "processing", progress: 0, error: null });

      const ctrl = new AbortController();
      aborts.current.set(next.id, ctrl);
      renderReel({
        file: next.file,
        width: next.width,
        height: next.height,
        band: next.band,
        settings: settingsRef.current,
        signal: ctrl.signal,
        onProgress: (p) => patch(next.id, { progress: p }),
      })
        .then((output) => patch(next.id, { status: "done", progress: 1, output }))
        .catch((e) => {
          if (ctrl.signal.aborted) patch(next.id, { status: "ready", progress: 0 });
          else patch(next.id, { status: "error", error: e instanceof Error ? e.message : "Falha ao exportar." });
        })
        .finally(() => {
          aborts.current.delete(next.id);
          running.current--;
          // deixa o setState assentar antes de puxar o próximo
          setTimeout(pump, 0);
        });
    }
  }, [patch]);

  const processAll = () => {
    const list = itemsRef.current.map((it) =>
      it.status === "ready" || it.status === "error" || it.status === "done"
        ? { ...it, status: "queued" as Status, output: null, progress: 0, error: null }
        : it,
    );
    itemsRef.current = list;
    setItems(list);
    pump();
  };

  const stopAll = () => {
    const list = itemsRef.current.map((it) => (it.status === "queued" ? { ...it, status: "ready" as Status } : it));
    itemsRef.current = list;
    setItems(list);
    aborts.current.forEach((c) => c.abort());
  };

  const remove = (id: string) => {
    aborts.current.get(id)?.abort();
    setItems((list) => list.filter((it) => it.id !== id));
    if (previewId === id) setPreviewId(null);
  };

  const downloadZip = async () => {
    const done = items.filter((it) => it.output);
    if (!done.length) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const used = new Set<string>();
      for (const it of done) {
        let name = outputName(it.file);
        for (let n = 2; used.has(name); n++) name = outputName(it.file).replace(/\.mp4$/, `-${n}.mp4`);
        used.add(name);
        zip.file(name, it.output!);
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      download(blob, `reels-loog-${timestamp()}.zip`);
    } finally {
      setZipping(false);
    }
  };

  // Mudou o corte ou o visual: o que já foi exportado fica desatualizado.
  const invalidate = (id?: string) =>
    setItems((list) =>
      list.map((it) => ((id ? it.id === id : true) && it.status === "done" ? { ...it, status: "ready", output: null, progress: 0 } : it)),
    );

  const updateSettings = (p: Partial<RenderSettings>) => {
    setSettings((s) => ({ ...s, ...p }));
    invalidate();
  };

  const counts = {
    total: items.length,
    done: items.filter((it) => it.status === "done").length,
    busy: items.filter((it) => it.status === "processing" || it.status === "queued").length,
    probing: items.filter((it) => it.status === "probing").length,
  };
  const editing = items.find((it) => it.id === editingId) ?? null;
  const previewItem =
    items.find((it) => it.id === previewId && it.thumbnail) ?? items.find((it) => it.thumbnail) ?? null;

  return (
    <section className="container-loog mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* ------------------------------------------------------ configurações */}
      <aside className="space-y-6">
        <div className="card space-y-5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Formato</h2>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["reels", "Reels 9:16", "1080×1920 com fundo e título"],
                ["crop", "Só o corte", "mantém só o miolo do vídeo"],
              ] as const
            ).map(([key, label, hint]) => (
              <button
                key={key}
                type="button"
                onClick={() => updateSettings({ mode: key })}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  settings.mode === key ? "border-loog-brand2/70 bg-loog-brand/20" : "border-loog-border bg-loog-panel hover:border-loog-muted/50",
                )}
              >
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-[11px] text-loog-muted">{hint}</span>
              </button>
            ))}
          </div>

          {settings.mode === "reels" && (
            <>
              <div className="space-y-2">
                <span className="label">Fundo</span>
                <div className="flex flex-wrap items-center gap-2">
                  {BACKGROUNDS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => updateSettings({ background: b.key })}
                      className={settings.background === b.key ? "chip-active" : "chip"}
                    >
                      {b.label}
                    </button>
                  ))}
                  {settings.background === "color" && (
                    <input
                      type="color"
                      aria-label="Cor do fundo"
                      value={settings.backgroundColor}
                      onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded-lg border border-loog-border bg-transparent"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="reels-title" className="label">Título (opcional)</label>
                  <input
                    type="color"
                    aria-label="Cor do título"
                    value={settings.titleColor}
                    onChange={(e) => updateSettings({ titleColor: e.target.value })}
                    className="h-7 w-9 cursor-pointer rounded-md border border-loog-border bg-transparent"
                  />
                </div>
                <textarea
                  id="reels-title"
                  rows={2}
                  maxLength={140}
                  placeholder="Ex.: Olha o que aconteceu nessa batida 😱"
                  value={settings.title}
                  onChange={(e) => updateSettings({ title: e.target.value })}
                  className="input resize-none"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <span className="label">Overlay (PNG transparente)</span>
            <div className="flex items-center gap-2">
              <label className="btn-ghost cursor-pointer !px-3 !py-2 text-xs">
                {settings.overlay ? "Trocar overlay" : "Enviar overlay"}
                <input
                  type="file"
                  accept="image/png,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) updateSettings({ overlay: await createImageBitmap(f) });
                  }}
                />
              </label>
              {settings.overlay && (
                <button type="button" className="text-xs text-loog-muted underline hover:text-white" onClick={() => updateSettings({ overlay: null })}>
                  remover
                </button>
              )}
            </div>
            <p className="text-[11px] text-loog-muted">Esticado no quadro todo. Use 1080×1920 no modo Reels.</p>
          </div>

          <div className="space-y-3 border-t border-loog-border pt-4">
            <Toggle checked={settings.mirror} onChange={(v) => updateSettings({ mirror: v })} label="Espelhar vídeo" />
            <Toggle checked={settings.speedUp} onChange={(v) => updateSettings({ speedUp: v })} label="Acelerar 2% (1.02x)" />
            <Toggle checked={settings.stripMetadata} onChange={(v) => updateSettings({ stripMetadata: v })} label="Limpar metadados do arquivo" />
            <Toggle
              checked={settings.quality === "high"}
              onChange={(v) => updateSettings({ quality: v ? "high" : "medium" })}
              label="Qualidade alta"
            />
          </div>
        </div>

        {previewItem && (
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">Prévia</h2>
            <Preview item={previewItem} settings={settings} />
            <p className="mt-2 truncate text-center text-[11px] text-loog-muted">{previewItem.file.name}</p>
          </div>
        )}
      </aside>

      {/* ---------------------------------------------------------- vídeos */}
      <div className="space-y-6">
        {support && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">{support}</div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "card flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-8 text-center transition",
            dragOver ? "border-loog-brand2 bg-loog-brand/10" : "hover:border-loog-muted/50",
          )}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8 text-loog-brand2" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="font-semibold">Arraste seus vídeos aqui ou clique para escolher</p>
          <p className="text-xs text-loog-muted">
            Até {MAX_FILES} vídeos por vez · MP4, MOV ou WEBM · tudo processado no seu aparelho, nada sobe pra internet
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {notice && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-loog-border bg-loog-panel p-3 text-sm text-loog-muted">
            {notice}
            <button type="button" className="text-xs underline" onClick={() => setNotice(null)}>ok</button>
          </div>
        )}

        {items.length > 0 && (
          <div className="card p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Seus vídeos</h2>
                <p className="text-xs text-loog-muted/80">
                  {counts.done}/{counts.total} prontos
                  {counts.probing > 0 && ` · analisando ${counts.probing}…`}
                </p>
              </div>
              {counts.busy > 0 ? (
                <button type="button" className="btn-ghost !py-2" onClick={stopAll}>Parar</button>
              ) : (
                <button
                  type="button"
                  className="btn-primary !py-2"
                  disabled={!!support || counts.probing > 0 || counts.done === counts.total}
                  onClick={processAll}
                >
                  Gerar {counts.total - counts.done > 1 ? `${counts.total - counts.done} vídeos` : "vídeo"}
                </button>
              )}
              <button type="button" className="btn-ghost !py-2" disabled={!counts.done || zipping} onClick={downloadZip}>
                {zipping ? "Compactando…" : `Baixar tudo (.zip)`}
              </button>
              <button
                type="button"
                className="text-xs text-loog-muted underline hover:text-white disabled:opacity-40"
                disabled={counts.busy > 0}
                onClick={() => {
                  setItems([]);
                  setPreviewId(null);
                }}
              >
                limpar
              </button>
            </div>

            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((it) => (
                <li
                  key={it.id}
                  className={cn(
                    "group overflow-hidden rounded-xl border bg-loog-panel transition",
                    previewItem?.id === it.id ? "border-loog-brand2/60" : "border-loog-border",
                  )}
                >
                  <button type="button" className="relative block w-full bg-black" onClick={() => setPreviewId(it.id)} aria-label={`Ver prévia de ${it.file.name}`}>
                    {it.thumbnail ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.thumbnail} alt="" className="block aspect-[9/16] w-full object-contain" />
                        <div className="pointer-events-none absolute inset-0">
                          <ThumbMask item={it} />
                        </div>
                      </>
                    ) : (
                      <div className="flex aspect-[9/16] items-center justify-center text-xs text-loog-muted">
                        {it.status === "error" ? "Erro" : "Analisando…"}
                      </div>
                    )}
                    {(it.status === "processing" || it.status === "queued") && (
                      <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full bg-loog-brand2 transition-[width]" style={{ width: `${Math.round(it.progress * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-[10px] text-white/80">
                          {it.status === "queued" ? "Na fila" : `${Math.round(it.progress * 100)}%`}
                        </p>
                      </div>
                    )}
                    {it.status === "done" && (
                      <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-black">PRONTO</span>
                    )}
                  </button>
                  <div className="space-y-2 p-2.5">
                    <p className="truncate text-xs font-medium" title={it.file.name}>{it.file.name}</p>
                    <p className="text-[10px] text-loog-muted">
                      {it.width ? `${it.width}×${it.height}` : ""} {formatDuration(it.duration)}
                    </p>
                    {it.error && <p className="text-[10px] text-red-400">{it.error}</p>}
                    <div className="flex gap-1.5">
                      {it.status === "done" && it.output ? (
                        <button type="button" className="btn-primary flex-1 !px-2 !py-1.5 text-xs" onClick={() => download(it.output!, outputName(it.file))}>
                          Baixar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-dark flex-1 !px-2 !py-1.5 text-xs"
                          disabled={!it.thumbnail || it.status === "processing" || it.status === "queued"}
                          onClick={() => setEditingId(it.id)}
                        >
                          Ajustar corte
                        </button>
                      )}
                      <button type="button" className="btn-dark !px-2 !py-1.5 text-xs" aria-label={`Remover ${it.file.name}`} onClick={() => remove(it.id)}>
                        ✕
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {editing && (
        <CropEditor
          file={editing.file}
          band={editing.band}
          autoBand={editing.autoBand}
          onClose={() => setEditingId(null)}
          onSave={(band) => {
            patch(editing.id, { band });
            invalidate(editing.id);
            setPreviewId(editing.id);
            setEditingId(null);
          }}
          onApplyAll={(band) => {
            setItems((list) =>
              list.map((it) =>
                it.status === "processing" || it.status === "queued"
                  ? it
                  : { ...it, band, ...(it.status === "done" ? { status: "ready" as Status, output: null, progress: 0 } : {}) },
              ),
            );
            setPreviewId(editing.id);
            setEditingId(null);
          }}
        />
      )}
    </section>
  );
}

function ThumbMask({ item }: { item: Item }) {
  return (
    <>
      <div className="absolute inset-x-0 top-0 bg-black/65" style={{ height: `${item.band.top * 100}%` }} />
      <div className="absolute inset-x-0 bottom-0 bg-black/65" style={{ height: `${(1 - item.band.bottom) * 100}%` }} />
      <div className="absolute inset-x-0 border-y border-loog-brand2/80" style={{ top: `${item.band.top * 100}%`, bottom: `${(1 - item.band.bottom) * 100}%` }} />
    </>
  );
}

function Preview({ item, settings }: { item: Item; settings: RenderSettings }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = async () => {
      const frame = await renderPreview(img, item.band, settings);
      const c = ref.current;
      if (cancelled || !c) return;
      c.width = frame.width;
      c.height = frame.height;
      c.getContext("2d")!.drawImage(frame, 0, 0);
    };
    img.src = item.thumbnail;
    return () => {
      cancelled = true;
    };
  }, [item.thumbnail, item.band, settings]);

  return (
    <canvas
      ref={ref}
      className={cn(
        "mx-auto block w-full rounded-lg bg-black",
        settings.mode === "reels" ? "max-w-[220px]" : "max-w-[300px]",
      )}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-loog-brand" : "bg-loog-border")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}
