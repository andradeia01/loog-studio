"use client";

import { useMemo, useState } from "react";
import { cn, formatInstagram, formatPhoneBR } from "@/lib/utils";

export interface ConsultantRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  instagram: string | null;
  city: string | null;
  photo_url: string | null;
  role: "admin" | "consultant" | "consultant_sdr" | "gestor";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
  rejected_reason: string | null;
}

type Filter = "pending" | "approved" | "rejected" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pendentes" },
  { key: "approved", label: "Aprovados" },
  { key: "rejected", label: "Rejeitados" },
  { key: "all", label: "Todos" },
];

export function ConsultantsManager({ initial }: { initial: ConsultantRow[] }) {
  const [rows, setRows] = useState<ConsultantRow[]>(initial);
  const [filter, setFilter] = useState<Filter>(
    initial.some((r) => r.status === "pending") ? "pending" : "all",
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ConsultantRow | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [filter, rows],
  );

  async function act(id: string, action: "approve" | "reject" | "revoke" | "promote" | "demote" | "enable_sdr" | "disable_sdr", reason?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/consultants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { profile } = await res.json();
      setRows((r) => r.map((x) => (x.id === id ? { ...x, ...profile } : x)));
    } catch (err) {
      console.error(err);
      alert("Não foi possível executar a ação.");
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(email: string) {
    if (!confirm(`Gerar nova senha pra ${email}?\nA senha vai aparecer uma única vez — anote antes de fechar.`)) return;
    try {
      const r = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, generate: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error);
      // Mostra em prompt pra o admin copiar
      window.prompt(
        `✅ Senha gerada pra ${email}\n\nCopie agora (não vai aparecer de novo):`,
        j.password,
      );
    } catch (err) {
      console.error(err);
      alert("Falha ao resetar senha: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Excluir permanentemente ${name}? Essa ação não pode ser desfeita.`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/consultants/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      console.error(err);
      alert("Não foi possível excluir.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={filter === f.key ? "chip-active" : "chip"}>
            {f.label}
            {" "}
            <span className="ml-1 text-loog-muted">
              {f.key === "all" ? rows.length : rows.filter((r) => r.status === f.key).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
          Ninguém aqui.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const busy = busyId === r.id;
            return (
              <div key={r.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-3">
                  {r.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo_url} alt="" className="h-12 w-12 rounded-full border border-loog-border object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-loog-border bg-loog-panel text-sm font-bold text-loog-muted">
                      {(r.full_name || r.email).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {r.full_name || <span className="italic text-loog-muted">sem nome</span>}
                      {r.role === "admin" && (
                        <span className="ml-2 rounded-full border border-loog-brand2/40 bg-loog-brand/15 px-2 py-0.5 text-[10px] font-bold uppercase text-loog-brand2">admin</span>
                      )}
                      {r.role === "consultant_sdr" && (
                        <span className="ml-2 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">+ SDR</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-loog-muted">
                      {r.email} · {r.phone ? formatPhoneBR(r.phone) : "—"}
                      {r.instagram && <> · {formatInstagram(r.instagram)}</>}
                      {r.city && <> · {r.city}</>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-widest">
                      <StatusPill status={r.status} />
                      <span className="text-loog-muted">
                        cadastro em {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {r.status === "rejected" && r.rejected_reason && (
                      <div className="mt-1 text-[11px] text-red-300">Motivo: {r.rejected_reason}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {r.status !== "approved" && (
                    <button className="btn-primary !py-2 !text-xs" onClick={() => act(r.id, "approve")} disabled={busy}>Aprovar</button>
                  )}
                  {r.status !== "rejected" && (
                    <button
                      className="btn-ghost !py-2 !text-xs !text-red-300"
                      onClick={() => {
                        const reason = prompt("Motivo da rejeição (opcional):") ?? undefined;
                        act(r.id, "reject", reason);
                      }}
                      disabled={busy}
                    >
                      Rejeitar
                    </button>
                  )}
                  {r.status === "approved" && (
                    <button className="btn-ghost !py-2 !text-xs" onClick={() => act(r.id, "revoke")} disabled={busy}>Suspender</button>
                  )}
                  {r.role === "consultant" && (
                    <>
                      <button className="btn-ghost !py-2 !text-xs !text-emerald-300" onClick={() => act(r.id, "enable_sdr")} disabled={busy}>+ SDR</button>
                      <button className="btn-ghost !py-2 !text-xs" onClick={() => act(r.id, "promote")} disabled={busy}>Promover a admin</button>
                    </>
                  )}
                  {r.role === "consultant_sdr" && (
                    <>
                      <button className="btn-ghost !py-2 !text-xs" onClick={() => act(r.id, "disable_sdr")} disabled={busy}>Remover SDR</button>
                      <button className="btn-ghost !py-2 !text-xs" onClick={() => act(r.id, "promote")} disabled={busy}>Promover a admin</button>
                    </>
                  )}
                  {r.role === "admin" && (
                    <button className="btn-ghost !py-2 !text-xs" onClick={() => act(r.id, "demote")} disabled={busy}>Rebaixar</button>
                  )}
                  <button className="btn-ghost !py-2 !text-xs" onClick={() => setEditing(r)} disabled={busy}>✏️ Editar</button>
                  <button className="btn-ghost !py-2 !text-xs !text-amber-300" onClick={() => resetPassword(r.email)} disabled={busy}>🔑 Nova senha</button>
                  <button className="btn-ghost !py-2 !text-xs !text-red-400" onClick={() => remove(r.id, r.full_name || r.email)} disabled={busy}>Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditConsultantModal
          consultant={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setRows((r) => r.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function StatusPill({ status }: { status: ConsultantRow["status"] }) {
  const map = {
    pending: { label: "pendente", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
    approved: { label: "aprovado", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
    rejected: { label: "rejeitado", cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  }[status];
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", map.cls)}>{map.label}</span>;
}

function EditConsultantModal({
  consultant,
  onClose,
  onSaved,
}: {
  consultant: ConsultantRow;
  onClose: () => void;
  onSaved: (updated: Partial<ConsultantRow> & { id: string }) => void;
}) {
  const [form, setForm] = useState({
    full_name: consultant.full_name ?? "",
    email: consultant.email,
    phone: consultant.phone ?? "",
    instagram: consultant.instagram ?? "",
    city: consultant.city ?? "",
    photo_url: consultant.photo_url ?? "",
    role: consultant.role,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      // Monta só o diff: campos realmente alterados
      const profile: Record<string, string | null> = {};
      if (form.full_name !== (consultant.full_name ?? "")) profile.full_name = form.full_name.trim() || null;
      if (form.email !== consultant.email) profile.email = form.email.trim();
      if (form.phone !== (consultant.phone ?? "")) profile.phone = form.phone.trim() || null;
      if (form.instagram !== (consultant.instagram ?? "")) profile.instagram = form.instagram.trim().replace(/^@/, "") || null;
      if (form.city !== (consultant.city ?? "")) profile.city = form.city.trim() || null;
      if (form.photo_url !== (consultant.photo_url ?? "")) profile.photo_url = form.photo_url.trim() || null;
      if (form.role !== consultant.role) profile.role = form.role;

      if (Object.keys(profile).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/consultants/${consultant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_profile", profile }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `Falha (${res.status})`);
      onSaved({ id: consultant.id, ...(data.profile ?? profile) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-loog-brand/40 bg-loog-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-loog-border/60 px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-white">Editar perfil</h3>
            <p className="text-xs text-loog-muted">Alterações entram imediatamente — e-mail novo precisa confirmar na próxima entrada.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-loog-muted hover:bg-loog-bg hover:text-white"
            aria-label="Fechar"
          >✕</button>
        </div>

        <form onSubmit={save} className="space-y-4 px-5 py-5">
          <Field label="Nome completo" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="E-mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            <Field label="Telefone (com DDD)" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="24999887766" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Instagram (sem @)" value={form.instagram} onChange={(v) => setForm({ ...form, instagram: v.replace(/^@/, "") })} placeholder="halisson_emerick" />
            <Field label="Cidade" value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder="Volta Redonda" />
          </div>
          <Field label="URL da foto (opcional)" value={form.photo_url} onChange={(v) => setForm({ ...form, photo_url: v })} placeholder="https://..." />

          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">Papel</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as ConsultantRow["role"] })}
              className="input w-full"
            >
              <option value="consultant">Consultor</option>
              <option value="consultant_sdr">Consultor + SDR</option>
              <option value="gestor">Gestor</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          {err && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">⚠️ {err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">
        {label}{required && <span className="text-red-400"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="input w-full"
      />
    </label>
  );
}
