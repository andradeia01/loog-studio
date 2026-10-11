"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { fmtRelativo, waLink } from "@/lib/crm/helpers";

type Stage = "novo" | "contato" | "documentos" | "negociacao" | "fechado" | "perdido";
type Temperatura = "quente" | "morno" | "frio";

interface Contact {
  id: string;
  nome: string;
  telefone: string | null;
  temperatura: Temperatura;
  status_ciclo: string;
  pipeline_stage: Stage;
  pipeline_moved_at: string | null;
  last_touch_at: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
}

const STAGES: { key: Stage; label: string; icon: string; cls: string; borderCls: string; desc: string }[] = [
  { key: "novo",       label: "Novo lead",    icon: "🆕", cls: "from-sky-500/20 to-sky-500/5",     borderCls: "border-sky-500/40",   desc: "Cotou mas ainda não conversei" },
  { key: "contato",    label: "Em contato",   icon: "💬", cls: "from-blue-500/20 to-blue-500/5",   borderCls: "border-blue-500/40",  desc: "Já troquei mensagem/liguei" },
  { key: "documentos", label: "Documentação", icon: "📋", cls: "from-amber-500/20 to-amber-500/5", borderCls: "border-amber-500/40", desc: "Enviou/vai enviar CNH/CRLV" },
  { key: "negociacao", label: "Negociação",   icon: "💰", cls: "from-violet-500/20 to-violet-500/5", borderCls: "border-violet-500/40", desc: "Discutindo preço/cobertura" },
  { key: "fechado",    label: "Fechado",      icon: "✅", cls: "from-emerald-500/25 to-emerald-500/5", borderCls: "border-emerald-500/50", desc: "Cliente comprou!" },
  { key: "perdido",    label: "Perdido",      icon: "❌", cls: "from-gray-500/15 to-gray-500/5",   borderCls: "border-gray-500/40",  desc: "Não fechou dessa vez" },
];

