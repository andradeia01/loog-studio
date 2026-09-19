"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABEL, FORMAT_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ReadyArtRow {
  id: string;
  title: string;
  category: string;
  format: string;
  image_url: string;
  thumbnail_url: string | null;
  active: boolean;
  created_at: string;
  folder_id?: string | null;
}

export interface FolderRow {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  count: number;
}

const CATEGORIES = Object.entries(CATEGORY_LABEL) as [keyof typeof CATEGORY_LABEL, string][];
const FORMATS = Object.entries(FORMAT_LABEL) as [keyof typeof FORMAT_LABEL, string][];

type ViewFolder = "all" | "none" | string; // string = folder id

export function ReadyArtsManager({ initial }: { initial: ReadyArtRow[] }) {
  const [rows, setRows] = useState<ReadyArtRow[]>(initial);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [view, setView] = useState<ViewFolder>("all");
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    category: "feed",
    format: "feed-4x5",
    folder_id: "" as string,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // carrega pastas ao montar
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/art-folders");
        if (r.ok) {
          const { folders } = await r.json();
          setFolders(folders ?? []);
        }
      } catch {}
    })();
  }, []);

  const visibleRows = useMemo(() => {
    if (view === "all") return rows;
    if (view === "none") return rows.filter((r) => !r.folder_id);
    return rows.filter((r) => r.folder_id === view);
  }, [rows, view]);

  // ── pastas ────────────────────────────────────────────────────────────────
  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const r = await fetch("/api/art-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (!r.ok) throw new Error(await r.text());
      const { folder } = await r.json();
      setFolders((f) => [...f, folder]);
      setNewFolderName("");
    } catch (err) {
      console.error(err);
      alert("Falha ao criar pasta.");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function renameFolder(id: string) {
    const cur = folders.find((f) => f.id === id);
    const name = prompt("Novo nome da pasta:", cur?.name ?? "");
    if (!name || !name.trim() || name === cur?.name) return;
    const r = await fetch(`/api/art-folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (r.ok) setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)));
  }

  async function deleteFolder(id: string) {
    const cur = folders.find((f) => f.id === id);
    if (!confirm(`Excluir a pasta "${cur?.name}"? As artes que estão dentro voltam pra "Sem pasta".`)) return;
    const r = await fetch(`/api/art-folders/${id}`, { method: "DELETE" });
    if (r.ok) {
      setFolders((fs) => fs.filter((f) => f.id !== id));
      setRows((rs) => rs.map((x) => (x.folder_id === id ? { ...x, folder_id: null } : x)));
      if (view === id) setView("all");
    }
  }

  // ── mover arte pra pasta (dropdown OU drop) ───────────────────────────────
  async function moveArt(artId: string, folderId: string | null) {
    const r = await fetch(`/api/ready-arts/${artId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folderId }),
    });
    if (!r.ok) {
      alert("Falha ao mover.");
      return;
    }
    setRows((rs) => rs.map((x) => (x.id === artId ? { ...x, folder_id: folderId } : x)));
    // atualizar contagem local das pastas
    setFolders((fs) =>
      fs.map((f) => ({
        ...f,
        count: f.id === folderId
          ? f.count + 1
          : rows.find((r) => r.id === artId)?.folder_id === f.id
            ? Math.max(0, f.count - 1)
            : f.count,
      })),
    );
  }

  // ── upload ────────────────────────────────────────────────────────────────
  function onFile(f: File | null) {
    setFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setPreview(String(reader.result));
      reader.readAsDataURL(f);
    } else setPreview(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setErr("Selecione um arquivo."); return; }
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", form.title);
      fd.append("category", form.category);
      fd.append("format", form.format);
      if (form.folder_id) fd.append("folder_id", form.folder_id);
      else if (view !== "all" && view !== "none") fd.append("folder_id", view);
      const res = await fetch("/api/ready-arts", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { readyArt } = await res.json();
      setRows((r) => [readyArt, ...r]);
      if (readyArt.folder_id) {
        setFolders((fs) => fs.map((f) => (f.id === readyArt.folder_id ? { ...f, count: f.count + 1 } : f)));
      }
      setForm({ title: "", category: "feed", format: "feed-4x5", folder_id: "" });
      onFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      console.error(e);
      setErr("Falha no upload.");
    } finally {
      setUploading(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    const res = await fetch(`/api/ready-arts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (res.ok) setRows((r) => r.map((x) => (x.id === id ? { ...x, active } : x)));
  }

  async function remove(id: string) {
    if (!confirm("Excluir essa arte? Não pode ser desfeito.")) return;
    const res = await fetch(`/api/ready-arts/${id}`, { method: "DELETE" });
    if (res.ok) {
      const removed = rows.find((r) => r.id === id);
      setRows((r) => r.filter((x) => x.id !== id));
      if (removed?.folder_id) {
        setFolders((fs) =>
          fs.map((f) => (f.id === removed.folder_id ? { ...f, count: Math.max(0, f.count - 1) } : f)),
        );
      }
    }
  }

  const orphanCount = rows.filter((r) => !r.folder_id).length;
  const currentFolder = view !== "all" && view !== "none" ? folders.find((f) => f.id === view) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* SIDEBAR — pastas */}
      <aside className="space-y-4">
        <div className="card p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-loog-muted">
            Pastas / Álbuns
          </h3>
          <ul className="space-y-1 text-sm">
            <li>
              <button
                type="button"
                onClick={() => setView("all")}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition",
                  view === "all" ? "bg-loog-brand text-white" : "hover:bg-white/5",
                )}
              >
                <span>Todas</span>
                <span className="text-xs opacity-60">{rows.length}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setView("none")}
                onDragOver={(e) => { e.preventDefault(); setDragOverFolder("none"); }}
                onDragLeave={() => setDragOverFolder(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverFolder(null);
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) moveArt(id, null);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition",
                  view === "none" ? "bg-loog-brand text-white" : "hover:bg-white/5",
                  dragOverFolder === "none" && "ring-2 ring-loog-brand2",
                )}
              >
                <span>Sem pasta</span>
                <span className="text-xs opacity-60">{orphanCount}</span>
              </button>
            </li>
          </ul>

          <div className="my-3 h-px bg-loog-border/60" />

          <ul className="space-y-1 text-sm">
            {folders.map((f) => (
              <li key={f.id}>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOverFolder(f.id); }}
                  onDragLeave={() => setDragOverFolder(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverFolder(null);
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) moveArt(id, f.id);
                  }}
                  className={cn(
                    "group flex items-center justify-between rounded-lg px-3 py-2 transition",
                    view === f.id ? "bg-loog-brand text-white" : "hover:bg-white/5",
                    dragOverFolder === f.id && "ring-2 ring-loog-brand2",
                  )}
                >
                  <button type="button" className="flex-1 truncate text-left" onClick={() => setView(f.id)}>
                    <span className="mr-2">📁</span>{f.name}
                  </button>
                  <div className="flex items-center gap-1">
                    <span className="text-xs opacity-60">{f.count}</span>
                    <button
                      type="button"
                      className="rounded p-1 opacity-0 hover:bg-white/10 group-hover:opacity-100"
                      onClick={() => renameFolder(f.id)}
                      title="Renomear"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 opacity-0 hover:bg-red-500/20 group-hover:opacity-100"
                      onClick={() => deleteFolder(f.id)}
                      title="Excluir pasta"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {folders.length === 0 && (
            <p className="mt-3 text-xs text-loog-muted">
              Nenhuma pasta ainda. Crie a primeira abaixo pra organizar suas artes.
            </p>
          )}
        </div>

        <form onSubmit={createFolder} className="card space-y-2 p-4">
          <label className="label">Nova pasta</label>
          <input
            className="input"
            placeholder="Ex.: Setembro 2026"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            maxLength={80}
          />
          <button className="btn-primary w-full !py-2 !text-xs" disabled={creatingFolder || !newFolderName.trim()}>
            {creatingFolder ? "Criando…" : "+ Criar pasta"}
          </button>
        </form>
      </aside>

      {/* MAIN — upload + grade */}
      <div className="space-y-6">
        <form onSubmit={onSubmit} className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">
            Publicar nova arte
            {currentFolder && (
              <span className="ml-2 rounded bg-loog-brand/20 px-2 py-0.5 text-[10px] text-loog-brand2">
                em: {currentFolder.name}
              </span>
            )}
          </h2>
          <div>
            <label className="label mb-1.5">Título</label>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex.: Semana da Proteção — 03/set"
            />
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
              <select className="input" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
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
          <div>
            <label className="label mb-1.5">Arquivo (PNG, JPG ou WEBP até 15MB)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="input !py-2"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>
          {preview && (
            <div className="rounded-xl border border-loog-border bg-black p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="preview" className="max-h-64 w-full rounded object-contain" />
            </div>
          )}
          {err && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
          <button className="btn-primary w-full" disabled={uploading}>
            {uploading ? "Enviando…" : "Publicar arte"}
          </button>
        </form>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">
                {view === "all" ? "Todas as artes" :
                 view === "none" ? "Sem pasta" :
                 `Pasta: ${currentFolder?.name}`}
              </h2>
              <p className="text-xs text-loog-muted/70">
                Arraste uma arte pra uma pasta na coluna esquerda pra organizá-la.
              </p>
            </div>
            <span className="text-xs text-loog-muted">{visibleRows.length} artes</span>
          </div>
          {visibleRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
              Nenhuma arte {view === "none" ? "sem pasta" : view !== "all" ? "nessa pasta" : "publicada"}.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleRows.map((r) => {
                const aspect =
                  r.format === "story-9x16" ? "aspect-[9/16]" :
                  r.format === "feed-4x5" ? "aspect-[4/5]" : "aspect-square";
                return (
                  <div
                    key={r.id}
                    className="card overflow-hidden"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                  >
                    <div className={cn("relative w-full bg-black cursor-grab active:cursor-grabbing", aspect)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.thumbnail_url ?? r.image_url} alt={r.title} className="h-full w-full object-cover" />
                      {!r.active && (
                        <span className="absolute left-2 top-2 rounded bg-red-500/80 px-2 py-0.5 text-[10px] font-bold uppercase">off</span>
                      )}
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="truncate text-sm font-semibold">{r.title}</div>
                      <select
                        className="input !py-1 !text-[11px]"
                        value={r.folder_id ?? ""}
                        onChange={(e) => moveArt(r.id, e.target.value || null)}
                      >
                        <option value="">Sem pasta</option>
                        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <div className="flex gap-1">
                        <button type="button" className="btn-ghost flex-1 !py-1 !text-[11px]" onClick={() => toggle(r.id, !r.active)}>
                          {r.active ? "Despublicar" : "Publicar"}
                        </button>
                        <button type="button" className="btn-ghost !py-1 !text-[11px] !text-red-400" onClick={() => remove(r.id)}>
                          Excluir
                        </button>
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
