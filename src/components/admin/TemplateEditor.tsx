"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CATEGORY_LABEL,
  Consultant,
  FORMAT_DIMENSIONS,
  FORMAT_LABEL,
  Layer,
  Template,
  TemplateCategory,
  TemplateFormat,
  TextLayer,
} from "@/lib/types";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { slugify } from "@/lib/utils";
import { DraggableBox } from "./DraggableBox";
import { TemplatePreview } from "@/components/studio/TemplatePreview";

interface Props {
  mode: "create" | "edit";
  initial?: Template;
}

const DEMO: Consultant = {
  name: "João da Silva",
  phone: "(24) 99999-9999",
  instagram: "@joaosilva",
  city: "Volta Redonda",
  photoDataUrl: null,
};

export function TemplateEditor({ mode, initial }: Props) {
  const router = useRouter();
  const [template, setTemplate] = useState<Template>(
    () => initial ?? blankTemplate("feed-4x5"),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidthPx, setCanvasWidthPx] = useState(600);

  // observa a largura do canvas para calcular scale
  useEffect(() => {
    if (!canvasRef.current) return;
    const el = canvasRef.current;
    const ro = new ResizeObserver(() => setCanvasWidthPx(el.clientWidth));
    ro.observe(el);
    setCanvasWidthPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = canvasWidthPx / template.width;
  const canvasHeight = template.height * scale;
  const bg = template.layers.find((l) => l.type === "background");
  const selected = template.layers.find((l) => l.id === selectedId) ?? null;

  function patchTemplate(patch: Partial<Template>) {
    setTemplate((t) => ({ ...t, ...patch }));
  }

  function patchLayer(id: string, patch: Partial<Layer>) {
    setTemplate((t) => ({
      ...t,
      layers: t.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
    }));
  }

  function addLayer(kind: Layer["type"]) {
    const id = `${kind}-${Math.random().toString(36).slice(2, 8)}`;
    const centerX = template.width / 2;
    const centerY = template.height / 2;
    let layer: Layer;
    if (kind === "consultantPhoto") {
      const w = template.width * 0.35;
      const h = w;
      layer = {
        id,
        type: "consultantPhoto",
        enabled: true,
        x: centerX - w / 2,
        y: centerY - h / 2,
        width: w,
        height: h,
        fit: "cover",
        borderRadius: 0,
      };
    } else if (kind === "text") {
      const w = template.width * 0.7;
      layer = {
        id,
        type: "text",
        enabled: true,
        source: "consultantName",
        x: centerX - w / 2,
        y: centerY,
        width: w,
        height: 80,
        style: {
          fontFamily: "Inter",
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: 0,
          lineHeight: 1.15,
          color: "#FFFFFF",
          align: "left",
          uppercase: false,
          minFontSize: 20,
        },
      };
    } else if (kind === "image") {
      layer = { id, type: "image", enabled: true, src: "", x: 0, y: 0 };
    } else {
      layer = { id, type: "background", enabled: true, src: "" };
    }
    setTemplate((t) => ({ ...t, layers: [...t.layers, layer] }));
    setSelectedId(id);
  }

  function removeLayer(id: string) {
    setTemplate((t) => ({ ...t, layers: t.layers.filter((l) => l.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }

  function moveLayer(id: string, dir: -1 | 1) {
    setTemplate((t) => {
      const idx = t.layers.findIndex((l) => l.id === id);
      if (idx < 0) return t;
      const next = [...t.layers];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return t;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return { ...t, layers: next };
    });
  }

  async function uploadAsset(file: File, kind: "background" | "foreground" | "thumbnail") {
    const slug = template.slug || slugify(template.name || `template-${Date.now()}`);
    if (!template.slug) patchTemplate({ slug });
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slug", slug);
    fd.append("kind", kind);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      alert(`Falha no upload: ${res.status}`);
      return null;
    }
    return (await res.json()) as { url: string; width: number; height: number };
  }

  async function onBackgroundFile(file: File) {
    const up = await uploadAsset(file, "background");
    if (!up) return;
    const width = up.width || template.width;
    const height = up.height || template.height;
    setTemplate((t) => {
      const withoutBg = t.layers.filter((l) => l.type !== "background");
      return {
        ...t,
        width,
        height,
        layers: [
          { id: "bg", type: "background", enabled: true, src: up.url },
          ...withoutBg,
        ],
      };
    });
  }

  async function onForegroundFile(file: File) {
    const up = await uploadAsset(file, "foreground");
    if (!up) return;
    const id = `fg-${Math.random().toString(36).slice(2, 6)}`;
    setTemplate((t) => ({
      ...t,
      layers: [
        ...t.layers,
        {
          id,
          type: "image",
          enabled: true,
          src: up.url,
          x: 0,
          y: 0,
          width: t.width,
          height: t.height,
        },
      ],
    }));
    setSelectedId(id);
  }

  async function onThumbnailFile(file: File) {
    const up = await uploadAsset(file, "thumbnail");
    if (up) patchTemplate({ thumbnail: up.url });
  }

  async function handleSave() {
    if (!template.name.trim()) return alert("Dê um nome ao template.");
    if (!template.slug) patchTemplate({ slug: slugify(template.name) });
    setSaving(true);
    try {
      const url = mode === "create" ? "/api/templates" : `/api/templates/${template.slug}`;
      const method = mode === "create" ? "POST" : "PUT";
      const body: Template = {
        ...template,
        slug: template.slug || slugify(template.name),
        thumbnail: template.thumbnail || bg?.src || "",
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt);
      }
      router.push(`/admin/${body.slug}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar. Confira o console.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlug: template.slug, consultant: DEMO }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      console.error(err);
      alert("Salve o template antes de testar.");
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir o template "${template.name}"? Essa ação é irreversível.`)) return;
    const res = await fetch(`/api/templates/${template.slug}`, { method: "DELETE" });
    if (res.ok) router.push("/admin");
    else alert("Falha ao excluir.");
  }

  const boxLayers = template.layers.filter(
    (l) => l.type === "consultantPhoto" || l.type === "text" || l.type === "image",
  );

  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-loog-border/60 bg-loog-bg/70 backdrop-blur">
        <div className="container-loog flex items-center justify-between py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm text-loog-muted hover:text-white">
              ← voltar
            </Link>
            <LoogLogo className="h-7" priority />
          </div>
          <div className="flex gap-2">
            {mode === "edit" && (
              <>
                <button onClick={handleTest} className="btn-ghost !py-2 !text-xs" disabled={testing}>
                  {testing ? "Testando…" : "Testar template"}
                </button>
                <button onClick={handleDelete} className="btn-ghost !py-2 !text-xs !text-red-400">
                  Excluir
                </button>
              </>
            )}
            <button onClick={handleSave} className="btn-primary !py-2 !text-xs" disabled={saving}>
              {saving ? "Salvando…" : "Salvar template"}
            </button>
            <LogoutButton className="!py-2 !px-3 !text-xs" />
          </div>
        </div>
      </header>

      <section className="container-loog mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Canvas */}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-loog-muted">Prévia editável</div>
              <div className="text-sm font-semibold">
                {template.width} × {template.height}px · {FORMAT_LABEL[template.format]}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost !py-2 !text-xs" onClick={() => addLayer("consultantPhoto")}>
                + Foto
              </button>
              <button className="btn-ghost !py-2 !text-xs" onClick={() => addLayer("text")}>
                + Texto
              </button>
            </div>
          </div>

          <div
            ref={canvasRef}
            className="relative overflow-hidden rounded-lg border border-loog-border bg-black"
            style={{ height: canvasHeight || 400 }}
            onPointerDown={() => setSelectedId(null)}
          >
            {bg?.type === "background" && bg.src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bg.src}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
              />
            )}
            {/* renderiza foreground images entre bg e boxes */}
            {template.layers
              .filter((l) => l.type === "image")
              .map((l) => (
                <img
                  key={l.id}
                  src={l.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute"
                  style={{
                    left: (l.x ?? 0) * scale,
                    top: (l.y ?? 0) * scale,
                    width: (l.width ?? template.width) * scale,
                    height: (l.height ?? template.height) * scale,
                  }}
                />
              ))}
            {boxLayers.map((l) => {
              if (l.type === "image") {
                return (
                  <DraggableBox
                    key={l.id}
                    rect={{
                      x: l.x ?? 0,
                      y: l.y ?? 0,
                      width: l.width ?? template.width,
                      height: l.height ?? template.height,
                    }}
                    scale={scale}
                    active={selectedId === l.id}
                    onSelect={() => setSelectedId(l.id)}
                    label="overlay"
                    color="#8B5CF6"
                    onChange={(r) => patchLayer(l.id, { x: r.x, y: r.y, width: r.width, height: r.height })}
                  />
                );
              }
              if (l.type === "consultantPhoto") {
                return (
                  <DraggableBox
                    key={l.id}
                    rect={{ x: l.x, y: l.y, width: l.width, height: l.height }}
                    scale={scale}
                    active={selectedId === l.id}
                    onSelect={() => setSelectedId(l.id)}
                    label="foto"
                    color="#1668E3"
                    onChange={(r) => patchLayer(l.id, r)}
                  />
                );
              }
              // text
              return (
                <DraggableBox
                  key={l.id}
                  rect={{ x: l.x, y: l.y, width: l.width, height: l.height ?? 80 }}
                  scale={scale}
                  active={selectedId === l.id}
                  onSelect={() => setSelectedId(l.id)}
                  label={labelForTextSource(l.source)}
                  color="#F59E0B"
                  onChange={(r) => patchLayer(l.id, r as Partial<Layer>)}
                />
              );
            })}
          </div>
        </div>

        {/* Painel de propriedades */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-loog-muted">
              Template
            </h2>
            <div className="space-y-3">
              <div>
                <label className="label mb-1.5">Nome</label>
                <input
                  className="input"
                  value={template.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    patchTemplate({
                      name,
                      slug: template.slug || slugify(name),
                    });
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label mb-1.5">Slug</label>
                  <input
                    className="input"
                    value={template.slug}
                    onChange={(e) => patchTemplate({ slug: slugify(e.target.value) })}
                    disabled={mode === "edit"}
                  />
                </div>
                <div>
                  <label className="label mb-1.5">Categoria</label>
                  <select
                    className="input"
                    value={template.category}
                    onChange={(e) => patchTemplate({ category: e.target.value as TemplateCategory })}
                  >
                    {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label mb-1.5">Formato</label>
                <select
                  className="input"
                  value={template.format}
                  onChange={(e) => {
                    const fmt = e.target.value as TemplateFormat;
                    const d = FORMAT_DIMENSIONS[fmt];
                    patchTemplate({ format: fmt, width: d.width, height: d.height });
                  }}
                >
                  {Object.entries(FORMAT_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-loog-brand"
                  checked={template.active}
                  onChange={(e) => patchTemplate({ active: e.target.checked })}
                />
                Publicado para consultores
              </label>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">
              Assets
            </h2>
            <div className="space-y-3 text-sm">
              <FilePicker label="Arte de fundo (background)" accept="image/*" onFile={onBackgroundFile} current={bg?.type === "background" ? bg.src : ""} />
              <FilePicker label="Overlay / foreground (opcional)" accept="image/*" onFile={onForegroundFile} />
              <FilePicker label="Thumbnail (miniatura da galeria)" accept="image/*" onFile={onThumbnailFile} current={template.thumbnail} />
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">
              Camadas
            </h2>
            <ul className="space-y-2">
              {template.layers.map((l) => (
                <li
                  key={l.id}
                  onClick={() => setSelectedId(l.id)}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                    selectedId === l.id
                      ? "border-loog-brand bg-loog-brand/10"
                      : "border-loog-border bg-loog-panel"
                  }`}
                >
                  <div>
                    <div className="font-semibold uppercase tracking-wider">
                      {layerLabel(l)}
                    </div>
                    <div className="text-loog-muted">{l.type}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="btn-ghost !p-1 !text-xs" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }} aria-label="Trazer para trás">↓</button>
                    <button className="btn-ghost !p-1 !text-xs" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }} aria-label="Trazer para frente">↑</button>
                    <button className="btn-ghost !p-1 !text-xs !text-red-400" onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }}>✕</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {selected && (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">
                Propriedades: {layerLabel(selected)}
              </h2>
              <LayerProps
                layer={selected}
                onChange={(patch) => patchLayer(selected.id, patch)}
              />
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">
              Preview com dados de teste
            </h2>
            <TemplatePreview template={template} consultant={DEMO} />
          </div>
        </div>
      </section>
    </main>
  );
}

function blankTemplate(format: TemplateFormat): Template {
  const d = FORMAT_DIMENSIONS[format];
  return {
    id: `t-${Date.now()}`,
    slug: "",
    name: "",
    category: "vendas",
    format,
    width: d.width,
    height: d.height,
    thumbnail: "",
    active: true,
    layers: [],
  };
}

function layerLabel(l: Layer): string {
  if (l.type === "text") return labelForTextSource(l.source);
  if (l.type === "consultantPhoto") return "Foto";
  if (l.type === "background") return "Fundo";
  return "Overlay";
}

function labelForTextSource(source: TextLayer["source"]): string {
  switch (source) {
    case "consultantName":
      return "Nome";
    case "consultantPhone":
      return "Telefone";
    case "consultantInstagram":
      return "Instagram";
    case "consultantCity":
      return "Cidade";
    default:
      return "Texto";
  }
}

function FilePicker({
  label,
  accept,
  onFile,
  current,
}: {
  label: string;
  accept: string;
  onFile: (f: File) => void | Promise<void>;
  current?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="label mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <button className="btn-ghost flex-1 !py-2 !text-xs" onClick={() => ref.current?.click()}>
          {current ? "Trocar arquivo" : "Selecionar arquivo"}
        </button>
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="" className="h-10 w-10 rounded border border-loog-border object-cover" />
        )}
      </div>
    </div>
  );
}

function LayerProps({
  layer,
  onChange,
}: {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
}) {
  if (layer.type === "text") {
    const s = layer.style;
    const setStyle = (p: Partial<typeof s>) => onChange({ style: { ...s, ...p } } as Partial<Layer>);
    return (
      <div className="space-y-3 text-sm">
        <div>
          <label className="label mb-1.5">Campo</label>
          <select
            className="input"
            value={layer.source}
            onChange={(e) => onChange({ source: e.target.value as TextLayer["source"] } as Partial<Layer>)}
          >
            <option value="consultantName">Nome</option>
            <option value="consultantPhone">Telefone</option>
            <option value="consultantInstagram">Instagram</option>
            <option value="consultantCity">Cidade</option>
            <option value="literal">Texto fixo</option>
          </select>
        </div>
        {layer.source === "literal" && (
          <div>
            <label className="label mb-1.5">Texto</label>
            <input
              className="input"
              value={layer.literal ?? ""}
              onChange={(e) => onChange({ literal: e.target.value } as Partial<Layer>)}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1.5">Fonte</label>
            <select className="input" value={s.fontFamily} onChange={(e) => setStyle({ fontFamily: e.target.value })}>
              <option value="Inter">Inter</option>
              <option value="Space Grotesk">Space Grotesk</option>
              <option value="Arial">Arial</option>
            </select>
          </div>
          <div>
            <label className="label mb-1.5">Cor</label>
            <input
              type="color"
              value={s.color}
              onChange={(e) => setStyle({ color: e.target.value })}
              className="h-11 w-full cursor-pointer rounded-xl border border-loog-border bg-loog-panel"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NumInput label="Tamanho" value={s.fontSize} onChange={(v) => setStyle({ fontSize: v })} min={8} max={220} />
          <NumInput label="Peso" value={s.fontWeight} onChange={(v) => setStyle({ fontWeight: v })} step={100} min={100} max={900} />
          <NumInput label="Mín. auto" value={s.minFontSize} onChange={(v) => setStyle({ minFontSize: v })} min={8} max={220} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NumInput label="Line height" value={s.lineHeight} onChange={(v) => setStyle({ lineHeight: v })} step={0.05} min={0.8} max={3} />
          <NumInput label="Letter spacing" value={s.letterSpacing} onChange={(v) => setStyle({ letterSpacing: v })} step={0.5} />
          <div>
            <label className="label mb-1.5">Alinhar</label>
            <select
              className="input"
              value={s.align}
              onChange={(e) => setStyle({ align: e.target.value as typeof s.align })}
            >
              <option value="left">Esquerda</option>
              <option value="center">Centro</option>
              <option value="right">Direita</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={s.uppercase}
            onChange={(e) => setStyle({ uppercase: e.target.checked })}
            className="h-4 w-4 accent-loog-brand"
          />
          Maiúsculas
        </label>
      </div>
    );
  }

  if (layer.type === "consultantPhoto") {
    return (
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label mb-1.5">Ajuste</label>
            <select
              className="input"
              value={layer.fit}
              onChange={(e) => onChange({ fit: e.target.value as "cover" | "contain" } as Partial<Layer>)}
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
            </select>
          </div>
          <NumInput
            label="Border radius"
            value={layer.borderRadius}
            onChange={(v) => onChange({ borderRadius: v } as Partial<Layer>)}
            min={0}
          />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <NumInput label="X" value={layer.x} onChange={(v) => onChange({ x: v } as Partial<Layer>)} />
          <NumInput label="Y" value={layer.y} onChange={(v) => onChange({ y: v } as Partial<Layer>)} />
          <NumInput label="W" value={layer.width} onChange={(v) => onChange({ width: v } as Partial<Layer>)} />
          <NumInput label="H" value={layer.height} onChange={(v) => onChange({ height: v } as Partial<Layer>)} />
        </div>
      </div>
    );
  }

  if (layer.type === "image") {
    return (
      <div className="grid grid-cols-4 gap-2 text-sm">
        <NumInput label="X" value={layer.x} onChange={(v) => onChange({ x: v } as Partial<Layer>)} />
        <NumInput label="Y" value={layer.y} onChange={(v) => onChange({ y: v } as Partial<Layer>)} />
        <NumInput label="W" value={layer.width ?? 0} onChange={(v) => onChange({ width: v } as Partial<Layer>)} />
        <NumInput label="H" value={layer.height ?? 0} onChange={(v) => onChange({ height: v } as Partial<Layer>)} />
      </div>
    );
  }

  return <div className="text-xs text-loog-muted">Sem propriedades editáveis para essa camada.</div>;
}

function NumInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="label mb-1.5">{label}</label>
      <input
        type="number"
        className="input"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}
