"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type Tab = "status" | "leads" | "kanban";

interface SdrStatus {
  connected: boolean;
  phoneNumber: string | null;
  channelName: string | null;
  qrCode: string | null;
  stats: {
    totalLeads: number;
    cotacoesHoje: number;
    aguardandoResposta: number;
    fechamentos: number;
  };
}

interface LeadConversation {
  id: string;
  name: string;
  phone: string;
  lastMessage: string;
  lastAt: string;
  tags: string[];
  stage: KanbanStage;
}

type KanbanStage = "novo" | "cotado" | "negociando" | "pago" | "perdido";

const KANBAN_META: Record<KanbanStage, { label: string; cls: string; emoji: string }> = {
  novo:       { label: "Novo",        cls: "bg-sky-500/15 text-sky-300 border-sky-500/40",       emoji: "🆕" },
  cotado:     { label: "Cotado",      cls: "bg-amber-500/15 text-amber-300 border-amber-500/40", emoji: "💰" },
  negociando: { label: "Negociando",  cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40", emoji: "🤝" },
  pago:       { label: "Pago",        cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40", emoji: "✅" },
  perdido:    { label: "Perdido",     cls: "bg-gray-500/15 text-gray-400 border-gray-500/40",   emoji: "❌" },
};

export function SdrPane() {
  const [tab, setTab] = useState<Tab>("status");
  const [status, setStatus] = useState<SdrStatus | null>(null);
  const [leads, setLeads] = useState<LeadConversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Polling simples: refaz status a cada 10s pra pegar QR → conectado
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [s, l] = await Promise.all([
          fetch("/api/sdr/status").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/sdr/leads").then((r) => (r.ok ? r.json() : [])),
        ]);
        if (!alive) return;
        setStatus(s);
        setLeads(Array.isArray(l) ? l : []);
      } catch {
        /* silencioso */
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-3xl border border-loog-border bg-gradient-to-br from-green-500/20 via-emerald-500/5 to-transparent p-6 sm:p-8"
      >
        <div className="relative z-10 flex items-start gap-4">
          <div className="shrink-0 text-5xl sm:text-6xl">💬</div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">SDR WhatsApp</h2>
            <p className="mt-1 text-sm text-loog-muted sm:text-base">
              Lead manda placa + nome + telefone no WhatsApp. Tavinho responde na hora, puxa cotação do Sivisweb e devolve a mensagem oficial LOOG. Você acompanha ao vivo aqui.
            </p>
            <ConnectionBadge status={status} loading={loading} />
          </div>
        </div>
        <div className="pointer-events-none absolute -right-8 -bottom-8 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
      </motion.div>

      {/* TABS */}
      <nav className="flex gap-2 border-b border-loog-border/60">
        {([
          { k: "status" as const, label: "Conexão", icon: "📡", badge: undefined as number | undefined },
          { k: "leads" as const, label: "Leads", icon: "👥", badge: leads.length as number | undefined },
          { k: "kanban" as const, label: "Pipeline", icon: "📊", badge: undefined as number | undefined },
        ]).map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k as Tab)}
            className={cn(
              "relative flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition",
              tab === t.k
                ? "border-loog-brand text-loog-text"
                : "border-transparent text-loog-muted hover:text-loog-text"
            )}
          >
            <span>{t.icon}</span>
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="rounded-full bg-loog-brand/20 px-1.5 py-px text-[10px] text-loog-brand">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* CONTEÚDO */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "status" && <StatusTab status={status} loading={loading} />}
          {tab === "leads" && <LeadsTab leads={leads} loading={loading} />}
          {tab === "kanban" && <KanbanTab leads={leads} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// CONEXÃO (QR + status)
// ──────────────────────────────────────────────────────────────────
function StatusTab({ status, loading }: { status: SdrStatus | null; loading: boolean }) {
  if (loading) return <SkeletonCard label="Buscando status da conexão..." />;

  const connected = status?.connected ?? false;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Card QR / status */}
      <div className="rounded-2xl border border-loog-border bg-loog-panel/60 p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-loog-muted">
          Canal WhatsApp
        </h3>

        {connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="font-bold text-emerald-300">Conectado</span>
            </div>
            <div className="text-sm text-loog-muted">
              Número: <span className="font-mono text-loog-text">{status?.phoneNumber ?? "—"}</span>
            </div>
            <div className="text-sm text-loog-muted">
              Canal: <span className="text-loog-text">{status?.channelName ?? "LOOG WhatsApp"}</span>
            </div>
          </div>
        ) : status?.qrCode ? (
          <div className="space-y-3">
            <p className="text-sm text-loog-muted">
              Escaneie o QR code abaixo com o WhatsApp do celular LOOG dedicado.
            </p>
            <div className="flex justify-center rounded-xl bg-white p-4">
              {/* QR vem como data URL (image/png) ou URL remota */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={status.qrCode}
                alt="QR Code WhatsApp"
                className="h-56 w-56"
              />
            </div>
            <p className="text-center text-xs text-loog-muted">
              WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="font-bold text-amber-300">Aguardando canal</span>
            </div>
            <p className="text-sm text-loog-muted">
              O canal WhatsApp Waha ainda não foi criado no Zaia Endless.
              Assim que estiver criado, o QR code aparece aqui.
            </p>
            <a
              href="https://loog-protecao-veicular-0646.zaia.company/workspace/crm/channels"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-loog-brand/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-loog-brand"
            >
              Abrir Zaia → Canais ↗
            </a>
          </div>
        )}
      </div>

      {/* Card stats */}
      <div className="rounded-2xl border border-loog-border bg-loog-panel/60 p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-loog-muted">
          Hoje
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Leads total" value={status?.stats.totalLeads ?? 0} />
          <Stat label="Cotações hoje" value={status?.stats.cotacoesHoje ?? 0} />
          <Stat label="Aguardando" value={status?.stats.aguardandoResposta ?? 0} />
          <Stat label="Fechamentos" value={status?.stats.fechamentos ?? 0} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-loog-bg/60 p-3">
      <div className="text-2xl font-extrabold text-loog-text">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">{label}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// LEADS
// ──────────────────────────────────────────────────────────────────
function LeadsTab({ leads, loading }: { leads: LeadConversation[]; loading: boolean }) {
  if (loading) return <SkeletonCard label="Carregando conversas..." />;
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-loog-border p-10 text-center">
        <div className="text-4xl">💬</div>
        <h3 className="mt-3 font-display text-lg font-bold">Nenhuma conversa ainda</h3>
        <p className="mt-1 text-sm text-loog-muted">
          Quando um lead chamar no WhatsApp, a conversa aparece aqui em tempo real.
        </p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-loog-border/50 rounded-2xl border border-loog-border bg-loog-panel/60">
      {leads.map((l) => (
        <div key={l.id} className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-bold text-emerald-300">
            {l.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold text-loog-text">{l.name}</span>
              <span className="font-mono text-xs text-loog-muted">{l.phone}</span>
              <StageBadge stage={l.stage} />
            </div>
            <p className="mt-0.5 truncate text-sm text-loog-muted">{l.lastMessage}</p>
          </div>
          <div className="shrink-0 text-xs text-loog-muted">{l.lastAt}</div>
        </div>
      ))}
    </div>
  );
}

function StageBadge({ stage }: { stage: KanbanStage }) {
  const meta = KANBAN_META[stage];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest", meta.cls)}>
      {meta.emoji} {meta.label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────
// KANBAN
// ──────────────────────────────────────────────────────────────────
function KanbanTab({ leads }: { leads: LeadConversation[] }) {
  const stages = Object.keys(KANBAN_META) as KanbanStage[];
  return (
    <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-5">
      {stages.map((stage) => {
        const items = leads.filter((l) => l.stage === stage);
        const meta = KANBAN_META[stage];
        return (
          <div key={stage} className="min-w-[220px] rounded-2xl border border-loog-border bg-loog-panel/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest", meta.cls)}>
                {meta.emoji} {meta.label}
              </span>
              <span className="text-xs text-loog-muted">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-loog-border/50 p-3 text-center text-xs text-loog-muted">
                  Vazio
                </div>
              ) : (
                items.map((l) => (
                  <div key={l.id} className="rounded-lg bg-loog-bg/60 p-2.5">
                    <div className="truncate text-sm font-bold text-loog-text">{l.name}</div>
                    <div className="font-mono text-[10px] text-loog-muted">{l.phone}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────
function ConnectionBadge({ status, loading }: { status: SdrStatus | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-loog-muted/15 px-3 py-1 text-xs font-semibold text-loog-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-loog-muted" /> Carregando...
      </div>
    );
  }
  if (status?.connected) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> WhatsApp conectado ao Tavinho
      </div>
    );
  }
  return (
    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
      <span className="h-2 w-2 rounded-full bg-amber-400" /> Aguardando conexão
    </div>
  );
}

function SkeletonCard({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-loog-border bg-loog-panel/40 p-10 text-center text-sm text-loog-muted">
      {label}
    </div>
  );
}