const TEMP_META: Record<Temperatura, { emoji: string; cls: string }> = {
  quente: { emoji: "🔥", cls: "bg-red-500/15 text-red-300 border-red-500/40" },
  morno:  { emoji: "🌤️", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  frio:   { emoji: "❄️", cls: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
};

type GruposMap = Record<Stage, Contact[]>;

export function CrmPipeline() {
  const [grupos, setGrupos] = useState<GruposMap>({ novo: [], contato: [], documentos: [], negociacao: [], fechado: [], perdido: [] });
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null); // contact.id
  const [dragOver, setDragOver] = useState<Stage | null>(null);

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/crm/pipeline", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setGrupos(j.grupos);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchPipeline(); }, [fetchPipeline]);

  // Ref pattern: fetchPipeline referência estável mas via ref evita recriar
  // o canal Supabase se o callback mudar.
  const fetchPipelineRef = useRef(fetchPipeline);
  useEffect(() => { fetchPipelineRef.current = fetchPipeline; }, [fetchPipeline]);

  // realtime: 1 subscribe pela vida do componente
  useEffect(() => {
    const sb = createSupabaseBrowser();
    const ch = sb.channel("crm-pipeline-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_contacts" }, () => { void fetchPipelineRef.current(); })
      .subscribe();
    return () => { void sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveTo = useCallback(async (contactId: string, newStage: Stage) => {
    // Optimistic UI: tira do stage antigo, bota no novo
    setGrupos((prev) => {
      const next: GruposMap = { novo: [...prev.novo], contato: [...prev.contato], documentos: [...prev.documentos], negociacao: [...prev.negociacao], fechado: [...prev.fechado], perdido: [...prev.perdido] };
      let card: Contact | undefined;
      for (const stage of Object.keys(next) as Stage[]) {
        const idx = next[stage].findIndex((c) => c.id === contactId);
        if (idx >= 0) { card = next[stage][idx]; next[stage].splice(idx, 1); break; }
      }
      if (card) {
        const updated: Contact = { ...card, pipeline_stage: newStage, pipeline_moved_at: new Date().toISOString() };
        next[newStage] = [updated, ...next[newStage]];
      }
      return next;
    });

    await fetch("/api/crm/pipeline", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, pipeline_stage: newStage }),
    });
  }, []);

  const totals = useMemo(() => {
    const total = Object.values(grupos).reduce((a, g) => a + g.length, 0);
    const ativos = grupos.novo.length + grupos.contato.length + grupos.documentos.length + grupos.negociacao.length;
    const conversao = total > 0 ? Math.round((grupos.fechado.length / total) * 100) : 0;
    return { total, ativos, fechados: grupos.fechado.length, perdidos: grupos.perdido.length, conversao };
  }, [grupos]);

  return (
    <div className="space-y-5">
      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl border border-loog-border bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-transparent p-5 sm:p-6"
      >
        <motion.div
          className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.75, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative z-10">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-300">Pipeline de vendas</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight sm:text-3xl">📈 Funil Kanban</h1>
          <p className="mt-1 text-sm text-loog-muted">Arraste cards entre colunas. A ação registra na timeline do lead.</p>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <PipelineStat label="Total"     value={totals.total} />
            <PipelineStat label="Ativos"    value={totals.ativos} emoji="⚡" />
            <PipelineStat label="Fechados"  value={totals.fechados} emoji="✅" cls="border-emerald-500/40 bg-emerald-500/10" />
            <PipelineStat label="Perdidos"  value={totals.perdidos} emoji="❌" cls="border-gray-500/40 bg-gray-500/10" />
            <PipelineStat label="Conversão" value={totals.conversao + "%"} emoji="🎯" cls="border-blue-500/40 bg-blue-500/10" />
          </div>
        </div>
      </motion.div>

      {loading && totals.total === 0 ? (
        <LoadingSkeleton />
      ) : totals.total === 0 ? (
        <EmptyPipeline />
      ) : (
        <>
          {/* dica mobile */}
          <p className="rounded-lg border border-loog-border/60 bg-loog-panel/40 px-3 py-2 text-[11px] text-loog-muted sm:hidden">
            💡 Toque numa coluna pra ver os cards. Toque num card pra mudar de fase.
          </p>

          {/* KANBAN — scroll horizontal com 6 colunas */}
          <div
            className="flex gap-3 overflow-x-auto pb-4"
            style={{ touchAction: "pan-x pan-y", scrollbarWidth: "thin" }}
          >
            {STAGES.map((stage) => (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                cards={grupos[stage.key]}
                isDragOver={dragOver === stage.key}
                dragging={dragging}
                onDragStart={(id) => setDragging(id)}
                onDragEnd={() => { setDragging(null); setDragOver(null); }}
                onDragOverCol={() => setDragOver(stage.key)}
                onDrop={(id) => { setDragOver(null); setDragging(null); void moveTo(id, stage.key); }}
                onMove={(id, newStage) => void moveTo(id, newStage)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────── sub-componentes ──────────────────────────────────────
function PipelineStat({ label, value, emoji, cls }: { label: string; value: number | string; emoji?: string; cls?: string }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className={cn("rounded-xl border p-3 backdrop-blur", cls ?? "border-loog-border bg-loog-panel/70")}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-display text-2xl font-extrabold text-white sm:text-3xl">{value}</span>
        {emoji && <span className="text-sm">{emoji}</span>}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-loog-muted">{label}</div>
    </motion.div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto">
      {STAGES.map((s) => (
        <div key={s.key} className="min-w-[280px] rounded-xl border border-loog-border bg-loog-panel/40 p-3">
          <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
          <div className="mt-3 space-y-2">
            {[0,1,2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-white/5" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyPipeline() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-dashed border-loog-border bg-loog-panel/20 p-8 text-center"
    >
      <motion.div className="mx-auto text-5xl" animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity }}>📈</motion.div>
      <h3 className="mt-3 font-display text-lg font-bold text-white">Pipeline vazio</h3>
      <p className="mt-1 text-xs text-loog-muted">
        Faça cotações pra popular o funil.<br />
        Toda cotação nova entra em <b>&quot;Novo lead&quot;</b>.
      </p>
    </motion.div>
  );
}

function KanbanColumn({
  stage, cards, isDragOver, dragging,
  onDragStart, onDragEnd, onDragOverCol, onDrop, onMove,
}: {
  stage: typeof STAGES[number];
  cards: Contact[];
  isDragOver: boolean;
  dragging: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverCol: () => void;
  onDrop: (id: string) => void;
  onMove: (id: string, newStage: Stage) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.div
      layout
      className={cn(
        "flex min-w-[280px] max-w-[320px] shrink-0 flex-col gap-2 rounded-xl border bg-gradient-to-br p-3 transition",
        isDragOver ? "border-loog-brand bg-loog-brand/10 shadow-glow" : stage.borderCls,
        stage.cls,
      )}
      onDragOver={(e) => { e.preventDefault(); onDragOverCol(); }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
      }}
    >
      <header
        className="flex cursor-pointer items-center justify-between px-1 pb-1"
        onClick={() => setCollapsed((c) => !c)}
      >
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
          <span className="text-base">{stage.icon}</span>
          {stage.label}
        </h3>
        <span className="rounded-full border border-loog-border/60 bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white">
          {cards.length}
        </span>
      </header>
      <p className="px-1 text-[10px] text-loog-muted">{stage.desc}</p>

      <AnimatePresence>
        {!collapsed && (
          <motion.ul
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-visible"
          >
            {cards.length === 0 ? (
              <li className="rounded-lg border border-dashed border-loog-border/40 bg-black/20 p-3 text-center text-[10px] text-loog-muted">
                sem leads
              </li>
            ) : (
              cards.map((c) => (
                <KanbanCard
                  key={c.id}
                  contact={c}
                  isDragging={dragging === c.id}
                  onDragStart={() => onDragStart(c.id)}
                  onDragEnd={onDragEnd}
                  onMoveStage={(s) => onMove(c.id, s)}
                />
              ))
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function KanbanCard({
  contact, isDragging, onDragStart, onDragEnd, onMoveStage,
}: {
  contact: Contact;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMoveStage: (stage: Stage) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const temp = TEMP_META[contact.temperatura];
  const dias = contact.pipeline_moved_at
    ? Math.floor((Date.now() - new Date(contact.pipeline_moved_at).getTime()) / 86_400_000)
    : null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="relative"
    >
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", contact.id); onDragStart(); }}
        onDragEnd={onDragEnd}
        className={cn(
          "cursor-grab rounded-lg border border-loog-border bg-loog-panel/80 p-2.5 backdrop-blur transition hover:border-loog-brand/60 active:cursor-grabbing",
          isDragging && "opacity-40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-white">{contact.nome}</div>
            {contact.telefone && <div className="truncate text-[10px] text-loog-muted">{contact.telefone}</div>}
          </div>
          <span className={cn("shrink-0 rounded-full border px-1.5 py-0 text-[9px] font-bold", temp.cls)}>
            {temp.emoji}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[9px] text-loog-muted">
            {dias != null ? (dias === 0 ? "hoje" : `${dias}d parado`) : fmtRelativo(contact.created_at)}
          </span>
          <div className="flex items-center gap-1">
            {contact.telefone && (
              <a
                href={waLink(contact.telefone, `Olá ${contact.nome.split(" ")[0]}, aqui é da LOOG, tudo bem?`)}
                target="_blank" rel="noopener noreferrer"
                className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[10px] text-emerald-300 hover:bg-emerald-500/20"
                onClick={(e) => e.stopPropagation()}
              >💬</a>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((m) => !m); }}
              className="rounded border border-loog-border px-1.5 py-0 text-[10px] text-loog-muted hover:text-white"
            >⋯</button>
          </div>
        </div>
      </div>

      {/* Menu mobile de ações (quando drag não é prático) */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-loog-border bg-loog-bg p-2 shadow-2xl"
          >
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-loog-muted">Mover pra</div>
            <div className="grid grid-cols-2 gap-1">
              {STAGES.filter((s) => s.key !== contact.pipeline_stage).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { setMenuOpen(false); onMoveStage(s.key); }}
                  className="rounded px-2 py-1 text-left text-[10px] text-white hover:bg-white/10"
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
