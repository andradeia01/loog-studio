"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  calcLeadScore, grupoDoLead, GRUPO_META, type LeadGrupo,
  gerarInsights, TONE_CLS,
  TIPO_META_RICH, resumoInteracao,
  WHATSAPP_TEMPLATES, waLink, fmtRelativo, fmtDataHora, diasDesde,
  type Temperatura, type StatusCiclo, type InteracaoTipo,
} from "@/lib/crm/helpers";

// ─────────────────── tipos ──────────────────────────────────────────────────
interface Contact {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  origem: string | null;
  temperatura: Temperatura;
  status_ciclo: StatusCiclo;
  last_touch_at: string | null;
  created_at: string;
}

interface Interaction {
  id: string;
  tipo: InteracaoTipo;
  descricao: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface Note { id: string; texto: string; created_at: string; updated_at: string; }
interface Followup { id: string; contact_id?: string; data_followup: string; descricao: string | null; done: boolean; done_at: string | null; }

const TEMP_META: Record<Temperatura, { label: string; cls: string; emoji: string; glow: string }> = {
  quente: { label: "Quente", cls: "bg-red-500/15 text-red-300 border-red-500/40",       emoji: "🔥", glow: "shadow-[0_0_12px_rgba(239,68,68,0.3)]" },
  morno:  { label: "Morno",  cls: "bg-amber-500/15 text-amber-300 border-amber-500/40", emoji: "🌤️", glow: "" },
  frio:   { label: "Frio",   cls: "bg-sky-500/15 text-sky-300 border-sky-500/40",       emoji: "❄️", glow: "" },
};

const STATUS_META: Record<StatusCiclo, { label: string; cls: string }> = {
  ativo:   { label: "Ativo",   cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
  cliente: { label: "Cliente", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  perdido: { label: "Perdido", cls: "bg-gray-500/15 text-gray-300 border-gray-500/40" },
};

// ───────────────────── principal ────────────────────────────────────────────
export function CrmLeads() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTemp, setFilterTemp] = useState<Temperatura | "">("");
  const [filterStatus, setFilterStatus] = useState<StatusCiclo | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // interactionCount por contato (para scoring)
  const [interactionCountById, setInteractionCountById] = useState<Record<string, number>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTemp) params.set("temperatura", filterTemp);
      if (filterStatus) params.set("status", filterStatus);
      if (search.trim()) params.set("search", search.trim());

