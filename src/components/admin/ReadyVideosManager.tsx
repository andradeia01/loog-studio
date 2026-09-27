"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ReadyVideoRow {
  id: string;
  title: string;
  category: string;
  format: "reel-9x16" | "square-1x1" | "landscape-16x9";
  video_url: string;
  thumbnail_url: string | null;
  folder_id: string | null;
  duration_sec: number | null;
  size_bytes: number | null;
  active: boolean;
  created_at: string;
}

export interface VideoFolderRow {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  position: number;
  count: number;
}

const CATEGORIES = Object.entries(CATEGORY_LABEL) as [keyof typeof CATEGORY_LABEL, string][];
const FORMATS: [ReadyVideoRow["format"], string][] = [
  ["reel-9x16", "Reel 9:16"],
  ["square-1x1", "Feed 1:1"],
  ["landscape-16x9", "Landscape 16:9"],
];

type View = "all" | "none" | string;

export function ReadyVideosManager({ initial }: { initial: ReadyVideoRow[] }) {
  const [rows, setRows] = useState<ReadyVideoRow[]>(initial);
  const [folders, setFolders] = useState<VideoFolderRow[]>([]);
  const [view, setView] = useState<View>("all");
  const [dragOver, setDragOver] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    category: "feed",
    format: "reel-9x16" as ReadyVideoRow["format"],
    folder_id: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  const [newFolder, setNewFolder] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    fetch("/api/ready-video-folders")
      .then((r) => r.json())
      .then((d) => setFolders(d.folders ?? []))
      .catch(() => {});
  }, []);

  const visible = useMemo(() => {
    if (view === "all") return rows;
    if (view === "none") return rows.filter((r) => !r.folder_id);
    return rows.filter((r) => r.folder_id === view);
  }, [rows, view]);

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolder.trim()) return;
    setCreatingFolder(true);
    try {
      const r = await fetch("/api/ready-video-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolder.trim() }),
      });
      if (r.ok) {
        const { folder } = await r.json();
        setFolders((fs) => [...fs, folder]);
        setNewFolder("");
      }
    } finally { setCreatingFolder(false); }
  }
  async function renameFolder(id: string) {
    const cur = folders.find((f) => f.id === id);
    const name = prompt("Novo nome:", cur?.name ?? "");
    if (!name || !name.trim() || name === cur?.name) return;
    const r = await fetch(`/api/ready-video-folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (r.ok) setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)));
  }
  async function deleteFolder(id: string) {
    const cur = folders.find((f) => f.id === id);
    if (!confirm(`Excluir pasta "${cur?.name}"? Os vídeos ficam sem pasta.`)) return;
    const r = await fetch(`/api/ready-video-folders/${id}`, { method: "DELETE" });
    if (r.ok) {
      setFolders((fs) => fs.filter((f) => f.id !== id));
      setRows((rs) => rs.map((x) => (x.folder_id === id ? { ...x, folder_id: null } : x)));
      if (view === id) setView("all");
    }
  }
  async function moveVideo(id: string, folderId: string | null) {
    const r = await fetch(`/api/ready-videos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folderId }),
    });
    if (!r.ok) return alert("falhou");
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, folder_id: folderId } : x)));
  }

  function onFile(f: File | null) {
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else setPreview(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setErr("Selecione um vídeo."); return; }
    setErr(null);
    setUploading(true);
    try {
      // tenta capturar duração
      let duration = 0;
      try {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.src = URL.createObjectURL(file);
        await new Promise<void>((resolve, reject) => {
          v.onloadedmetadata = () => resolve();
          v.onerror = () => reject();
          setTimeout(reject, 5000);
        });
        duration = Math.round(v.duration || 0);
      } catch {}

      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", form.title);
      fd.append("category", form.category);
      fd.append("format", form.format);
      fd.append("duration_sec", String(duration));
      if (form.folder_id) fd.append("folder_id", form.folder_id);
      else if (view !== "all" && view !== "none") fd.append("folder_id", view);
      if (thumb) fd.append("thumbnail", thumb);

      const res = await fetch("/api/ready-videos", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { readyVideo } = await res.json();
      setRows((r) => [readyVideo, ...r]);
      setForm({ title: "", category: "feed", format: "reel-9x16", folder_id: "" });
      onFile(null);
      setThumb(null);
      if (fileRef.current) fileRef.current.value = "";
      if (thumbRef.current) thumbRef.current.value = "";
    } catch (e) {
      setErr("Falha no upload: " + (e instanceof Error ? e.message : e));
    } finally { setUploading(false); }
  }
  async function toggle(id: string, active: boolean) {
    const r = await fetch(`/api/ready-videos/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (r.ok) setRows((x) => x.map((y) => (y.id === id ? { ...y, active } : y)));
  }
  async function remove(id: string) {
    if (!confirm("Excluir esse vídeo?")) return;
    const r = await fetch(`/api/ready-videos/${id}`, { method: "DELETE" });
    if (r.ok) setRows((x) => x.filter((y) => y.id !== id));
  }

  const orphanCount = rows.filter((r) => !r.folder_id).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="card p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Pastas / Álbuns</h3>
          <ul className="space-y-1 text-sm">
            <li>
              <button type="button" onClick={() => setView("all")}
                className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition",
                  view === "all" ? "bg-loog-brand text-white" : "hover:bg-white/5")}>
                <span>Todos</span><span className="text-xs opacity-60">{rows.length}</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setView("none")}
                onDragOver={(e) => { e.preventDefault(); setDragOver("none"); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) moveVideo(id, null); }}
                className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition",
                  view === "none" ? "bg-loog-brand text-white" : "hover:bg-white/5",
                  dragOver === "none" && "ring-2 ring-loog-brand2")}>
                <span>Sem pasta</span><span className="text-xs opacity-60">{orphanCount}</span>
              </button>
            </li>
          </ul>
          <div className="my-3 h-px bg-loog-border/60" />
          <ul className="space-y-1 text-sm">
            {folders.map((f) => (
              <li key={f.id}>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(f.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) moveVideo(id, f.id); }}
                  className={cn("group flex items-center justify-between rounded-lg px-3 py-2 transition",
                    view === f.id ? "bg-loog-brand text-white" : "hover:bg-white/5",
                    dragOver === f.id && "ring-2 ring-loog-brand2")}>
                  <button type="button" className="flex-1 truncate text-left" onClick={() => setView(f.id)}>
                    <span className="mr-2">📁</span>{f.name}
                  </button>
                  <span className="text-xs opacity-60">{rows.filter((r) => r.folder_id === f.id).length}</span>
                  <button type="button" className="rounded p-1 opacity-0 hover:bg-white/10 group-hover:opacity-100" onClick={() => renameFolder(f.id)}>✎</button>
                  <button type="button" className="rounded p-1 opacity-0 hover:bg-red-500/20 group-hover:opacity-100" onClick={() => deleteFolder(f.id)}>🗑</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={createFolder} className="card space-y-2 p-4">
          <label className="label">Nova pasta</label>
          <input className="input" placeholder="Ex.: Vendas Set/26" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} maxLength={80} />
          <button className="btn-primary w-full !py-2 !text-xs" disabled={creatingFolder || !newFolder.trim()}>
            {creatingFolder ? "Criando…" : "+ Criar pasta"}
          </button>
        </form>
      </aside>

      <div className="space-y-6">
        <form onSubmit={submit} className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Publicar novo vídeo</h2>
          <div>
            <label className="label mb-1.5">Título</label>
            <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Reel Institucional Set/26" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label mb-1.5">Categoria</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label mb-1.5">Formato</label>
              <select className="input" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as ReadyVideoRow["format"] })}>
                {FORMATS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label mb-1.5">Pasta</label>
              <select className="input" value={form.folder_id} onChange={(e) => setForm({ ...form, folder_id: e.target.value })}>
                <option value="">Sem pasta</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label mb-1.5">Vídeo (MP4/WebM até 100MB)</label>
              <input ref={fileRef} type="file" accept="video/*" className="input !py-2" onChange={(e) => onFile(e.target.files?.[0] ?? null)} required />
            </div>
            <div>
              <label className="label mb-1.5">Thumbnail (opcional, JPG/PNG)</label>
              <input ref={thumbRef} type="file" accept="image/*" className="input !py-2" onChange={(e) => setThumb(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          {preview && (
            <div className="rounded-xl border border-loog-border bg-black p-2">
              <video src={preview} controls className="mx-auto max-h-64 rounded" />
            </div>
          )}
          {err && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
          <button className="btn-primary w-full" disabled={uploading}>
            {uploading ? "Enviando…" : "Publicar vídeo"}
          </button>
        </form>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">
              {view === "all" ? "Todos os vídeos" : view === "none" ? "Sem pasta" : `Pasta: ${folders.find((f) => f.id === view)?.name}`}
            </h2>
            <span className="text-xs text-loog-muted">{visible.length}</span>
          </div>
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">Nada aqui ainda.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((r) => {
                const aspect =
                  r.format === "reel-9x16" ? "aspect-[9/16]" :
                  r.format === "square-1x1" ? "aspect-square" : "aspect-video";
                return (
                  <div key={r.id} className="card overflow-hidden"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}>
                    <div className={cn("relative w-full bg-black cursor-grab active:cursor-grabbing", aspect)}>
                      {r.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.thumbnail_url} alt={r.title} className="h-full w-full object-cover" />
                      ) : (
                        <video src={r.video_url} preload="metadata" className="h-full w-full object-cover" muted />
                      )}
                      {!r.active && <span className="absolute left-2 top-2 rounded bg-red-500/80 px-2 py-0.5 text-[10px] font-bold uppercase">off</span>}
                      {r.duration_sec ? (
                        <span className="absolute right-2 bottom-2 rounded bg-black/80 px-2 py-0.5 text-[10px] font-semibold">{formatDur(r.duration_sec)}</span>
                      ) : null}
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="truncate text-sm font-semibold">{r.title}</div>
                      <select className="input !py-1 !text-[11px]" value={r.folder_id ?? ""} onChange={(e) => moveVideo(r.id, e.target.value || null)}>
                        <option value="">Sem pasta</option>
                        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <div className="flex gap-1">
                        <button type="button" className="btn-ghost flex-1 !py-1 !text-[11px]" onClick={() => toggle(r.id, !r.active)}>
                          {r.active ? "Despublicar" : "Publicar"}
                        </button>
                        <button type="button" className="btn-ghost !py-1 !text-[11px] !text-red-400" onClick={() => remove(r.id)}>Excluir</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
