"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ─────────────────── tipos (eco do backend) ─────────────────────────────────
type Temperatura = "quente" | "morno" | "frio";
type StatusCiclo = "ativo" | "cliente" | "perdido";
type InteracaoTipo =
  | "cotacao_rapida" | "cotacao_completa"
  | "whatsapp" | "ligacao" | "reuniao" | "email"
  | "nota_sistema" | "outro";

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

interface Note {
  id: string;
  texto: string;
  created_at: string;
  updated_at: string;
}

interface Followup {
  id: string;
  data_followup: string;
  descricao: string | null;
  done: boolean;
  done_at: string | null;
}

const TEMP_META: Record<Temperatura, { label: string; cls: string; emoji: string }> = {
  quente:  { label: "Quente", cls: "bg-red-500/15 text-red-300 border-red-500/40", emoji: "🔥" },
  morno:   { label: "Morno",  cls: "bg-amber-500/15 text-amber-300 border-amber-500/40", emoji: "🌤️" },
  frio:    { label: "Frio",   cls: "bg-sky-500/15 text-sky-300 border-sky-500/40", emoji: "❄️" },
};

const STATUS_META: Record<StatusCiclo, { label: string; cls: string }> = {
  ativo:   { label: "Ativo",   cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
  cliente: { label: "Cliente", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  perdido: { label: "Perdido", cls: "bg-gray-500/15 text-gray-300 border-gray-500/40" },
};

const TIPO_META: Record<InteracaoTipo, { label: string; icon: string }> = {
  cotacao_rapida:   { label: "Cotação Rápida",   icon: "⚡" },
  cotacao_completa: { label: "Cotação Completa", icon: "📄" },
  whatsapp:         { label: "WhatsApp",         icon: "💬" },
  ligacao:          { label: "Ligação",          icon: "📞" },
  reuniao:          { label: "Reunião",          icon: "🤝" },
  email:            { label: "E-mail",           icon: "✉️" },
  nota_sistema:     { label: "Sistema",          icon: "ℹ️" },
  outro:            { label: "Outro",            icon: "•" },
};

function waLink(telefone: string | null, text?: string): string {
  if (!telefone) return "#";
  const d = telefone.replace(/\D/g, "");
  const full = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffH = Math.round(diffMs / 3_600_000);
  if (diffH < 1) return "agora";
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD}d atrás`;
  return d.toLocaleDateString("pt-BR");
}

// ───────────────────── componente principal ─────────────────────────────────
export function CrmLeads() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTemp, setFilterTemp] = useState<Temperatura | "">("");
  const [filterStatus, setFilterStatus] = useState<StatusCiclo | "">("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTemp) params.set("temperatura", filterTemp);
      if (filterStatus) params.set("status", filterStatus);
      if (search.trim()) params.set("search", search.trim());
      const r = await fetch(`/api/crm/contacts?${params}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setContacts(j.data || []);
    } catch { /* silent */ }
    setLoading(false);
  }, [filterTemp, filterStatus, search]);

  useEffect(() => { void fetchContacts(); }, [fetchContacts]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { void fetchContacts(); }, 350);
    return () => clearTimeout(t);
  }, [search, fetchContacts]);

  const stats = useMemo(() => {
    const quentes = contacts.filter((c) => c.temperatura === "quente").length;
    const clientes = contacts.filter((c) => c.status_ciclo === "cliente").length;
    return { total: contacts.length, quentes, clientes };
  }, [contacts]);

  return (
    <div className="space-y-5">
      {/* HERO + stats */}
      <div className="relative overflow-hidden rounded-2xl border border-loog-border bg-gradient-to-br from-sky-500/20 via-blue-500/10 to-transparent p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">👥 CRM / Leads</h1>
            <p className="mt-1 text-sm text-loog-muted">Toda cotação vira contato automaticamente. Nenhum lead escorrega.</p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="shrink-0 rounded-lg bg-loog-brand px-3 py-2 text-xs font-bold text-white hover:brightness-110"
          >
            + Novo lead
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatPill label="Total" value={stats.total} />
          <StatPill label="Quentes 🔥" value={stats.quentes} />
          <StatPill label="Clientes" value={stats.clientes} />
        </div>
      </div>

      {/* FILTROS */}
      <div className="space-y-2">
        <input
          type="search"
          placeholder="🔍 Buscar por nome ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
        <div
          className="flex gap-1 overflow-x-auto rounded-xl border border-loog-border bg-loog-panel/60 p-1"
          style={{ touchAction: "pan-x", scrollbarWidth: "none" }}
        >
          <Chip active={filterTemp === ""} onClick={() => setFilterTemp("")}>Todas temp</Chip>
          {(Object.keys(TEMP_META) as Temperatura[]).map((t) => (
            <Chip key={t} active={filterTemp === t} onClick={() => setFilterTemp(t)}>
              {TEMP_META[t].emoji} {TEMP_META[t].label}
            </Chip>
          ))}
        </div>
        <div
          className="flex gap-1 overflow-x-auto rounded-xl border border-loog-border bg-loog-panel/60 p-1"
          style={{ touchAction: "pan-x", scrollbarWidth: "none" }}
        >
          <Chip active={filterStatus === ""} onClick={() => setFilterStatus("")}>Todos status</Chip>
          {(Object.keys(STATUS_META) as StatusCiclo[]).map((s) => (
            <Chip key={s} active={filterStatus === s} onClick={() => setFilterStatus(s)}>
              {STATUS_META[s].label}
            </Chip>
          ))}
        </div>
      </div>

      {/* LISTA */}
      {loading && contacts.length === 0 ? (
        <div className="rounded-xl border border-loog-border bg-loog-panel/40 p-8 text-center text-sm text-loog-muted">
          Carregando leads...
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-loog-border bg-loog-panel/20 p-8 text-center">
          <div className="text-4xl">🌱</div>
          <p className="mt-2 text-sm text-loog-muted">
            Nenhum lead ainda. Faça uma Cotação Rápida ou Completa — o contato cai aqui automaticamente.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c) => (
            <ContactCard key={c.id} contact={c} onClick={() => setSelectedId(c.id)} />
          ))}
        </ul>
      )}

      {/* DRAWER ficha */}
      <AnimatePresence>
        {selectedId && (
          <ContactDrawer
            contactId={selectedId}
            onClose={() => setSelectedId(null)}
            onChange={() => void fetchContacts()}
          />
        )}
        {creating && (
          <ContactDrawer
            contactId={null}
            isCreate
            onClose={() => setCreating(false)}
            onChange={() => void fetchContacts()}
            onCreated={(id) => { setCreating(false); setSelectedId(id); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────── pequenos ─────────────────────────────────────────────
function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-loog-border bg-loog-panel/80 px-3 py-1 backdrop-blur">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap",
        active ? "bg-loog-brand text-white shadow-glow" : "text-loog-muted hover:text-white",
      )}
    >{children}</button>
  );
}