      const [rContacts, rFollowups] = await Promise.all([
        fetch(`/api/crm/contacts?${params}`, { cache: "no-store" }),
        fetch(`/api/crm/followups?pending=true&limit=200`, { cache: "no-store" }),
      ]);
      const [jC, jF] = await Promise.all([rContacts.json(), rFollowups.json()]);
      if (jC.ok) setContacts(jC.data || []);
      if (jF.ok) setFollowups(jF.data || []);
    } catch { /* silent */ }
    setLoading(false);
  }, [filterTemp, filterStatus, search]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { void fetchAll(); }, 300);
    return () => clearTimeout(t);
  }, [search, fetchAll]);

  // realtime: refetch quando qualquer tabela CRM muda
  useEffect(() => {
    const sb = createSupabaseBrowser();
    const ch = sb.channel("crm-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_contacts" }, () => { void fetchAll(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_interactions" }, () => { void fetchAll(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_followups" }, () => { void fetchAll(); })
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [fetchAll]);

  // insights derivados
  const insights = useMemo(() => {
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const hoje24 = new Date(); hoje24.setHours(23, 59, 59, 999);
    const pendingHoje = followups.filter((f) => {
      const d = new Date(f.data_followup);
      return !f.done && d >= hoje0 && d <= hoje24;
    }).length;
    const quentesSumidos = contacts.filter((c) => c.temperatura === "quente" && c.status_ciclo === "ativo" && diasDesde(c.last_touch_at ?? c.created_at) > 3).length;
    const novos7d = contacts.filter((c) => diasDesde(c.created_at) < 7).length;
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const clientesMes = contacts.filter((c) => c.status_ciclo === "cliente" && new Date(c.last_touch_at ?? c.created_at) >= inicioMes).length;
    return gerarInsights({
      total: contacts.length,
      quentes: contacts.filter((c) => c.temperatura === "quente").length,
      pendingFollowupsHoje: pendingHoje,
      quentesSumidos, novos7d, clientesMes,
    });
  }, [contacts, followups]);

  // agrupamento
  const followupsHojePorContact = useMemo(() => {
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const hoje24 = new Date(); hoje24.setHours(23, 59, 59, 999);
    const s = new Set<string>();
    followups.forEach((f) => {
      const d = new Date(f.data_followup);
      if (!f.done && d >= hoje0 && d <= hoje24 && f.contact_id) s.add(f.contact_id);
    });
    return s;
  }, [followups]);

  const grupos = useMemo(() => {
    const map = new Map<LeadGrupo, Contact[]>();
    contacts.forEach((c) => {
      const g = grupoDoLead({
        temperatura: c.temperatura, status_ciclo: c.status_ciclo,
        last_touch_at: c.last_touch_at, created_at: c.created_at,
        hasPendingFollowupHoje: followupsHojePorContact.has(c.id),
      });
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    });
    const ordenados = Array.from(map.entries())
      .map(([key, items]) => ({ key, items, meta: GRUPO_META[key] }))
      .sort((a, b) => a.meta.prioridade - b.meta.prioridade);
    // dentro de cada grupo, ordena por score desc
    ordenados.forEach((g) => {
      g.items.sort((a, b) => calcLeadScore({ ...b, interactionCount: interactionCountById[b.id] }) - calcLeadScore({ ...a, interactionCount: interactionCountById[a.id] }));
    });
    return ordenados;
  }, [contacts, followupsHojePorContact, interactionCountById]);

  const stats = useMemo(() => ({
    total: contacts.length,
    quentes: contacts.filter((c) => c.temperatura === "quente").length,
    clientes: contacts.filter((c) => c.status_ciclo === "cliente").length,
    followupsHoje: followupsHojePorContact.size,
  }), [contacts, followupsHojePorContact]);

  return (
    <div className="space-y-5">
      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl border border-loog-border bg-gradient-to-br from-sky-500/20 via-loog-brand/15 to-transparent p-5 sm:p-6"
      >
        {/* orbs animadas */}
        <motion.div
          className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-loog-brand/20 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.75, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl"
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-loog-brand">CRM Inteligente</p>
              <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight sm:text-3xl">👥 Leads & Clientes</h1>
              <p className="mt-1 text-sm text-loog-muted">
                Toda cotação vira contato. Follow-up agendado automaticamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="shrink-0 rounded-xl bg-loog-brand px-4 py-2.5 text-xs font-bold text-white shadow-glow transition hover:brightness-110 active:scale-95"
            >
              + Novo lead
            </button>
          </div>

          {/* stats grandes */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <BigStat label="Total" value={stats.total} />
            <BigStat label="Quentes" value={stats.quentes} highlight={stats.quentes > 0 ? "red" : undefined} emoji="🔥" />
            <BigStat label="Clientes" value={stats.clientes} highlight={stats.clientes > 0 ? "emerald" : undefined} emoji="✅" />
            <BigStat label="Hoje" value={stats.followupsHoje} highlight={stats.followupsHoje > 0 ? "amber" : undefined} emoji="📞" />
          </div>
        </div>
      </motion.div>

      {/* ─── INSIGHTS ─────────────────────────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {insights.length > 0 && (
          <motion.ul
            layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-1.5"
          >
            {insights.map((i, idx) => (
              <motion.li
                key={idx}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
                className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium", TONE_CLS[i.tone])}
              >
                <span className="text-base">{i.icon}</span>
                <span className="flex-1">{i.texto}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* ─── FILTROS ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="search"
            placeholder="🔍 Nome ou telefone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pr-9"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-loog-muted hover:text-white">✕</button>
          )}
        </div>
        <ChipScroll>
          <ChipMotion active={filterTemp === "" && filterStatus === ""} onClick={() => { setFilterTemp(""); setFilterStatus(""); }}>Todos</ChipMotion>
          {(Object.keys(TEMP_META) as Temperatura[]).map((t) => (
            <ChipMotion key={t} active={filterTemp === t} onClick={() => setFilterTemp(filterTemp === t ? "" : t)}>
              {TEMP_META[t].emoji} {TEMP_META[t].label}
            </ChipMotion>
          ))}
          <span className="mx-1 self-center text-loog-muted">·</span>
          {(Object.keys(STATUS_META) as StatusCiclo[]).map((s) => (
            <ChipMotion key={s} active={filterStatus === s} onClick={() => setFilterStatus(filterStatus === s ? "" : s)}>
              {STATUS_META[s].label}
            </ChipMotion>
          ))}
        </ChipScroll>
      </div>

      {/* ─── LISTA AGRUPADA ──────────────────────────────────────── */}
      {loading && contacts.length === 0 ? (
        <LoadingSkeleton />
      ) : contacts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          <AnimatePresence mode="popLayout">
            {grupos.map(({ key, items, meta }) => (
              <motion.section
                key={key}
                layout
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={cn("overflow-hidden rounded-2xl border border-loog-border bg-gradient-to-br p-3", meta.color)}
              >
                <header className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    {meta.label}
                  </h3>
                  <span className="rounded-full border border-loog-border/60 bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white">
                    {items.length}
                  </span>
                </header>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((c, i) => (
                    <motion.li
                      key={c.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    >
                      <RichContactCard
                        contact={c}
                        hasFollowupHoje={followupsHojePorContact.has(c.id)}
                        interactionCount={interactionCountById[c.id]}
                        onClick={() => setSelectedId(c.id)}
                      />
                    </motion.li>
                  ))}
                </ul>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ─── DRAWER ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedId && (
          <ContactDrawer
            key={selectedId}
            contactId={selectedId}
            onClose={() => setSelectedId(null)}
            onChange={() => void fetchAll()}
            onInteractionCount={(count) => setInteractionCountById((prev) => ({ ...prev, [selectedId]: count }))}
          />
        )}
        {creating && (
          <ContactDrawer
            key="create"
            contactId={null} isCreate
            onClose={() => setCreating(false)}
            onChange={() => void fetchAll()}
            onCreated={(id) => { setCreating(false); setSelectedId(id); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────── sub-componentes ──────────────────────────────────────
function BigStat({ label, value, emoji, highlight }: { label: string; value: number; emoji?: string; highlight?: "red" | "emerald" | "amber" }) {
  const cls = highlight === "red" ? "border-red-500/40 bg-red-500/10"
    : highlight === "emerald" ? "border-emerald-500/40 bg-emerald-500/10"
    : highlight === "amber" ? "border-amber-500/40 bg-amber-500/10"
    : "border-loog-border bg-loog-panel/70";
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className={cn("rounded-xl border p-3 backdrop-blur", cls)}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-display text-2xl font-extrabold text-white sm:text-3xl">{value}</span>
        {emoji && <span className="text-sm">{emoji}</span>}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-loog-muted">{label}</div>
    </motion.div>
  );
}

function ChipScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-1 overflow-x-auto rounded-xl border border-loog-border bg-loog-panel/60 p-1"
      style={{ touchAction: "pan-x", scrollbarWidth: "none" }}
    >
      {children}
    </div>
  );
}

function ChipMotion({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition",
        active ? "text-white" : "text-loog-muted hover:text-white",
      )}
    >
      {active && (
        <motion.span
          layoutId="chip-active"
          className="absolute inset-0 rounded-lg bg-loog-brand shadow-glow"
          transition={{ type: "spring", damping: 25, stiffness: 350 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-loog-border bg-loog-panel/40 p-3">
          <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
          <div className="mt-2 h-3 w-20 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-dashed border-loog-border bg-loog-panel/20 p-8 text-center"
    >
      <motion.div
        className="mx-auto text-5xl"
        animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity }}
      >🌱</motion.div>
      <h3 className="mt-3 font-display text-lg font-bold text-white">Seu CRM tá limpo</h3>
      <p className="mt-1 text-xs text-loog-muted">
        Faça uma Cotação Rápida ou Completa — o lead cai aqui<br />com follow-up agendado em 3 dias.
      </p>
    </motion.div>
  );
}

// ───────────────────── Card rico ────────────────────────────────────────────
function RichContactCard({
  contact, hasFollowupHoje, interactionCount, onClick,
}: {
  contact: Contact; hasFollowupHoje: boolean; interactionCount?: number; onClick: () => void;
}) {
  const temp = TEMP_META[contact.temperatura];
  const status = STATUS_META[contact.status_ciclo];
  const score = calcLeadScore({ ...contact, interactionCount });
  const dias = diasDesde(contact.last_touch_at ?? contact.created_at);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative flex w-full flex-col gap-2 overflow-hidden rounded-xl border border-loog-border bg-loog-panel/70 p-3 text-left backdrop-blur-sm transition hover:border-loog-brand/60 hover:bg-loog-panel",
        contact.temperatura === "quente" && contact.status_ciclo === "ativo" && temp.glow,
      )}
    >
      {/* barra de score (lateral esquerda) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b"
        style={{
          background: `linear-gradient(to bottom, ${score >= 70 ? "#ef4444" : score >= 50 ? "#f59e0b" : "#64748b"}, transparent)`,
        }}
      />

      <div className="flex items-start justify-between gap-2 pl-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate font-bold text-white">{contact.nome}</h4>
            {hasFollowupHoje && (
              <motion.span
                animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                className="shrink-0 rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold text-white"
                title="Follow-up agendado pra hoje"
              >📞 HOJE</motion.span>
            )}
          </div>
          {contact.telefone && (
            <div className="truncate text-[11px] text-loog-muted">{contact.telefone}</div>
          )}
        </div>
        <motion.span
          className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", temp.cls)}
          animate={contact.temperatura === "quente" ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {temp.emoji} {temp.label}
        </motion.span>
      </div>

      <div className="flex items-center justify-between gap-2 pl-1">
        <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold", status.cls)}>
          {status.label}
        </span>
        <div className="flex items-center gap-2 text-[10px] text-loog-muted">
          <span title="Score 0-100">
            <span className={cn("font-bold", score >= 70 ? "text-red-300" : score >= 50 ? "text-amber-300" : "text-slate-400")}>
              {score}
            </span>
            /100
          </span>
          <span>·</span>
          <span>{dias === 0 ? "hoje" : `${dias}d`}</span>
        </div>
      </div>
    </motion.button>
  );
}

// ───────────────────── Drawer ───────────────────────────────────────────────
function ContactDrawer({
  contactId, isCreate, onClose, onChange, onCreated, onInteractionCount,
}: {
  contactId: string | null;
  isCreate?: boolean;
  onClose: () => void;
  onChange: () => void;
  onCreated?: (id: string) => void;
  onInteractionCount?: (count: number) => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(!isCreate);
  const [tab, setTab] = useState<"timeline" | "notas" | "followups" | "whats">("timeline");
  const [novoNome, setNovoNome] = useState("");
  const [novoTel, setNovoTel] = useState("");
  const notifiedRef = useRef(false);

  const reload = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/crm/contacts/${contactId}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        setContact(j.contact);
        setInteractions(j.interactions || []);
        setNotes(j.notes || []);
        setFollowups(j.followups || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [contactId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!notifiedRef.current && contactId && interactions.length >= 0) {
      onInteractionCount?.(interactions.length);
      notifiedRef.current = true;
    }
  }, [interactions.length, contactId, onInteractionCount]);

  const criar = async () => {
    const r = await fetch("/api/crm/contacts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome: novoNome, telefone: novoTel || null }),
    });
    const j = await r.json();
    if (j.ok && j.data?.id) { onChange(); onCreated?.(j.data.id); }
  };

  const patchContato = async (patch: Partial<Contact>) => {
    if (!contact) return;
    setContact({ ...contact, ...patch } as Contact);
    await fetch(`/api/crm/contacts/${contact.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    onChange();
  };

  const deletar = async () => {
    if (!contact) return;
    if (!confirm(`Excluir ${contact.nome}? Essa ação não pode ser desfeita.`)) return;
    await fetch(`/api/crm/contacts/${contact.id}`, { method: "DELETE" });
    onChange(); onClose();
  };

  // último veículo cotado (pra templates e header)
  const ultimoVeiculo = useMemo(() => {
    for (const it of interactions) {
      const v = (it.metadata as { vehicle?: { brand?: string; model?: string; modelYear?: number } } | undefined)?.vehicle;
      if (v) return [v.brand, v.model, v.modelYear].filter(Boolean).join(" ");
    }
    return null;
  }, [interactions]);

  const dias = contact ? diasDesde(contact.last_touch_at ?? contact.created_at) : 0;

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="fixed right-0 top-0 z-50 h-full w-full overflow-y-auto border-l border-loog-border bg-loog-bg shadow-2xl sm:max-w-md"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 320 }}
      >
        {/* HEADER */}
        <header className="sticky top-0 z-10 border-b border-loog-border bg-loog-bg/95 px-4 py-3 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-lg font-bold">
                {isCreate ? "Novo lead" : contact?.nome ?? "Carregando..."}
              </h2>
              {ultimoVeiculo && <p className="truncate text-[11px] text-loog-muted">🚗 {ultimoVeiculo}</p>}
            </div>
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-loog-muted hover:bg-white/5">✕</button>
          </div>
        </header>

        {isCreate ? (
          <div className="space-y-3 p-4">
            <div>
              <label className="label">Nome</label>
              <input className="input mt-1" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <label className="label">Telefone (WhatsApp)</label>
              <input className="input mt-1" value={novoTel} onChange={(e) => setNovoTel(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <button type="button" onClick={criar} disabled={novoNome.trim().length < 1} className="btn-primary w-full disabled:opacity-50">
              Criar lead
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-3 p-4">
            {[0,1,2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-loog-panel/40" />)}
          </div>
        ) : !contact ? (
          <div className="p-8 text-center text-sm text-loog-muted">Lead não encontrado.</div>
        ) : (
          <>
            {/* temperatura + status */}
            <div className="space-y-3 border-b border-loog-border p-4">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TEMP_META) as Temperatura[]).map((t) => (
                  <motion.button
                    key={t} type="button" onClick={() => patchContato({ temperatura: t })}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-bold transition",
                      contact.temperatura === t ? TEMP_META[t].cls : "border-loog-border text-loog-muted hover:text-white",
                    )}
                  >
                    {TEMP_META[t].emoji} {TEMP_META[t].label}
                  </motion.button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_META) as StatusCiclo[]).map((s) => (
                  <motion.button
                    key={s} type="button" onClick={() => patchContato({ status_ciclo: s })}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-semibold transition",
                      contact.status_ciclo === s ? STATUS_META[s].cls : "border-loog-border text-loog-muted hover:text-white",
                    )}
                  >
                    {STATUS_META[s].label}
                  </motion.button>
                ))}
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                {contact.telefone && (<><dt className="text-loog-muted">Telefone</dt><dd className="text-white">{contact.telefone}</dd></>)}
                {contact.email && (<><dt className="text-loog-muted">E-mail</dt><dd className="truncate text-white">{contact.email}</dd></>)}
                {contact.cidade && (<><dt className="text-loog-muted">Cidade</dt><dd className="text-white">{contact.cidade}</dd></>)}
                {contact.origem && (<><dt className="text-loog-muted">Origem</dt><dd className="text-white">{contact.origem}</dd></>)}
                <dt className="text-loog-muted">Toque</dt><dd className="text-white">{fmtRelativo(contact.last_touch_at ?? contact.created_at)}</dd>
                <dt className="text-loog-muted">Score</dt><dd className="font-bold text-white">{calcLeadScore({ ...contact, interactionCount: interactions.length })}/100</dd>
              </dl>

              <div className="flex gap-2">
                {contact.telefone && (
                  <button
                    type="button" onClick={() => setTab("whats")}
                    className="flex-1 rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-bold text-black hover:brightness-110"
                  >📲 WhatsApp</button>
                )}
                <button type="button" onClick={() => setTab("followups")} className="rounded-md border border-loog-border px-3 py-1.5 text-xs text-loog-muted hover:bg-white/5">📅 Agendar</button>
                <button type="button" onClick={deletar} className="rounded-md border border-red-500/40 px-2 py-1.5 text-[10px] font-semibold text-red-300 hover:bg-red-500/10">Excluir</button>
              </div>
            </div>

            {/* tabs */}
            <nav className="flex gap-0 border-b border-loog-border bg-loog-panel/40">
              <DrawerTab active={tab === "timeline"} onClick={() => setTab("timeline")}>Timeline ({interactions.length})</DrawerTab>
              <DrawerTab active={tab === "whats"} onClick={() => setTab("whats")}>WhatsApp</DrawerTab>
              <DrawerTab active={tab === "notas"} onClick={() => setTab("notas")}>Notas ({notes.length})</DrawerTab>
              <DrawerTab active={tab === "followups"} onClick={() => setTab("followups")}>Agenda ({followups.filter(f => !f.done).length})</DrawerTab>
            </nav>

            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {tab === "timeline" && <RichTimeline items={interactions} />}
                {tab === "whats" && <WhatsAppTab contact={contact} veiculo={ultimoVeiculo} dias={dias} onLog={reload} />}
                {tab === "notas" && <NotesTab contactId={contact.id} notes={notes} onChange={reload} />}
                {tab === "followups" && <FollowupsTab contactId={contact.id} items={followups} onChange={reload} />}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </motion.aside>
    </>
  );
}

function DrawerTab({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn(
        "relative flex-1 whitespace-nowrap px-2 py-2.5 text-[11px] font-semibold transition",
        active ? "text-white" : "text-loog-muted hover:text-white",
      )}
    >
      {active && <motion.span layoutId="drawer-tab-active" className="absolute inset-x-0 bottom-0 h-0.5 bg-loog-brand" />}
      {children}
    </button>
  );
}

// ───────────────────── Timeline rica ────────────────────────────────────────
function RichTimeline({ items }: { items: Interaction[] }) {
  if (items.length === 0) return <div className="p-8 text-center text-xs text-loog-muted">Nenhuma interação registrada ainda.</div>;
  return (
    <ol className="relative space-y-3 p-4 pl-8">
      {/* linha vertical conectora */}
      <div className="pointer-events-none absolute bottom-6 left-[22px] top-6 w-0.5 bg-gradient-to-b from-loog-brand/40 via-loog-brand/20 to-transparent" />
      {items.map((it, idx) => {
        const meta = TIPO_META_RICH[it.tipo];
        const linhas = resumoInteracao(it.tipo, it.metadata);
        return (
          <motion.li
            key={it.id}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx * 0.04, 0.3) }}
            className="relative"
          >
            {/* dot */}
            <motion.span
              className={cn("absolute -left-6 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-loog-bg text-[11px]", meta.dotCls)}
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: Math.min(idx * 0.04, 0.3) + 0.1, type: "spring" }}
            >{meta.icon}</motion.span>

            <div className="rounded-lg border border-loog-border bg-loog-panel/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">{meta.label}</span>
                <span className="text-[10px] text-loog-muted">{fmtRelativo(it.created_at)}</span>
              </div>
              {it.descricao && <p className="mt-1 text-[11px] text-loog-muted">{it.descricao}</p>}
              {linhas.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {linhas.map((l, i) => (
                    <li key={i} className="text-[11px] text-white/90">{l}</li>
                  ))}
                </ul>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

// ───────────────────── Aba WhatsApp (templates) ─────────────────────────────
function WhatsAppTab({ contact, veiculo, dias, onLog }: { contact: Contact; veiculo: string | null; dias: number; onLog: () => void }) {
  const [selectedTpl, setSelectedTpl] = useState<string>(WHATSAPP_TEMPLATES[0].id);
  const [texto, setTexto] = useState("");

  const tplAtual = WHATSAPP_TEMPLATES.find((t) => t.id === selectedTpl)!;

  useEffect(() => {
    setTexto(tplAtual.render({
      nomeLead: contact.nome,
      veiculo,
      diasDesdeToque: dias,
    }));
  }, [selectedTpl, contact.nome, veiculo, dias, tplAtual]);

  const abrir = async () => {
    if (!contact.telefone) return;
    window.open(waLink(contact.telefone, texto), "_blank");
    // registra interação whatsapp
    await fetch("/api/crm/interactions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact_id: contact.id,
        tipo: "whatsapp",
        descricao: `Enviado template "${tplAtual.label}"`,
        metadata: { template: tplAtual.id },
      }),
    });
    onLog();
  };

  return (
    <div className="space-y-3 p-4">
      <p className="text-[11px] text-loog-muted">Escolha um script. Edite se quiser. Clique pra abrir no WhatsApp.</p>

      <ChipScroll>
        {WHATSAPP_TEMPLATES.map((t) => (
          <ChipMotion key={t.id} active={selectedTpl === t.id} onClick={() => setSelectedTpl(t.id)}>
            {t.icon} {t.label}
          </ChipMotion>
        ))}
      </ChipScroll>

      <textarea
        value={texto} onChange={(e) => setTexto(e.target.value)}
        className="input min-h-[160px] resize-none"
      />

      <button
        type="button" onClick={abrir} disabled={!contact.telefone || !texto.trim()}
        className="w-full rounded-md bg-[#25D366] px-3 py-3 text-sm font-bold text-black hover:brightness-110 disabled:opacity-50"
      >
        📲 Abrir no WhatsApp + registrar
      </button>
      {!contact.telefone && <p className="text-center text-[11px] text-amber-300">Lead sem telefone cadastrado.</p>}
    </div>
  );
}

// ───────────────────── Notas ────────────────────────────────────────────────
function NotesTab({ contactId, notes, onChange }: { contactId: string; notes: Note[]; onChange: () => void }) {
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!texto.trim()) return;
    setSaving(true);
    await fetch("/api/crm/notes", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, texto }),
    });
    setTexto(""); setSaving(false); onChange();
  };

  const remover = async (id: string) => {
    await fetch(`/api/crm/notes/${id}`, { method: "DELETE" });
    onChange();
  };

  return (
    <div className="space-y-3 p-4">
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nova nota..." className="input min-h-[80px] resize-none" />
      <button type="button" onClick={salvar} disabled={saving || !texto.trim()} className="btn-primary w-full disabled:opacity-50">
        {saving ? "Salvando..." : "+ Adicionar nota"}
      </button>
      <AnimatePresence>
        {notes.length === 0 ? (
          <p className="text-center text-xs text-loog-muted">Nenhuma nota ainda.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n, i) => (
              <motion.li key={n.id}
                layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.2) }}
                className="group rounded-lg border border-loog-border bg-loog-panel/40 p-3"
              >
                <p className="whitespace-pre-wrap text-xs text-white">{n.texto}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-loog-muted">{fmtRelativo(n.created_at)}</span>
                  <button type="button" onClick={() => remover(n.id)} className="text-[10px] text-loog-muted opacity-0 transition group-hover:opacity-100 hover:text-red-300">excluir</button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────── Follow-ups ───────────────────────────────────────────
