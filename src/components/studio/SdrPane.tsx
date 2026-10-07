"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type Tab = "status" | "chat" | "leads" | "kanban" | "config";

interface SdrStatus {
  connected: boolean;
  phoneNumber: string | null;
  channelName: string | null;
  qrCode: string | null;
  qrExpiresAt: string | null;
  engine: "zaia" | "hub-baileys" | "none";
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
  unread: number;
}

interface ChatMessage {
  id: string;
  from: "lead" | "sdr" | "system";
  text: string;
  at: string;
  audio?: boolean;
}

interface SdrConfig {
  elevenLabsKey: string;
  elevenLabsVoiceId: string;
  claudeKey: string;
  claudeModel: "haiku-4-5" | "sonnet-5-5" | "opus-5-5";
  systemPrompt: string;
  audioStrategy: "nunca" | "estrategico" | "sempre-primeiro";
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
  const [generatingQr, setGeneratingQr] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Polling simples: refaz status a cada 8s pra pegar QR → conectado
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
    const t = setInterval(load, 8_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const handleGenerateQr = async () => {
    setGeneratingQr(true);
    try {
      const res = await fetch("/api/sdr/qr", { method: "POST" });
      if (res.ok) {
        const s = await res.json();
        setStatus(s);
      }
    } finally {
      setGeneratingQr(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Desconectar o WhatsApp e apagar a sessão? Vai gerar um QR Code novo pra você escanear.")) return;
    setResetting(true);
    try {
      await fetch("/api/sdr/reset", { method: "POST" });
      // Força status refresh
      const s = await fetch("/api/sdr/status").then((r) => r.json()).catch(() => null);
      setStatus(s);
      // Gera QR novo logo em seguida
      await handleGenerateQr();
    } finally {
      setResetting(false);
    }
  };

  const unreadCount = leads.reduce((s, l) => s + (l.unread || 0), 0);

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
            <h2 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">SDR WhatsApp — Tavinho IA</h2>
            <p className="mt-1 text-sm text-loog-muted sm:text-base">
              Lead manda placa + nome + telefone no WhatsApp. Tavinho responde na hora, puxa cotação do Sivisweb, devolve a mensagem oficial LOOG. Áudio estratégico via ElevenLabs.
            </p>
            <ConnectionBadge status={status} loading={loading} />
          </div>
        </div>
        <div className="pointer-events-none absolute -right-8 -bottom-8 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
      </motion.div>

      {/* TABS */}
      <nav className="flex gap-1 overflow-x-auto border-b border-loog-border/60">
        {([
          { k: "status" as const, label: "Conexão", icon: "📡", badge: undefined as number | undefined },
          { k: "chat" as const, label: "Chat ao vivo", icon: "💬", badge: unreadCount || undefined },
          { k: "leads" as const, label: "Leads", icon: "👥", badge: leads.length || undefined },
          { k: "kanban" as const, label: "Pipeline", icon: "📊", badge: undefined as number | undefined },
          { k: "config" as const, label: "Config", icon: "⚙️", badge: undefined as number | undefined },
        ]).map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={cn(
              "relative flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition",
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
          {tab === "status" && (
            <StatusTab
              status={status}
              loading={loading}
              generatingQr={generatingQr}
              onGenerateQr={handleGenerateQr}
              resetting={resetting}
              onReset={handleReset}
            />
          )}
          {tab === "chat" && <ChatTab leads={leads} />}
          {tab === "leads" && <LeadsTab leads={leads} loading={loading} />}
          {tab === "kanban" && <KanbanTab leads={leads} />}
          {tab === "config" && <ConfigTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// CONEXÃO (QR + status)
// ──────────────────────────────────────────────────────────────────
function StatusTab({
  status,
  loading,
  generatingQr,
  onGenerateQr,
  resetting,
  onReset,
}: {
  status: SdrStatus | null;
  loading: boolean;
  generatingQr: boolean;
  onGenerateQr: () => void;
  resetting: boolean;
  onReset: () => void;
}) {
  if (loading) return <SkeletonCard label="Buscando status da conexão..." />;

  const connected = status?.connected ?? false;
  const engine = status?.engine ?? "none";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Card QR / status */}
      <div className="rounded-2xl border border-loog-border bg-loog-panel/60 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-loog-muted">
            Canal WhatsApp
          </h3>
          <EngineBadge engine={engine} />
        </div>

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
            <button
              type="button"
              onClick={onReset}
              disabled={resetting}
              className="w-full rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              {resetting ? "Desconectando..." : "🔄 Resetar WhatsApp (desconectar + novo QR)"}
            </button>
            <p className="text-[11px] text-loog-muted">
              Use quando a conversa travar em "aguardando mensagem" ou quando precisar trocar o número.
            </p>
          </div>
        ) : status?.qrCode ? (
          <div className="space-y-3">
            <p className="text-sm text-loog-muted">
              No celular LOOG dedicado: WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo. Aponte a câmera.
            </p>
            <div className="flex justify-center rounded-xl bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={status.qrCode} alt="QR Code WhatsApp" className="h-56 w-56" />
            </div>
            <p className="text-center text-xs text-amber-300">
              QR expira em 40 segundos. Se expirar, clique "Gerar novo QR".
            </p>
            <button
              type="button"
              onClick={onGenerateQr}
              disabled={generatingQr}
              className="w-full rounded-lg bg-loog-brand/80 px-3 py-2 text-sm font-bold text-white hover:bg-loog-brand disabled:opacity-50"
            >
              {generatingQr ? "Gerando..." : "Gerar novo QR"}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={resetting}
              className="w-full rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              {resetting ? "Resetando..." : "🧹 Resetar tudo (apaga sessão e começa do zero)"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="font-bold text-amber-300">Nenhum canal conectado</span>
            </div>
            <p className="text-sm text-loog-muted">
              Para conectar o WhatsApp real da LOOG, clique no botão abaixo. O Hub vai gerar um QR Code que você escaneia com o celular LOOG dedicado.
            </p>
            <button
              type="button"
              onClick={onGenerateQr}
              disabled={generatingQr}
              className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {generatingQr ? "Gerando QR..." : "🚀 Gerar QR do WhatsApp"}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={resetting}
              className="w-full rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              {resetting ? "Resetando..." : "🧹 Resetar sessão (se o botão acima não gerar QR novo)"}
            </button>
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
        <div className="mt-4 border-t border-loog-border/50 pt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-loog-muted">
            Infraestrutura
          </h4>
          <ul className="space-y-1 text-xs text-loog-muted">
            <li>✅ Hub Sivisweb · <span className="text-emerald-300">online</span></li>
            <li>✅ PlacaFipe · <span className="text-emerald-300">online</span></li>
            <li>{engine === "hub-baileys" ? "✅" : "⏳"} Baileys WhatsApp · <span className={engine === "hub-baileys" ? "text-emerald-300" : "text-amber-300"}>{engine === "hub-baileys" ? "online" : "em implantação"}</span></li>
            <li>⏳ ElevenLabs · <span className="text-amber-300">aguardando API key</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function EngineBadge({ engine }: { engine: "zaia" | "hub-baileys" | "none" }) {
  const meta = {
    zaia: { label: "via Zaia Endless", cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
    "hub-baileys": { label: "via Hub (caseiro)", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
    none: { label: "não configurado", cls: "bg-gray-500/15 text-gray-400 border-gray-500/40" },
  }[engine];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest", meta.cls)}>
      {meta.label}
    </span>
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
// CHAT AO VIVO
// ──────────────────────────────────────────────────────────────────
function ChatTab({ leads }: { leads: LeadConversation[] }) {
  const [selected, setSelected] = useState<string | null>(leads[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/sdr/messages?leadId=${selected}`);
        if (res.ok && alive) setMessages(await res.json());
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 5_000);
    return () => { alive = false; clearInterval(t); };
  }, [selected]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!draft.trim() || !selected) return;
    const text = draft.trim();
    setDraft("");
    await fetch("/api/sdr/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: selected, text }),
    });
    // Otimista: adiciona a mensagem na UI
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, from: "sdr", text, at: new Date().toISOString() }]);
  };

  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-loog-border p-10 text-center">
        <div className="text-4xl">💬</div>
        <h3 className="mt-3 font-display text-lg font-bold">Nenhuma conversa ativa</h3>
        <p className="mt-1 text-sm text-loog-muted">Quando um lead chamar no WhatsApp, abre aqui.</p>
      </div>
    );
  }

  const activeLead = leads.find((l) => l.id === selected);

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr]" style={{ minHeight: 520 }}>
      {/* Lista de conversas */}
      <div className="divide-y divide-loog-border/50 overflow-y-auto rounded-2xl border border-loog-border bg-loog-panel/60">
        {leads.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setSelected(l.id)}
            className={cn(
              "flex w-full items-start gap-2 p-3 text-left transition hover:bg-loog-brand/5",
              selected === l.id && "bg-loog-brand/10"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-bold text-emerald-300">
              {l.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-bold text-loog-text">{l.name}</span>
                {l.unread > 0 && (
                  <span className="rounded-full bg-emerald-500 px-1.5 py-px text-[10px] font-bold text-white">
                    {l.unread}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-loog-muted">{l.lastMessage}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Painel de mensagens */}
      <div className="flex flex-col rounded-2xl border border-loog-border bg-loog-panel/60">
        {activeLead && (
          <div className="flex items-center justify-between border-b border-loog-border/50 p-3">
            <div>
              <div className="font-bold text-loog-text">{activeLead.name}</div>
              <div className="font-mono text-xs text-loog-muted">{activeLead.phone}</div>
            </div>
            <StageBadge stage={activeLead.stage} />
          </div>
        )}
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {loading && messages.length === 0 && (
            <p className="text-center text-xs text-loog-muted">Carregando...</p>
          )}
          {messages.map((m) => (
            <ChatBubble key={m.id} msg={m} />
          ))}
          <div ref={endRef} />
        </div>
        <div className="flex gap-2 border-t border-loog-border/50 p-3">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            placeholder="Mensagem como consultor (vai pelo Tavinho)"
            className="flex-1 rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-loog-text placeholder:text-loog-muted focus:border-loog-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim()}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isLead = msg.from === "lead";
  const isSystem = msg.from === "system";
  return (
    <div className={cn("flex", isLead ? "justify-start" : "justify-end", isSystem && "justify-center")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
          isLead && "bg-slate-700/60 text-loog-text",
          !isLead && !isSystem && "bg-emerald-600/60 text-white",
          isSystem && "bg-amber-500/15 text-amber-200 text-xs italic"
        )}
      >
        {msg.audio && <span className="mr-1">🎙️</span>}
        {msg.text}
      </div>
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
// LEADS
// ──────────────────────────────────────────────────────────────────
function LeadsTab({ leads, loading }: { leads: LeadConversation[]; loading: boolean }) {
  if (loading) return <SkeletonCard label="Carregando conversas..." />;
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-loog-border p-10 text-center">
        <div className="text-4xl">💬</div>
        <h3 className="mt-3 font-display text-lg font-bold">Nenhum lead ainda</h3>
        <p className="mt-1 text-sm text-loog-muted">Quando um lead chamar no WhatsApp, aparece aqui em tempo real.</p>
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
// CONFIG
// ──────────────────────────────────────────────────────────────────
function ConfigTab() {
  const [cfg, setCfg] = useState<SdrConfig>({
    elevenLabsKey: "",
    elevenLabsVoiceId: "",
    claudeKey: "",
    claudeModel: "haiku-4-5",
    systemPrompt: "",
    audioStrategy: "estrategico",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/sdr/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCfg(d))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/sdr/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ElevenLabs */}
      <Section title="ElevenLabs (voz do Tavinho)" icon="🎙️">
        <Field label="API Key" hint="chaves do painel ElevenLabs (xi-api-key)">
          <input
            type="password"
            value={cfg.elevenLabsKey}
            onChange={(e) => setCfg((c) => ({ ...c, elevenLabsKey: e.target.value }))}
            placeholder="sk-xxxxxxxxxxxxx"
            className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm font-mono text-loog-text focus:border-loog-brand focus:outline-none"
          />
        </Field>
        <Field label="Voice ID" hint="ID da voz clonada do consultor (ou voz padrão)">
          <input
            type="text"
            value={cfg.elevenLabsVoiceId}
            onChange={(e) => setCfg((c) => ({ ...c, elevenLabsVoiceId: e.target.value }))}
            placeholder="21m00Tcm4TlvDq8ikWAM"
            className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm font-mono text-loog-text focus:border-loog-brand focus:outline-none"
          />
        </Field>
        <Field label="Estratégia de áudio" hint="Quando o Tavinho usa áudio">
          <select
            value={cfg.audioStrategy}
            onChange={(e) => setCfg((c) => ({ ...c, audioStrategy: e.target.value as SdrConfig["audioStrategy"] }))}
            className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-loog-text focus:border-loog-brand focus:outline-none"
          >
            <option value="nunca">Nunca (só texto)</option>
            <option value="estrategico">Estratégico (abertura + fechamento + objeção)</option>
            <option value="sempre-primeiro">Sempre na 1ª mensagem</option>
          </select>
        </Field>
      </Section>

      {/* Claude */}
      <Section title="Claude (motor do Tavinho)" icon="🧠">
        <Field label="API Key" hint="Chave Anthropic (sk-ant-...)">
          <input
            type="password"
            value={cfg.claudeKey}
            onChange={(e) => setCfg((c) => ({ ...c, claudeKey: e.target.value }))}
            placeholder="sk-ant-..."
            className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm font-mono text-loog-text focus:border-loog-brand focus:outline-none"
          />
        </Field>
        <Field label="Modelo" hint="Haiku 4.5 é 10x mais barato que Sonnet — recomendado">
          <select
            value={cfg.claudeModel}
            onChange={(e) => setCfg((c) => ({ ...c, claudeModel: e.target.value as SdrConfig["claudeModel"] }))}
            className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-loog-text focus:border-loog-brand focus:outline-none"
          >
            <option value="haiku-4-5">Claude Haiku 4.5 (recomendado — barato)</option>
            <option value="sonnet-5-5">Claude Sonnet 5.5 (mais inteligente)</option>
            <option value="opus-5-5">Claude Opus 5.5 (máximo — caro)</option>
          </select>
        </Field>
      </Section>

      {/* Prompt */}
      <Section title="Prompt do Tavinho" icon="📝">
        <Field label="System prompt" hint="Instruções que ele segue em toda conversa">
          <textarea
            value={cfg.systemPrompt}
            onChange={(e) => setCfg((c) => ({ ...c, systemPrompt: e.target.value }))}
            rows={10}
            placeholder="IDENTIDADE&#10;Você é 'Tavinho da LOOG', consultor de proteção veicular..."
            className="w-full resize-y rounded-lg border border-loog-border bg-loog-bg px-3 py-2 font-mono text-xs text-loog-text focus:border-loog-brand focus:outline-none"
          />
        </Field>
        <p className="text-[11px] text-loog-muted">
          Dica: comece pelo prompt que já está rodando no Zaia (3.4k chars). Qualquer mudança aqui aplica no próximo deploy do Hub.
        </p>
      </Section>

      {/* Save */}
      <div className="flex items-center justify-between rounded-2xl border border-loog-border bg-loog-panel/40 p-4">
        <div className="text-xs text-loog-muted">
          As chaves são criptografadas e armazenadas apenas no servidor. Nunca aparecem no cliente.
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-bold text-white transition",
            saved ? "bg-emerald-500" : "bg-loog-brand hover:brightness-110",
            saving && "opacity-50"
          )}
        >
          {saving ? "Salvando..." : saved ? "✅ Salvo" : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-loog-border bg-loog-panel/60 p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-loog-muted">
        <span className="text-base">{icon}</span>
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-loog-text">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-loog-muted">{hint}</p>}
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
