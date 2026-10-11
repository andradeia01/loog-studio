"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { registerPush, unregisterPush, isPushEnabled } from "@/lib/push-client";
import { SdrLeadAssign, type SdrConsultor, type SdrAssignment } from "./SdrLeadAssign";

type Tab = "status" | "chat" | "leads" | "kanban" | "oficial" | "config";

interface SdrStatus {
  connected: boolean;
  phoneNumber: string | null;
  channelName: string | null;
  qrCode: string | null;
  qrExpiresAt: string | null;
  engine: "zaia" | "hub-baileys" | "hub-zapi" | "hub-meta" | "none";
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
  suggestedBucket?: KanbanStage | null;
  suggestedReason?: string;
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
  groqKey: string;
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

  // Atribuição de leads (admin distribui pros consultores):
  const [me, setMe] = useState<{ userId: string; isAdmin: boolean } | null>(null);
  const [consultores, setConsultores] = useState<SdrConsultor[]>([]);
  const [assignments, setAssignments] = useState<SdrAssignment[]>([]);
  const [filterMine, setFilterMine] = useState(false);

  // carrega 1x: who am I + lista de consultores
  useEffect(() => {
    (async () => {
      try {
        const [m, c] = await Promise.all([
          fetch("/api/me").then((r) => r.json()),
          fetch("/api/sdr/consultores").then((r) => r.json()),
        ]);
        if (m.ok) setMe({ userId: m.userId, isAdmin: !!m.isAdmin });
        if (c.ok) setConsultores(c.data || []);
        // Consultor comum já abre em "Meus leads" por default
        if (m.ok && !m.isAdmin) setFilterMine(true);
      } catch { /* silencioso */ }
    })();
  }, []);

  const reloadAssignments = useCallback(async () => {
    try {
      const r = await fetch("/api/sdr/assignments", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setAssignments(j.data || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void reloadAssignments(); }, [reloadAssignments]);

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

  // Mapa lead_id → assignment (O(1) lookup no render)
  const assignmentByLead = useMemo(() => {
    const map = new Map<string, SdrAssignment>();
    assignments.forEach((a) => map.set(a.lead_id, a));
    return map;
  }, [assignments]);

  // Filtra leads conforme toggle "Meus leads" (ou pra consultor sempre filtra)
  const visibleLeads = useMemo(() => {
    if (!filterMine || !me) return leads;
    return leads.filter((l) => assignmentByLead.get(l.id)?.consultant_id === me.userId);
  }, [filterMine, leads, assignmentByLead, me]);

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
          { k: "oficial" as const, label: "API Oficial", icon: "✅", badge: undefined as number | undefined },
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
          {tab === "chat" && <ChatTab leads={visibleLeads} />}
          {tab === "leads" && (
            <LeadsTab
              leads={visibleLeads}
              loading={loading}
              consultores={consultores}
              assignmentByLead={assignmentByLead}
              isAdmin={me?.isAdmin ?? false}
              filterMine={filterMine}
              onToggleFilter={() => setFilterMine((v) => !v)}
              onAssignChange={reloadAssignments}
            />
          )}
          {tab === "kanban" && (
            <KanbanTab leads={visibleLeads} onLeadsChange={setLeads} />
          )}
          {tab === "oficial" && <OficialTab />}
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
            <li>{engine === "hub-zapi" ? "✅" : "⏳"} Z-API WhatsApp · <span className={engine === "hub-zapi" ? "text-emerald-300" : "text-amber-300"}>{engine === "hub-zapi" ? "online" : "em implantação"}</span></li>
            <li>⏳ ElevenLabs · <span className="text-amber-300">aguardando API key</span></li>
          </ul>
        </div>
        <div className="mt-4 border-t border-loog-border/50 pt-3">
          <PushNotificationCard />
        </div>
      </div>
    </div>
  );
}

function PushNotificationCard() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { isPushEnabled().then(setEnabled); }, []);
  async function toggle() {
    setBusy(true); setMsg(null);
    try {
      if (enabled) {
        await unregisterPush();
        setEnabled(false);
        setMsg("Notificações desligadas.");
      } else {
        const r = await registerPush();
        if (r.ok) { setEnabled(true); setMsg("🔔 Notificações ativas neste aparelho!"); }
        else setMsg(`❌ ${r.reason}`);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-loog-muted">
        Notificações Push
      </h4>
      <p className="mb-2 text-[11px] text-loog-muted">
        Recebe alertas ao vivo de <b>cotação enviada</b> e <b>lead precisa de você</b> neste dispositivo —
        funciona com o app LOOG Studio instalado como app no celular (PWA).
      </p>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50",
          enabled
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
            : "border-loog-brand/40 bg-loog-brand/10 text-loog-brand hover:bg-loog-brand/20"
        )}
      >
        {busy ? "..." : enabled ? "🔔 Ativado neste dispositivo — clique pra desligar" : "🔕 Ativar notificações push"}
      </button>
      {msg && <div className="mt-2 text-[11px] text-loog-muted">{msg}</div>}
    </div>
  );
}

