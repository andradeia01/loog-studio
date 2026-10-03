"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CATEGORY_LABEL,
  Consultant,
  ConsultantSchema,
  Template,
  TemplateCategory,
} from "@/lib/types";
import { loadConsultant, saveConsultant } from "@/lib/storage";
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
import { PlacaStudio } from "./PlacaStudio";
import { StudioShell, type Mundo, type MundoKey } from "./StudioShell";
import { StudioHome } from "./StudioHome";

const DEFAULT_CONSULTANT: Consultant = {
  name: "", phone: "", instagram: "", city: "", photoDataUrl: null,
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

export function StudioApp({
  initialTemplates, readyArts, readyFolders = [], readyVideos = [],
  readyVideoFolders = [], consultantSeed, authEnabled, userId = null,
}: Props) {
  const [activeMundo, setActiveMundo] = useState<MundoKey>("home");
  const [activeSub, setActiveSub] = useState<string | null>(null);

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

  // ============== MAPA DOS MUNDOS ==============
  const mundos: Mundo[] = useMemo(() => [
    {
      key: "home",
      label: "Início",
      icon: "🏠",
      short: "Visão geral e atalhos",
      color: "from-loog-brand/20 to-transparent",
      subs: [],
    },
    {
      key: "vendas",
      label: "Vendas",
      icon: "💼",
      short: "Cotação, placa, PDF oficial LOOG",
      color: "from-blue-500/20 to-cyan-500/5",
      subs: [
        { key: "placa", label: "Cotação por Placa", icon: "🚗" },
      ],
    },
    {
      key: "conteudo",
      label: "Conteúdo",
      icon: "🎨",
      short: "Artes e vídeos prontos ou personalizados",
      color: "from-pink-500/20 to-rose-500/5",
      subs: [
        { key: "artes", label: "Artes prontas", icon: "📷", badge: readyArts.length },
        { key: "videos", label: "Vídeos prontos", icon: "🎬", badge: readyVideos.length },
        { key: "personalizar", label: "Personalizar", icon: "✏️" },
        { key: "tweet", label: "Tweet Post", icon: "🐦" },
      ],
    },
    {
      key: "ia",
      label: "Estúdio IA",
      icon: "🤖",
      short: "Copy, imagens e voz com GPT-4o e ElevenLabs",
      color: "from-violet-500/20 to-fuchsia-500/5",
      subs: [
        { key: "copy", label: "Copy IA", icon: "✨" },
        { key: "imagens", label: "Imagens IA", icon: "🎨" },
        { key: "voz", label: "Voz IA", icon: "🎙️" },
      ],
    },
    {
      key: "fidelidade",
      label: "Fidelidade",
      icon: "🔥",
      short: "Check-ins, streak, ranking e pontos",
      color: "from-amber-500/20 to-orange-500/5",
      subs: [],
    },
    {
      key: "producao",
      label: "Produção",
      icon: "🎬",
      short: "Editor e Fábrica de Reels",
      color: "from-emerald-500/20 to-teal-500/5",
      subs: [],
      externalLinks: [
        { href: "/studio/reels", label: "Fábrica de Reels", icon: "🎞️" },
        { href: "/studio/editor", label: "Editor de Vídeo", icon: "✂️" },
      ],
    },
  ], [readyArts.length, readyVideos.length]);

  const handleNavigate = useCallback((m: MundoKey, s?: string | null) => {
    setActiveMundo(m);
    setActiveSub(s ?? null);
  }, []);

  return (
    <StudioShell
      mundos={mundos}
      activeMundo={activeMundo}
      activeSub={activeSub}
      onNavigate={handleNavigate}
      consultantName={consultant.name}
      authEnabled={authEnabled}
    >
      {renderConteudo({
        activeMundo, activeSub, mundos,
        consultant, setConsultant, dataOk,
        category, setCategory, filtered,
        readyArts, readyFolders, readyVideos, readyVideoFolders,
        userId, onNavigate: handleNavigate,
      })}
    </StudioShell>
  );
}

// ============== RENDER DE CADA MUNDO/SUB ==============
interface RenderOpts {
  activeMundo: MundoKey;
  activeSub: string | null;
  mundos: Mundo[];
  consultant: Consultant;
  setConsultant: (c: Consultant | ((prev: Consultant) => Consultant)) => void;
  dataOk: boolean;
  category: TemplateCategory | "todos";
  setCategory: (c: TemplateCategory | "todos") => void;
  filtered: Template[];
  readyArts: ReadyArt[];
  readyFolders: ReadyFolder[];
  readyVideos: ReadyVideo[];
  readyVideoFolders: VideoFolder[];
  userId: string | null;
  onNavigate: (m: MundoKey, s?: string | null) => void;
}

function renderConteudo(opts: RenderOpts) {
  const { activeMundo, activeSub } = opts;

  if (activeMundo === "home") {
    return (
      <StudioHome
        mundos={opts.mundos}
        consultantName={opts.consultant.name}
        onNavigate={opts.onNavigate}
        stats={{ artesCount: opts.readyArts.length }}
      />
    );
  }

  if (activeMundo === "vendas" && activeSub === "placa") {
    return <PlacaStudio />;
  }

  if (activeMundo === "conteudo") {
    if (activeSub === "artes") return <SectionCard title="Artes prontas" subtitle="Baixe direto, sem editar nada.">
      {opts.readyArts.length === 0
        ? <EmptyState icon="📷" text="Nenhuma arte publicada ainda. Passe pra Personalizar e crie a sua." />
        : <ReadyArtsGallery arts={opts.readyArts} folders={opts.readyFolders} />
      }
    </SectionCard>;
    if (activeSub === "videos") return <SectionCard title="Vídeos prontos" subtitle="Reels prontos pra postar.">
      {opts.readyVideos.length === 0
        ? <EmptyState icon="🎬" text="Nenhum vídeo publicado. Use a Fábrica de Reels enquanto isso." />
        : <ReadyVideosGallery videos={opts.readyVideos} folders={opts.readyVideoFolders} />
      }
    </SectionCard>;
    if (activeSub === "personalizar") return <PersonalizarPane {...opts} />;
    if (activeSub === "tweet") return <TweetStudio />;
  }

  if (activeMundo === "ia") {
    if (activeSub === "copy") return <CopyStudio />;
    if (activeSub === "imagens") return <ImagesStudio />;
    if (activeSub === "voz") return <VoiceStudio />;
  }

  if (activeMundo === "fidelidade") {
    return <FidelityDashboard myId={opts.userId} />;
  }

  if (activeMundo === "producao") {
    return <ProducaoHub />;
  }

  // fallback
  return (
    <div className="rounded-xl border border-dashed border-loog-border p-8 text-center text-loog-muted">
      Selecione uma opção no menu lateral.
    </div>
  );
}

function PersonalizarPane(opts: RenderOpts) {
  const { consultant, setConsultant, dataOk, category, setCategory, filtered } = opts;
  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
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
  );
}

function ProducaoHub() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <a href="/studio/reels" className="card group block p-6 transition hover:border-loog-brand/40">
        <div className="mb-3 text-4xl">🎞️</div>
        <h3 className="font-display text-lg font-bold">Fábrica de Reels</h3>
        <p className="mt-1 text-xs text-loog-muted">Transforme vídeos em reels prontos pra postar, com cortes automáticos e marca d&apos;água LOOG.</p>
        <span className="mt-3 inline-flex text-xs text-loog-brand group-hover:translate-x-1">Abrir →</span>
      </a>
      <a href="/studio/editor" className="card group block p-6 transition hover:border-loog-brand/40">
        <div className="mb-3 text-4xl">✂️</div>
        <h3 className="font-display text-lg font-bold">Editor de Vídeo</h3>
        <p className="mt-1 text-xs text-loog-muted">Timeline, trim, trilha sonora, texto overlay e exportação com marca LOOG.</p>
        <span className="mt-3 inline-flex text-xs text-loog-brand group-hover:translate-x-1">Abrir →</span>
      </a>
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">{title}</h2>
        {subtitle && <p className="text-xs text-loog-muted/80">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
      <div className="mb-2 text-3xl">{icon}</div>
      {text}
    </div>
  );
}