function ContactCard({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  const temp = TEMP_META[contact.temperatura];
  const status = STATUS_META[contact.status_ciclo];
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full flex-col gap-2 rounded-xl border border-loog-border bg-loog-panel/60 p-3 text-left transition hover:border-loog-brand/60 hover:bg-loog-panel"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-white">{contact.nome}</div>
            {contact.telefone && (
              <div className="truncate text-[11px] text-loog-muted">{contact.telefone}</div>
            )}
          </div>
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", temp.cls)}>
            {temp.emoji} {temp.label}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-semibold", status.cls)}>
            {status.label}
          </span>
          <span className="text-[10px] text-loog-muted">
            {fmtDate(contact.last_touch_at ?? contact.created_at)}
          </span>
        </div>
      </button>
    </li>
  );
}

// ───────────────────── Drawer da ficha ──────────────────────────────────────
function ContactDrawer({
  contactId, isCreate, onClose, onChange, onCreated,
}: {
  contactId: string | null;
  isCreate?: boolean;
  onClose: () => void;
  onChange: () => void;
  onCreated?: (id: string) => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(!isCreate);
  const [tab, setTab] = useState<"timeline" | "notas" | "followups">("timeline");

  // form de criação
  const [novoNome, setNovoNome] = useState("");
  const [novoTel, setNovoTel] = useState("");

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
    onChange();
    onClose();
  };

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
        transition={{ type: "spring", damping: 32, stiffness: 300 }}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-loog-border bg-loog-bg/95 px-4 py-3 backdrop-blur">
          <h2 className="font-display text-lg font-bold">
            {isCreate ? "Novo lead" : contact?.nome ?? "Carregando..."}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-loog-muted hover:bg-white/5">
            ✕
          </button>
        </header>

        {isCreate ? (
          <div className="space-y-3 p-4">
            <div>
              <label className="label">Nome</label>
              <input className="input mt-1" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do lead" />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input mt-1" value={novoTel} onChange={(e) => setNovoTel(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
            <button
              type="button"
              onClick={criar}
              disabled={novoNome.trim().length < 1}
              className="btn-primary w-full disabled:opacity-50"
            >
              Criar lead
            </button>
          </div>
        ) : loading ? (
          <div className="p-8 text-center text-sm text-loog-muted">Carregando ficha...</div>
        ) : !contact ? (
          <div className="p-8 text-center text-sm text-loog-muted">Lead não encontrado.</div>
        ) : (
          <>
            {/* dados */}
            <div className="space-y-3 border-b border-loog-border p-4">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TEMP_META) as Temperatura[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => patchContato({ temperatura: t })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-bold transition",
                      contact.temperatura === t ? TEMP_META[t].cls : "border-loog-border text-loog-muted hover:text-white",
                    )}
                  >
                    {TEMP_META[t].emoji} {TEMP_META[t].label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_META) as StatusCiclo[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => patchContato({ status_ciclo: s })}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-semibold transition",
                      contact.status_ciclo === s ? STATUS_META[s].cls : "border-loog-border text-loog-muted hover:text-white",
                    )}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                {contact.telefone && (<><dt className="text-loog-muted">Telefone</dt><dd className="text-white">{contact.telefone}</dd></>)}
                {contact.email && (<><dt className="text-loog-muted">E-mail</dt><dd className="truncate text-white">{contact.email}</dd></>)}
                {contact.cidade && (<><dt className="text-loog-muted">Cidade</dt><dd className="text-white">{contact.cidade}</dd></>)}
                {contact.origem && (<><dt className="text-loog-muted">Origem</dt><dd className="text-white">{contact.origem}</dd></>)}
                <dt className="text-loog-muted">Último toque</dt><dd className="text-white">{fmtDate(contact.last_touch_at ?? contact.created_at)}</dd>
              </dl>

              <div className="flex flex-wrap gap-2 pt-1">
                {contact.telefone && (
                  <a
                    href={waLink(contact.telefone, `Olá ${contact.nome.split(" ")[0]}, aqui é da LOOG, tudo bem?`)}
                    target="_blank" rel="noopener noreferrer"
                    className="rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-bold text-black hover:brightness-110"
                  >
                    📲 WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  onClick={deletar}
                  className="ml-auto rounded-md border border-red-500/40 px-2 py-1.5 text-[10px] font-semibold text-red-300 hover:bg-red-500/10"
                >
                  Excluir
                </button>
              </div>
            </div>

            {/* tabs */}
            <nav
              className="flex gap-1 border-b border-loog-border bg-loog-panel/40 p-1"
              style={{ touchAction: "pan-x" }}
            >
              <TabBtn active={tab === "timeline"} onClick={() => setTab("timeline")}>Timeline</TabBtn>
              <TabBtn active={tab === "notas"} onClick={() => setTab("notas")}>Notas ({notes.length})</TabBtn>
              <TabBtn active={tab === "followups"} onClick={() => setTab("followups")}>Follow-ups ({followups.filter(f => !f.done).length})</TabBtn>
            </nav>

            {tab === "timeline" && <TimelineTab items={interactions} />}
            {tab === "notas" && <NotesTab contactId={contact.id} notes={notes} onChange={reload} />}
            {tab === "followups" && <FollowupsTab contactId={contact.id} items={followups} onChange={reload} />}
          </>
        )}
      </motion.aside>
    </>
  );
}

function TabBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-2 text-xs font-semibold transition whitespace-nowrap",
        active ? "bg-loog-brand text-white" : "text-loog-muted hover:text-white",
      )}
    >{children}</button>
  );
}

function TimelineTab({ items }: { items: Interaction[] }) {
  if (items.length === 0) {
    return <div className="p-6 text-center text-xs text-loog-muted">Nenhuma interação registrada ainda.</div>;
  }
  return (
    <ol className="space-y-2 p-4">
      {items.map((it) => (
        <li key={it.id} className="rounded-lg border border-loog-border bg-loog-panel/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">
              {TIPO_META[it.tipo].icon} {TIPO_META[it.tipo].label}
            </span>
            <span className="text-[10px] text-loog-muted">{fmtDate(it.created_at)}</span>
          </div>
          {it.descricao && <p className="mt-1 text-xs text-loog-muted">{it.descricao}</p>}
          {it.metadata && Object.keys(it.metadata).length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] text-loog-muted hover:text-white">Detalhes</summary>
              <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 text-[10px] text-loog-muted">
                {JSON.stringify(it.metadata, null, 2)}
              </pre>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

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
    setTexto("");
    setSaving(false);
    onChange();
  };

  const remover = async (id: string) => {
    await fetch(`/api/crm/notes/${id}`, { method: "DELETE" });
    onChange();
  };

  return (
    <div className="space-y-3 p-4">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Nova nota... (ex: cliente pediu desconto, voltar na sexta)"
        className="input min-h-[80px] resize-none"
      />
      <button
        type="button"
        onClick={salvar}
        disabled={saving || !texto.trim()}
        className="btn-primary w-full disabled:opacity-50"
      >
        {saving ? "Salvando..." : "Adicionar nota"}
      </button>
      {notes.length === 0 ? (
        <p className="text-center text-xs text-loog-muted">Nenhuma nota ainda.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="group rounded-lg border border-loog-border bg-loog-panel/40 p-3">
              <p className="whitespace-pre-wrap text-xs text-white">{n.texto}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-loog-muted">{fmtDate(n.created_at)}</span>
                <button
                  type="button"
                  onClick={() => remover(n.id)}
                  className="text-[10px] text-loog-muted opacity-0 transition group-hover:opacity-100 hover:text-red-300"
                >
                  excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FollowupsTab({ contactId, items, onChange }: { contactId: string; items: Followup[]; onChange: () => void }) {
  const [data, setData] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const criar = async () => {
    if (!data) return;
    setSaving(true);
    const iso = new Date(data).toISOString();
    await fetch("/api/crm/followups", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, data_followup: iso, descricao: desc || null }),
    });
    setData(""); setDesc("");
    setSaving(false);
    onChange();
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
        <input
          type="datetime-local"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="input mt-1"
        />
        <input
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="O que fazer? (opcional)"
          className="input mt-2"
        />
        <button
          type="button"
          onClick={criar}
          disabled={saving || !data}
          className="btn-primary mt-2 w-full disabled:opacity-50"
        >
          {saving ? "Agendando..." : "+ Agendar"}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-xs text-loog-muted">Nenhum follow-up agendado.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f) => (
            <li key={f.id} className={cn(
              "rounded-lg border p-3",
              f.done ? "border-loog-border/40 bg-loog-panel/20 opacity-60" : "border-loog-border bg-loog-panel/40",
            )}>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={f.done}
                  onChange={() => toggle(f.id, f.done)}
                  className="mt-0.5 h-4 w-4 accent-loog-brand"
                />
                <div className="min-w-0 flex-1">
                  <div className={cn("text-xs font-semibold", f.done ? "line-through text-loog-muted" : "text-white")}>
                    {new Date(f.data_followup).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                  {f.descricao && <p className="mt-0.5 text-[11px] text-loog-muted">{f.descricao}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remover(f.id)}
                  className="text-[10px] text-loog-muted hover:text-red-300"
                >
                  excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