function EngineBadge({ engine }: { engine: "zaia" | "hub-baileys" | "hub-zapi" | "hub-meta" | "none" }) {
  const meta = {
    zaia: { label: "via Zaia Endless", cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
    "hub-baileys": { label: "via Hub (Baileys)", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
    "hub-zapi": { label: "via Hub (Z-API)", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
    "hub-meta": { label: "via Hub (Meta Oficial)", cls: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
    none: { label: "não configurado", cls: "bg-gray-500/15 text-gray-400 border-gray-500/40" },
  }[engine] ?? { label: "não configurado", cls: "bg-gray-500/15 text-gray-400 border-gray-500/40" };
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
function LeadsTab({
  leads, loading, consultores, assignmentByLead, isAdmin, filterMine, onToggleFilter, onAssignChange,
}: {
  leads: LeadConversation[];
  loading: boolean;
  consultores: SdrConsultor[];
  assignmentByLead: Map<string, SdrAssignment>;
  isAdmin: boolean;
  filterMine: boolean;
  onToggleFilter: () => void;
  onAssignChange: () => void;
}) {
  if (loading) return <SkeletonCard label="Carregando conversas..." />;

  // Toggle "Meus leads" / "Todos" (consultor comum sempre em Meus, admin alterna)
  const toggle = (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex gap-1 rounded-xl border border-loog-border bg-loog-panel/60 p-1">
        <button
          type="button"
          onClick={() => filterMine && onToggleFilter()}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition",
            !filterMine ? "bg-loog-brand text-white shadow-glow" : "text-loog-muted hover:text-white")}
        >Todos ({leads.length})</button>
        <button
          type="button"
          onClick={() => !filterMine && onToggleFilter()}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition",
            filterMine ? "bg-loog-brand text-white shadow-glow" : "text-loog-muted hover:text-white")}
        >👤 Meus</button>
      </div>
      {isAdmin && (
        <span className="text-[10px] text-loog-muted">
          {consultores.length} consultor{consultores.length !== 1 ? "es" : ""} disponíveis
        </span>
      )}
    </div>
  );

  if (leads.length === 0) {
    return (
      <div>
        {toggle}
        <div className="rounded-2xl border border-dashed border-loog-border p-10 text-center">
          <div className="text-4xl">💬</div>
          <h3 className="mt-3 font-display text-lg font-bold">
            {filterMine ? "Nenhum lead atribuído a você" : "Nenhum lead ainda"}
          </h3>
          <p className="mt-1 text-sm text-loog-muted">
            {filterMine
              ? "Quando o admin te atribuir um lead, ele aparece aqui."
              : "Quando um lead chamar no WhatsApp, aparece aqui em tempo real."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div>
      {toggle}
      <div className="divide-y divide-loog-border/50 rounded-2xl border border-loog-border bg-loog-panel/60">
        {leads.map((l) => (
          <div key={l.id} className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-bold text-emerald-300">
              {l.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-bold text-loog-text">{l.name}</span>
                <span className="font-mono text-xs text-loog-muted">{l.phone}</span>
                <StageBadge stage={l.stage} />
                <SdrLeadAssign
                  leadId={l.id}
                  assignment={assignmentByLead.get(l.id) ?? null}
                  consultores={consultores}
                  isAdmin={isAdmin}
                  onChange={onAssignChange}
                />
              </div>
              <p className="mt-0.5 truncate text-sm text-loog-muted">{l.lastMessage}</p>
            </div>
            <div className="shrink-0 text-xs text-loog-muted">{l.lastAt}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// KANBAN (drag-and-drop + sugestões do Claude)
// ──────────────────────────────────────────────────────────────────
function KanbanTab({
  leads,
  onLeadsChange,
}: {
  leads: LeadConversation[];
  onLeadsChange: (next: LeadConversation[]) => void;
}) {
  const stages = Object.keys(KANBAN_META) as KanbanStage[];

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const to = destination.droppableId as KanbanStage;
    // Optimistic update
    const next = leads.map((l) =>
      l.id === draggableId
        ? { ...l, stage: to, suggestedBucket: null, suggestedReason: undefined }
        : l
    );
    onLeadsChange(next);
    try {
      await fetch(
        `/api/sdr/conversations/${encodeURIComponent(draggableId)}/stage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket: to }),
        }
      );
    } catch {
      /* polling de 8s vai reconciliar */
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-5">
        {stages.map((stage) => {
          const items = leads.filter((l) => l.stage === stage);
          const meta = KANBAN_META[stage];
          return (
            <Droppable key={stage} droppableId={stage}>
              {(dropProvided, dropSnapshot) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className={cn(
                    "min-w-[220px] rounded-2xl border p-3 transition-colors",
                    dropSnapshot.isDraggingOver
                      ? "border-emerald-400/60 bg-emerald-500/5"
                      : "border-loog-border bg-loog-panel/40"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
                        meta.cls
                      )}
                    >
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
                      items.map((l, idx) => (
                        <Draggable key={l.id} draggableId={l.id} index={idx}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={cn(
                                "rounded-lg bg-loog-bg/60 p-2.5 cursor-grab active:cursor-grabbing",
                                dragSnapshot.isDragging && "shadow-lg ring-2 ring-emerald-400/50"
                              )}
                            >
                              <div className="truncate text-sm font-bold text-loog-text">
                                {l.name}
                              </div>
                              <div className="font-mono text-[10px] text-loog-muted">
                                {l.phone}
                              </div>
                              {l.suggestedBucket && l.suggestedBucket !== l.stage && (
                                <div
                                  className={cn(
                                    "mt-1.5 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest",
                                    l.suggestedBucket === "pago"
                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                      : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                                  )}
                                  title={l.suggestedReason}
                                >
                                  🤖 sugerido: {l.suggestedBucket}
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))
                    )}
                    {dropProvided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}

// ──────────────────────────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────
// API OFICIAL (Meta Cloud API)
// ──────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────
// DASHBOARD — estilo Hotmart, numeros grandes, impactante
// ──────────────────────────────────────────────────────────────────
interface Metrics {
  hoje: { leads: number; cotacoes: number; valorCotado: number; valorCotadoFormatado: string; handoffs: number; negociando: number };
  semana: { leads: number; cotacoes: number; valorCotado: number; valorCotadoFormatado: string; handoffs: number };
  total: { leads: number; cotacoes: number; valorCotado: number; valorCotadoFormatado: string; handoffs: number; ganhos: number };
  taxaConversao: number;
  tempoMedioAteCotarMin: number;
}

function DashboardTab() {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<"hoje" | "semana" | "total">("hoje");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/sdr/metrics");
        if (!r.ok) return;
        const data = (await r.json()) as Metrics;
        if (alive) setM(data);
      } catch { /* silencioso */ }
      finally { if (alive) setLoading(false); }
    };
    load();
    const t = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (loading && !m) return <SkeletonCard label="Carregando dashboard..." />;
  if (!m) return <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200">Não foi possível carregar as métricas.</div>;

  const period = m[periodo];
  const periodLabel = periodo === "hoje" ? "HOJE" : periodo === "semana" ? "ÚLTIMOS 7 DIAS" : "TOTAL";

  return (
    <div className="space-y-5">
      {/* HERO — valor cotado grandao estilo Hotmart */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-loog-panel p-6 shadow-[0_0_60px_rgba(16,185,129,0.15)]">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
              💰 Faturamento potencial · {periodLabel}
            </span>
            <PeriodSwitch value={periodo} onChange={setPeriodo} />
          </div>
          <div className="font-display text-4xl font-black leading-none text-white sm:text-5xl md:text-6xl">
            {period.valorCotadoFormatado}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-emerald-200/80">
            <span>📄 {period.cotacoes} cotação{period.cotacoes === 1 ? "" : "ões"}</span>
            <span>·</span>
            <span>👥 {period.leads} lead{period.leads === 1 ? "" : "s"}</span>
            {m.taxaConversao > 0 && (
              <>
                <span>·</span>
                <span>⚡ {m.taxaConversao}% conversão</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* GRID DE CARDS — números grandes impactantes */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon="👥" label="Leads" value={period.leads} color="from-blue-500/20 to-blue-500/5" ringColor="border-blue-500/40" textColor="text-blue-300" />
        <MetricCard icon="📄" label="Cotações" value={period.cotacoes} color="from-emerald-500/20 to-emerald-500/5" ringColor="border-emerald-500/40" textColor="text-emerald-300" />
        <MetricCard icon="🚨" label="Pra fechar" value={period.handoffs} color="from-rose-500/20 to-rose-500/5" ringColor="border-rose-500/40" textColor="text-rose-300" highlight={period.handoffs > 0} />
        {periodo === "hoje" ? (
          <MetricCard icon="💬" label="Negociando" value={m.hoje.negociando} color="from-amber-500/20 to-amber-500/5" ringColor="border-amber-500/40" textColor="text-amber-300" />
        ) : periodo === "total" ? (
          <MetricCard icon="🏆" label="Fechados" value={m.total.ganhos} color="from-yellow-500/20 to-yellow-500/5" ringColor="border-yellow-500/40" textColor="text-yellow-300" />
        ) : (
          <MetricCard icon="⚡" label="Conversão" value={m.taxaConversao} suffix="%" color="from-purple-500/20 to-purple-500/5" ringColor="border-purple-500/40" textColor="text-purple-300" />
        )}
      </div>

      {/* RODAPÉ — tempo médio + mini stats */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-loog-border bg-loog-panel/40 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-loog-muted">
            ⏱️ Tempo médio até cotar
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-3xl font-black text-white">{m.tempoMedioAteCotarMin}</span>
            <span className="text-sm text-loog-muted">min</span>
          </div>
          <div className="mt-1 text-[11px] text-loog-muted">
            Do primeiro oi até a cotação sair.
          </div>
        </div>
        <div className="rounded-2xl border border-loog-border bg-loog-panel/40 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-loog-muted">
            📈 Visão geral (sempre)
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="font-display text-xl font-black text-white">{m.total.leads}</div>
              <div className="text-[10px] text-loog-muted">leads</div>
            </div>
            <div>
              <div className="font-display text-xl font-black text-emerald-300">{m.total.cotacoes}</div>
              <div className="text-[10px] text-loog-muted">cotações</div>
            </div>
            <div>
              <div className="font-display text-xl font-black text-yellow-300">{m.total.ganhos}</div>
              <div className="text-[10px] text-loog-muted">fechados</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-loog-border bg-loog-panel/30 p-3 text-center text-[10px] text-loog-muted">
        🔄 Atualiza a cada 15 segundos · dados em tempo real do Hub LOOG
      </div>
    </div>
  );
}

function PeriodSwitch({ value, onChange }: { value: "hoje" | "semana" | "total"; onChange: (v: "hoje" | "semana" | "total") => void }) {
  const opts = [
    { k: "hoje" as const, lb: "Hoje" },
    { k: "semana" as const, lb: "7d" },
    { k: "total" as const, lb: "Total" },
  ];
  return (
    <div className="flex gap-0.5 rounded-full border border-emerald-500/30 bg-black/30 p-0.5">
      {opts.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[10px] font-bold transition",
            value === o.k ? "bg-emerald-500 text-black" : "text-emerald-200/60 hover:text-emerald-100",
          )}
        >
          {o.lb}
        </button>
      ))}
    </div>
  );
}

function MetricCard({ icon, label, value, suffix, color, ringColor, textColor, highlight }: {
  icon: string;
  label: string;
  value: number;
  suffix?: string;
  color: string;
  ringColor: string;
  textColor: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 transition",
      ringColor, color,
      highlight && "animate-pulse",
    )}>
      <div className="text-2xl">{icon}</div>
      <div className={cn("mt-2 font-display text-3xl font-black leading-none", textColor)}>
        {value}{suffix ?? ""}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
        {label}
      </div>
    </div>
  );
}

function OficialTab() {
  const [cfg, setCfg] = useState({
    metaAccessToken: "",
    metaPhoneNumberId: "",
    metaWabaId: "",
    metaAppSecret: "",
    metaVerifyToken: "",
  });
  const [hasToken, setHasToken] = useState(false);
  const [hasSecret, setHasSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sdr/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setCfg({
          metaAccessToken: d.metaAccessToken ?? "",
          metaPhoneNumberId: d.metaPhoneNumberId ?? "",
          metaWabaId: d.metaWabaId ?? "",
          metaAppSecret: d.metaAppSecret ?? "",
          metaVerifyToken: d.metaVerifyToken ?? "",
        });
        setHasToken(!!d._hasMetaAccessToken);
        setHasSecret(!!d._hasMetaAppSecret);
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (cfg.metaPhoneNumberId) body.metaPhoneNumberId = cfg.metaPhoneNumberId;
      if (cfg.metaWabaId) body.metaWabaId = cfg.metaWabaId;
      if (cfg.metaVerifyToken) body.metaVerifyToken = cfg.metaVerifyToken;
      // Só manda tokens se não forem mascarados
      if (cfg.metaAccessToken && !cfg.metaAccessToken.includes("•")) {
        body.metaAccessToken = cfg.metaAccessToken;
      }
      if (cfg.metaAppSecret && !cfg.metaAppSecret.includes("•")) {
        body.metaAppSecret = cfg.metaAppSecret;
      }
      await fetch("/api/sdr/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSavedAt(new Date().toLocaleTimeString("pt-BR"));
      // Após salvar, re-mascara os campos de token
      if (body.metaAccessToken) setHasToken(true);
      if (body.metaAppSecret) setHasSecret(true);
    } finally {
      setSaving(false);
    }
  };

  const WEBHOOK_URL = "https://2-25-189-22.sslip.io/webhook/meta";

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
        <div className="mb-2 flex items-center gap-2 font-bold text-sky-200">
          ✅ WhatsApp Business API (Meta Cloud)
        </div>
        <p className="text-xs text-sky-100/80">
          Canal oficial da Meta. Zero risco de ban/logout. Mensagens de resposta
          (dentro de 24h do lead) são praticamente grátis. Para iniciar conversa é
          preciso usar <b>templates aprovados</b> pela Meta.
        </p>
      </div>

      {/* Webhook URL */}
      <div className="rounded-xl border border-loog-border bg-loog-panel/40 p-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-loog-muted">
          URL do webhook (cola no painel da Meta)
        </label>
        <div className="flex items-center gap-2">
          <input
            value={WEBHOOK_URL}
            readOnly
            className="flex-1 rounded-lg border border-loog-border bg-loog-bg/60 px-3 py-2 font-mono text-xs text-loog-text"
          />
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(WEBHOOK_URL)}
            className="rounded-lg border border-loog-border bg-loog-bg/60 px-3 py-2 text-xs font-semibold text-loog-text hover:bg-loog-bg"
          >
            Copiar
          </button>
        </div>
        <p className="mt-1 text-[11px] text-loog-muted">
          Meta → App → WhatsApp → Configuração → Webhook. Também assine o campo <b>messages</b>.
        </p>
      </div>

      {/* Credenciais */}
      <div className="grid gap-3 md:grid-cols-2">
        <MetaField
          label="Phone Number ID"
          placeholder="123456789012345"
          value={cfg.metaPhoneNumberId}
          onChange={(v) => setCfg({ ...cfg, metaPhoneNumberId: v })}
          help="Encontra em: Meta → App → WhatsApp → Configuração da API"
        />
        <MetaField
          label="WABA ID (Business Account ID)"
          placeholder="123456789012345"
          value={cfg.metaWabaId}
          onChange={(v) => setCfg({ ...cfg, metaWabaId: v })}
          help="Mesma tela do Phone Number ID"
        />
        <MetaField
          label={`Access Token${hasToken ? " (salvo)" : ""}`}
          placeholder="EAAG... (System User Token permanente)"
          value={cfg.metaAccessToken}
          onChange={(v) => setCfg({ ...cfg, metaAccessToken: v })}
          help="System User → Gerar token com permissão whatsapp_business_messaging"
          type="password"
        />
        <MetaField
          label={`App Secret${hasSecret ? " (salvo)" : ""}`}
          placeholder="xxxxxxxxxxxxxx"
          value={cfg.metaAppSecret}
          onChange={(v) => setCfg({ ...cfg, metaAppSecret: v })}
          help="Meta → App → Configurações → Básico → App Secret"
          type="password"
        />
        <MetaField
          label="Verify Token (webhook)"
          placeholder="qualquer-string-forte-aqui"
          value={cfg.metaVerifyToken}
          onChange={(v) => setCfg({ ...cfg, metaVerifyToken: v })}
          help="String arbitrária que você define. Cola a mesma coisa no painel da Meta."
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar credenciais"}
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-300">✓ salvo às {savedAt}</span>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-100/80">
        <b className="text-amber-200">Importante:</b> após salvar as credenciais,
        o canal da Meta ainda <b>não vira o canal ativo</b> automaticamente — ele
        continua no Z-API. Pra ativar, me avise que eu troco o env{" "}
        <code className="rounded bg-amber-500/10 px-1">WHATSAPP_CHANNEL=meta-cloud</code>{" "}
        e reinicio o serviço (uma vez só).
      </div>
    </div>
  );
}

function MetaField({
  label,
  value,
  onChange,
  placeholder,
  help,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-loog-muted">
        {label}
      </label>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-loog-border bg-loog-bg/60 px-3 py-2 font-mono text-xs text-loog-text focus:border-loog-brand focus:outline-none"
      />
      {help && <p className="mt-1 text-[11px] text-loog-muted">{help}</p>}
    </div>
  );
}

function ConfigTab() {
  const [cfg, setCfg] = useState<SdrConfig>({
    elevenLabsKey: "",
    elevenLabsVoiceId: "",
    claudeKey: "",
    claudeModel: "haiku-4-5",
    systemPrompt: "",
    audioStrategy: "estrategico",
    groqKey: "",
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

      {/* Groq Whisper (STT) */}
      <Section title="Groq Whisper (lead manda áudio → bot entende)" icon="🎧">
        <Field label="API Key Groq" hint="gere grátis em console.groq.com (precisa logar com Google)">
          <input
            type="password"
            value={cfg.groqKey}
            onChange={(e) => setCfg((c) => ({ ...c, groqKey: e.target.value }))}
            placeholder="gsk_xxxxxxxxxxxxx"
            className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm font-mono text-loog-text focus:border-loog-brand focus:outline-none"
          />
        </Field>
        <p className="text-[11px] text-loog-muted">
          Quando o lead manda áudio no WhatsApp, o Tavinho transcreve via whisper-large-v3-turbo (grátis até limite do plano Groq) e responde como se fosse texto. Sem key configurada, o Tavinho responde &quot;me manda em texto&quot;.
        </p>
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
