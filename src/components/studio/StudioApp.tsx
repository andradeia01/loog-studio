"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CATEGORY_LABEL,
  Consultant,
  ConsultantSchema,
  Template,
  TemplateCategory,
} from "@/lib/types";
import { loadConsultant, saveConsultant } from "@/lib/storage";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ConsultantForm } from "./ConsultantForm";
import { PhotoUploader } from "./PhotoUploader";
import { TemplateGallery } from "./TemplateGallery";
import { TemplatePreview } from "./TemplatePreview";
import { ReadyArtsGallery, type ReadyArt, type ReadyFolder } from "./ReadyArtsGallery";
import { cn } from "@/lib/utils";

const DEFAULT_CONSULTANT: Consultant = {
  name: "",
  phone: "",
  instagram: "",
  city: "",
  photoDataUrl: null,
};

const CATEGORIES: { key: TemplateCategory | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "institucional", label: CATEGORY_LABEL.institucional },
  { key: "vendas", label: CATEGORY_LABEL.vendas },
  { key: "protecao", label: CATEGORY_LABEL.protecao },
  { key: "recrutamento", label: CATEGORY_LABEL.recrutamento },
  { key: "stories", label: CATEGORY_LABEL.stories },
  { key: "feed", label: CATEGORY_LABEL.feed },
];

interface Props {
  initialTemplates: Template[];
  readyArts: ReadyArt[];
  readyFolders?: ReadyFolder[];
  consultantSeed: { fullName?: string; phone?: string; instagram?: string; city?: string } | null;
  authEnabled: boolean;
}

type Tab = "ready" | "custom";

export function StudioApp({ initialTemplates, readyArts, readyFolders = [], consultantSeed, authEnabled }: Props) {
  const [tab, setTab] = useState<Tab>(readyArts.length > 0 ? "ready" : "custom");

  const [consultant, setConsultant] = useState<Consultant>(DEFAULT_CONSULTANT);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<TemplateCategory | "todos">("todos");
  const [selected, setSelected] = useState<Template | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = loadConsultant();
    const seed: Consultant = {
      ...DEFAULT_CONSULTANT,
      ...(stored ?? {}),
      ...(consultantSeed
        ? {
            name: consultantSeed.fullName ?? stored?.name ?? "",
            phone: consultantSeed.phone ?? stored?.phone ?? "",
            instagram: consultantSeed.instagram ?? stored?.instagram ?? null,
            city: consultantSeed.city ?? stored?.city ?? null,
          }
        : {}),
    };
    setConsultant(seed);
    setReady(true);
  }, [consultantSeed]);

  useEffect(() => {
    if (!ready) return;
    saveConsultant(consultant);
  }, [consultant, ready]);

  const filtered = useMemo(() => {
    if (category === "todos") return initialTemplates;
    return initialTemplates.filter((t) => t.category === category);
  }, [category, initialTemplates]);

  const dataOk = ConsultantSchema.safeParse(consultant).success;

  async function handleGenerate() {
    if (!selected || !dataOk) return;
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlug: selected.slug, consultant }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `LOOG-${selected.slug}.png`;
      await deliverBlob(blob, filename);
    } catch (err) {
      console.error(err);
      alert("Não foi possível gerar sua arte. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-loog-border/60 bg-loog-bg/70 backdrop-blur">
        <div className="container-loog flex items-center justify-between py-4">
          <Link href="/" className="inline-flex">
            <LoogLogo className="h-8" priority />
          </Link>
          <div className="flex items-center gap-2">
            {authEnabled && <LogoutButton className="!py-2 !px-3 !text-xs" />}
          </div>
        </div>
      </header>

      <section className="container-loog pt-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          {consultant.name ? `Olá, ${consultant.name.split(" ")[0]} 👋` : "Bem-vindo, consultor LOOG"}
        </h1>
        <p className="mt-1 text-loog-muted">Escolha uma arte pronta ou personalize com seus dados.</p>

        <div className="mt-6 inline-flex rounded-2xl border border-loog-border bg-loog-panel p-1">
          <button
            onClick={() => setTab("ready")}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === "ready" ? "bg-loog-brand text-white shadow-glow" : "text-loog-muted hover:text-white",
            )}
          >
            Prontas pra baixar
            {readyArts.length > 0 && (
              <span className="ml-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px]">{readyArts.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab("custom")}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === "custom" ? "bg-loog-brand text-white shadow-glow" : "text-loog-muted hover:text-white",
            )}
          >
            Personalizar
          </button>
        </div>
      </section>

      {tab === "ready" ? (
        <section className="container-loog mt-6">
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Artes prontas</h2>
                <p className="text-xs text-loog-muted/80">Baixe direto — sem editar nada.</p>
              </div>
              <span className="text-xs text-loog-muted">{readyArts.length} disponíveis</span>
            </div>
            {readyArts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
                Nenhuma arte pronta publicada ainda. Passe pra aba <b>Personalizar</b> e crie a sua.
              </div>
            ) : (
              <ReadyArtsGallery arts={readyArts} folders={readyFolders} />
            )}
          </div>
        </section>
      ) : (
        <section className="container-loog mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-loog-muted">Seus dados</h2>
              <ConsultantForm value={consultant} onChange={setConsultant} />
            </div>
            <div className="card p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-loog-muted">Sua foto</h2>
              <PhotoUploader
                value={consultant.photoDataUrl ?? null}
                onChange={(dataUrl) => setConsultant((c) => ({ ...c, photoDataUrl: dataUrl }))}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Escolha sua arte</h2>
                <span className="text-xs text-loog-muted">{filtered.length} artes</span>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.key} onClick={() => setCategory(c.key)} className={category === c.key ? "chip-active" : "chip"}>
                    {c.label}
                  </button>
                ))}
              </div>
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-loog-border p-8 text-center text-loog-muted">
                  Nenhuma arte disponível ainda.
                </div>
              ) : (
                <TemplateGallery templates={filtered} selectedSlug={selected?.slug} onSelect={setSelected} />
              )}
            </div>

            {selected && (
              <div className="card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Prévia</h2>
                  <button className="text-xs text-loog-muted hover:text-white" onClick={() => setSelected(null)}>fechar</button>
                </div>
                <TemplatePreview template={selected} consultant={consultant} />
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button onClick={handleGenerate} disabled={!dataOk || loading} className="btn-primary flex-1">
                    {loading ? "Gerando…" : "Gerar minha arte"}
                  </button>
                  <button className="btn-ghost" onClick={() => setSelected(null)}>Escolher outra</button>
                </div>
                {!dataOk && <p className="mt-3 text-xs text-loog-muted">Preencha nome e telefone para liberar a geração.</p>}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

async function deliverBlob(blob: Blob, filename: string) {
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> })
      : null;
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  const canShare = !!nav?.canShare && nav.canShare({ files: [file] });
  if (canShare && nav?.share) {
    try {
      await nav.share({ files: [file], title: "Minha arte LOOG" });
      return;
    } catch {
      // fallback pro download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
