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
import { CustomizeGallery } from "./CustomizeGallery";
import { ReadyArtsGallery, type ReadyArt, type ReadyFolder } from "./ReadyArtsGallery";
import { ReadyVideosGallery, type ReadyVideo, type VideoFolder } from "./ReadyVideosGallery";
import { FidelityDashboard } from "./FidelityDashboard";
import { CopyStudio } from "./CopyStudio";
import { ImagesStudio } from "./ImagesStudio";
import { VoiceStudio } from "./VoiceStudio";
import { TweetStudio } from "./TweetStudio";
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
  readyVideos?: ReadyVideo[];
  readyVideoFolders?: VideoFolder[];
  consultantSeed: { fullName?: string; phone?: string; instagram?: string; city?: string } | null;
  authEnabled: boolean;
  userId?: string | null;
}

type Tab = "ready" | "videos" | "custom" | "tweet" | "copy" | "images" | "voice" | "fidelity";

export function StudioApp({ initialTemplates, readyArts, readyFolders = [], readyVideos = [], readyVideoFolders = [], consultantSeed, authEnabled, userId = null }: Props) {
  const [tab, setTab] = useState<Tab>(readyArts.length > 0 ? "ready" : "custom");

  const [consultant, setConsultant] = useState<Consultant>(DEFAULT_CONSULTANT);
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<TemplateCategory | "todos">("todos");

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

      <section className="container-loog pt-6 sm:pt-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {consultant.name ? `Olá, ${consultant.name.split(" ")[0]}` : "Bem-vindo"}
        </h1>
        <p className="mt-1 text-sm text-loog-muted sm:text-base">
          Movimento conecta o amanhã.
        </p>

        {/* Barra de abas — scroll horizontal em mobile, wrap em desktop */}
        <nav className="mt-5 tabs-scroll sm:mx-0 sm:flex sm:flex-wrap sm:overflow-visible sm:rounded-2xl sm:border sm:border-loog-border sm:bg-loog-panel sm:p-1">
          {[
            { k: "ready" as Tab, label: "Artes prontas", count: readyArts.length, always: true },
            { k: "videos" as Tab, label: "Vídeos prontos", count: readyVideos.length, always: true },
            { k: "custom" as Tab, label: "Personalizar", always: true },
            { k: "tweet" as Tab, label: "Tweet 🐦", always: true },
            { k: "copy" as Tab, label: "Copy IA ✨", authOnly: true },
            { k: "images" as Tab, label: "Imagens IA 🎨", authOnly: true },
            { k: "voice" as Tab, label: "Voz IA 🎙️", authOnly: true },
            { k: "fidelity" as Tab, label: "Fidelidade 🔥", authOnly: true },
          ].filter((t) => t.always || (t.authOnly && authEnabled)).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              className={cn(
                "tab-item",
                tab === t.k ? "bg-loog-brand text-white shadow-glow" : "text-loog-muted hover:text-white",
              )}
            >
              {t.label}
              {t.count ? (
                <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[10px]", tab === t.k ? "bg-black/40" : "bg-white/10")}>{t.count}</span>
              ) : null}
            </button>
          ))}
          <Link href="/studio/editor" className="tab-item text-loog-muted hover:text-white">
            Editor Vídeo 🎬
          </Link>
          <Link href="/studio/reels" className="tab-item text-loog-muted hover:text-white">
            Fábrica de Reels
          </Link>
        </nav>
      </section>

      {tab === "tweet" ? (
        <section className="container-loog mt-6">
          <TweetStudio />
        </section>
      ) : tab === "copy" ? (
        <section className="container-loog mt-6">
          <CopyStudio />
        </section>
      ) : tab === "images" ? (
        <section className="container-loog mt-6">
          <ImagesStudio />
        </section>
      ) : tab === "voice" ? (
        <section className="container-loog mt-6">
          <VoiceStudio />
        </section>
      ) : tab === "fidelity" ? (
        <section className="container-loog mt-6">
          <FidelityDashboard myId={userId} />
        </section>
      ) : tab === "ready" ? (
        <section className="container-loog mt-6">
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Artes prontas</h2>
                <p className="text-xs text-loog-muted/80">Baixe direto, sem editar nada.</p>
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
      ) : tab === "videos" ? (
        <section className="container-loog mt-6">
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Vídeos prontos</h2>
                <p className="text-xs text-loog-muted/80">Reels prontos pra postar direto do celular.</p>
              </div>
              <span className="text-xs text-loog-muted">{readyVideos.length} disponíveis</span>
            </div>
            {readyVideos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
                Nenhum vídeo publicado ainda pelo admin. Enquanto isso, use a <b>Fábrica de Reels</b>.
              </div>
            ) : (
              <ReadyVideosGallery videos={readyVideos} folders={readyVideoFolders} />
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
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Suas artes personalizadas</h2>
                  <p className="text-xs text-loog-muted/80">Cada arte já mostra seus dados aplicados. Selecione várias e baixe tudo de uma vez.</p>
                </div>
                <span className="text-xs text-loog-muted">{filtered.length} disponíveis</span>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.key} type="button" onClick={() => setCategory(c.key)} className={category === c.key ? "chip-active" : "chip"}>
                    {c.label}
                  </button>
                ))}
              </div>
              <CustomizeGallery
                templates={filtered}
                consultant={consultant}
                dataOk={dataOk}
                category={category}
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

