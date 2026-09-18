"use client";

import { useRef, useState } from "react";
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
}

const CATEGORIES = Object.entries(CATEGORY_LABEL) as [keyof typeof CATEGORY_LABEL, string][];
const FORMATS = Object.entries(FORMAT_LABEL) as [keyof typeof FORMAT_LABEL, string][];

export function ReadyArtsManager({ initial }: { initial: ReadyArtRow[] }) {
  const [rows, setRows] = useState<ReadyArtRow[]>(initial);
  const [form, setForm] = useState<{ title: string; category: string; format: string }>({
    title: "",
    category: "feed",
    format: "feed-4x5",
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(f: File | null) {
    setFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setPreview(String(reader.result));
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setErr("Selecione um arquivo.");
      return;
    }
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", form.title);
      fd.append("category", form.category);
      fd.append("format", form.format);
      const res = await fetch("/api/ready-arts", { method: "POST", body: fd });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }
      const { readyArt } = await res.json();
      setRows((r) => [readyArt, ...r]);
      setForm({ title: "", category: "feed", format: "feed-4x5" });
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
    if (res.ok) setRows((r) => r.filter((x) => x.id !== id));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <form onSubmit={onSubmit} className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Publicar nova arte</h2>
        <div>
          <label className="label mb-1.5">Título</label>
          <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Semana da Proteção — 03/set" />
        </div>
        <div className="grid grid-cols-2 gap-3">
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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Publicadas</h2>
          <span className="text-xs text-loog-muted">{rows.length} artes</span>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
            Nenhuma arte publicada ainda.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {rows.map((r) => {
              const aspect =
                r.format === "story-9x16" ? "aspect-[9/16]" :
                r.format === "feed-4x5" ? "aspect-[4/5]" : "aspect-square";
              return (
                <div key={r.id} className="card overflow-hidden">
                  <div className={cn("relative w-full bg-black", aspect)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumbnail_url ?? r.image_url} alt={r.title} className="h-full w-full object-cover" />
                    {!r.active && (
                      <span className="absolute left-2 top-2 rounded bg-red-500/80 px-2 py-0.5 text-[10px] font-bold uppercase">off</span>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="truncate text-sm font-semibold">{r.title}</div>
                    <div className="flex gap-1">
                      <button className="btn-ghost flex-1 !py-1 !text-[11px]" onClick={() => toggle(r.id, !r.active)}>
                        {r.active ? "Despublicar" : "Publicar"}
                      </button>
                      <button className="btn-ghost !py-1 !text-[11px] !text-red-400" onClick={() => remove(r.id)}>Excluir</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