function FollowupsTab({ contactId, items, onChange }: { contactId: string; items: Followup[]; onChange: () => void }) {
  const [data, setData] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const presets = [
    { label: "+1h", min: 60 },
    { label: "Amanhã 10h", preset: "amanha" },
    { label: "+3 dias", min: 3 * 24 * 60 },
    { label: "+1 semana", min: 7 * 24 * 60 },
  ];

  const aplicarPreset = (p: typeof presets[number]) => {
    const d = new Date();
    if (p.preset === "amanha") { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); }
    else if (p.min) { d.setMinutes(d.getMinutes() + p.min); }
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setData(iso);
  };

  const criar = async () => {
    if (!data) return;
    setSaving(true);
    await fetch("/api/crm/followups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, data_followup: new Date(data).toISOString(), descricao: desc || null }),
    });
    setData(""); setDesc(""); setSaving(false); onChange();
  };

  const toggle = async (id: string, done: boolean) => {
    await fetch(`/api/crm/followups/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: !done }),
    });
    onChange();
  };

  const remover = async (id: string) => {
    await fetch(`/api/crm/followups/${id}`, { method: "DELETE" });
    onChange();
  };

  return (
    <div className="space-y-3 p-4">
      <div className="rounded-lg border border-loog-border bg-loog-panel/40 p-3">
        <label className="label">Agendar follow-up</label>
        <div className="mt-1 flex flex-wrap gap-1">
          {presets.map((p) => (
            <button key={p.label} type="button" onClick={() => aplicarPreset(p)}
              className="rounded-md border border-loog-border px-2 py-1 text-[10px] text-loog-muted hover:bg-white/5 hover:text-white">
              {p.label}
            </button>
          ))}
        </div>
        <input type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} className="input mt-2" />
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="O que fazer? (opcional)" className="input mt-2" />
        <button type="button" onClick={criar} disabled={saving || !data} className="btn-primary mt-2 w-full disabled:opacity-50">
          {saving ? "Agendando..." : "+ Agendar"}
        </button>
      </div>

      <AnimatePresence>
        {items.length === 0 ? (
          <p className="text-center text-xs text-loog-muted">Nenhum follow-up agendado.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((f, i) => (
              <motion.li key={f.id}
                layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.2) }}
                className={cn("rounded-lg border p-3", f.done ? "border-loog-border/40 bg-loog-panel/20 opacity-60" : "border-loog-border bg-loog-panel/40")}
              >
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={f.done} onChange={() => toggle(f.id, f.done)} className="mt-0.5 h-4 w-4 accent-loog-brand" />
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-xs font-semibold", f.done ? "line-through text-loog-muted" : "text-white")}>
                      {fmtDataHora(f.data_followup)}
                    </div>
                    {f.descricao && <p className="mt-0.5 text-[11px] text-loog-muted">{f.descricao}</p>}
                  </div>
                  <button type="button" onClick={() => remover(f.id)} className="text-[10px] text-loog-muted hover:text-red-300">excluir</button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </AnimatePresence>
    </div>
  );
}
