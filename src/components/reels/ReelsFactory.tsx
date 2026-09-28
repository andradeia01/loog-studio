"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { probeVideo } from "@/lib/reels/detect";
import { checkSupport, renderPreview, renderReel } from "@/lib/reels/render";
import { preloadWatermark } from "@/lib/watermark";
import {
  DEFAULT_SETTINGS,
  MAX_FILES,
  type CropBand,
  type ReelsProfile,
  type RenderSettings,
  type SlotAspect,
  type Theme,
} from "@/lib/reels/types";
import { loadConsultant } from "@/lib/storage";
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

const SLOTS: { key: SlotAspect; label: string }[] = [
  { key: "auto", label: "Automático" },
  { key: "4:5", label: "4:5" },
  { key: "1:1", label: "1:1" },
  { key: "16:9", label: "16:9" },
];

const PROFILE_KEY = "loog-studio.reels-profile.v1";

/** Perfil e tema ficam salvos no aparelho pra não precisar preencher toda vez. */
function loadProfile(): Pick<RenderSettings, "profile" | "theme"> | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveProfile(v: Pick<RenderSettings, "profile" | "theme">) {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(v));
  } catch {
    // storage cheio ou bloqueado
  }
}

/** Recorta a foto em quadrado central e reduz pra 320px (vira o círculo do perfil). */
async function squareAvatar(file: File | string): Promise<string> {
  const blob = typeof file === "string" ? await (await fetch(file)).blob() : file;
  const bmp = await createImageBitmap(blob);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = 320;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 320, 320);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.9);
}

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
    // Pré-carrega marca d'água pra 1º frame já vir com logo LOOG
    void preloadWatermark();
  }, []);

  // Perfil salvo; na primeira vez, puxa nome/@/foto do cadastro do consultor.
  const [profileLoaded, setProfileLoaded] = useState(false);
  useEffect(() => {
    const saved = loadProfile();
    if (saved) {
      setSettings((s) => ({ ...s, ...saved }));
      setProfileLoaded(true);
      return;
    }
    const c = loadConsultant();
    (async () => {
      const avatar = c?.photoDataUrl ? await squareAvatar(c.photoDataUrl).catch(() => null) : null;
      setSettings((s) => ({
        ...s,
        profile: { ...s.profile, name: c?.name ?? "", handle: (c?.instagram ?? "").replace(/^@+/, ""), avatar },
      }));
      setProfileLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (profileLoaded) saveProfile({ profile: settings.profile, theme: settings.theme });
  }, [profileLoaded, settings.profile, settings.theme]);

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
  const updateProfile = (p: Partial<ReelsProfile>) => updateSettings({ profile: { ...settings.profile, ...p } });

  // Miniaturas dos cards acompanham as configurações com um pequeno atraso
  // (evita redesenhar 50 prévias a cada tecla digitada).
  const [cardSettings, setCardSettings] = useState(settings);
  useEffect(() => {
    const t = setTimeout(() => setCardSettings(settings), 350);
    return () => clearTimeout(t);
  }, [settings]);

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
      <aside className="order-2 space-y-6 lg:order-1">
        <div className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Perfil do Instagram</h2>
          <div className="flex items-center gap-4">
            <label className="group relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-full border border-loog-border bg-loog-panel">
              {settings.profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.profile.avatar} alt="Foto de perfil" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] text-loog-muted">+ foto</span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-semibold opacity-0 transition group-hover:opacity-100">
                trocar
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) updateProfile({ avatar: await squareAvatar(f) });
                }}
              />
            </label>
            <div className="min-w-0 flex-1 space-y-2">
              <input
                aria-label="Nome do perfil"
                placeholder="Nome (ex.: LOOG Proteção)"
                maxLength={40}
                value={settings.profile.name}
                onChange={(e) => updateProfile({ name: e.target.value })}
                className="input !py-2"
              />
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-loog-muted">@</span>
                <input
                  aria-label="Arroba do Instagram"
                  placeholder="seuinstagram"
                  maxLength={30}
                  value={settings.profile.handle}
                  onChange={(e) => updateProfile({ handle: e.target.value.replace(/^@+/, "").replace(/\s+/g, "") })}
                  className="input !py-2 !pl-7"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            {settings.profile.avatar ? (
              <button type="button" className="text-xs text-loog-muted underline hover:text-white" onClick={() => updateProfile({ avatar: null })}>
                remover foto
              </button>
            ) : (
              <span />
            )}
            <Toggle checked={settings.profile.verified} onChange={(v) => updateProfile({ verified: v })} label="Selo de verificado" />
          </div>
        </div>

        <div className="card space-y-2 p-5">
          <label htmlFor="reels-headline" className="text-sm font-semibold uppercase tracking-wider text-loog-muted">
            Headline
          </label>
          <textarea
            id="reels-headline"
            rows={3}
            maxLength={160}
            placeholder="Ex.: Ele achou que o seguro cobria… olha o que aconteceu 😱"
            value={settings.headline}
            onChange={(e) => updateSettings({ headline: e.target.value })}
            className="input resize-none"
          />
          <p className="text-[11px] text-loog-muted">Aparece em destaque logo abaixo do seu perfil, acima do vídeo.</p>
        </div>

        {previewItem && (
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">Prévia do Reels</h2>
            <Preview item={previewItem} settings={settings} width={540} className="mx-auto block w-full max-w-[240px] rounded-lg" />
            <p className="mt-2 truncate text-center text-[11px] text-loog-muted">{previewItem.file.name}</p>
          </div>
        )}

        <div className="card space-y-5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Layout</h2>
          <div className="space-y-2">
            <span className="label">Tema</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["dark", "Escuro", "bg-black text-white"],
                  ["light", "Claro", "bg-white text-black"],
                ] as [Theme, string, string][]
              ).map(([key, label, swatch]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateSettings({ theme: key })}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-2.5 text-sm font-semibold transition",
                    settings.theme === key ? "border-loog-brand2/70 bg-loog-brand/20" : "border-loog-border bg-loog-panel hover:border-loog-muted/50",
                  )}
                >
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-md border border-loog-border text-[10px]", swatch)}>Aa</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="label">Espaço do vídeo</span>
            <div className="flex flex-wrap gap-2">
              {SLOTS.map((o) => (
                <button key={o.key} type="button" onClick={() => updateSettings({ slot: o.key })} className={settings.slot === o.key ? "chip-active" : "chip"}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-loog-muted">
              O vídeo é cortado pra preencher o espaço. &quot;Automático&quot; segue o formato do conteúdo.
            </p>
          </div>

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
            <p className="text-[11px] text-loog-muted">Opcional. PNG 1080×1920 desenhado por cima de tudo.</p>
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
      </aside>

      {/* ---------------------------------------------------------- vídeos */}
      <div className="order-1 space-y-6 lg:order-2">
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
                      <Preview item={it} settings={cardSettings} width={270} className="block aspect-[9/16] w-full" />
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

// Prévias são geradas uma de cada vez: cada uma usa um quadro 1080×1920 temporário.
let previewQueue: Promise<unknown> = Promise.resolve();

function Preview({
  item,
  settings,
  width = 1080,
  className,
}: {
  item: Item;
  settings: RenderSettings;
  width?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      const img = new Image();
      img.src = item.thumbnail;
      await img.decode();
      if (cancelled) return;
      const frame = await renderPreview(img, item.band, settings);
      const c = ref.current;
      if (cancelled || !c) return;
      c.width = width;
      c.height = Math.round((width * 16) / 9);
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(frame, 0, 0, c.width, c.height);
    };
    previewQueue = previewQueue.then(run, run);
    return () => {
      cancelled = true;
    };
  }, [item.thumbnail, item.band, settings, width]);

  return <canvas ref={ref} className={cn("bg-black", className)} />;
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
