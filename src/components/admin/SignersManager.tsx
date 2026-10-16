"use client";

import { useState } from "react";

export type SignerDefault = {
  id: string;
  role: "associado" | "presidente" | "vice_presidente";
  profile_id: string | null;
  nome: string;
  email: string | null;
  cpf_cnpj: string | null;
  cargo: string | null;
  active: boolean;
};

const ROLE_LABEL: Record<SignerDefault["role"], string> = {
  associado: "Associado (cliente final)",
  presidente: "Presidente",
  vice_presidente: "Vice-Presidente",
};

const ROLE_EMOJI: Record<SignerDefault["role"], string> = {
  associado: "👤",
  presidente: "👔",
  vice_presidente: "🎖️",
};

export function SignersManager({ initial }: { initial: SignerDefault[] }) {
  const [rows, setRows] = useState(initial);
  const [docusealStatus, setDocusealStatus] = useState<"disconnected" | "pending">("disconnected");

  async function update(id: string, patch: Partial<SignerDefault>) {
    const resp = await fetch(`/api/admin/signers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await resp.json();
    if (resp.ok && data.signer) {
      setRows(rows.map((r) => (r.id === id ? data.signer : r)));
    }
  }

  return (
    <div className="space-y-6">
      {/* Fluxo visual */}
      <div className="rounded-xl border border-loog-brand/40 bg-loog-brand/5 p-5">
        <h3 className="font-display text-sm font-bold text-white">Fluxo de assinatura</h3>
        <p className="mt-1 text-xs text-loog-muted">
          Toda vez que um contrato é gerado, o sistema cria registros em <code className="text-white">contract_signers</code> com estes signatários:
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SignerStep emoji="👤" label="Associado" sublabel="Cliente final" active />
          <Arrow />
          <SignerStep emoji="👔" label="Presidente" sublabel="Representante LOOG" active={rows.find((r) => r.role === "presidente")?.active} />
          <Arrow />
          <SignerStep emoji="🎖️" label="Vice-Presidente" sublabel="Opcional / suplente" active={rows.find((r) => r.role === "vice_presidente")?.active} />
        </div>
      </div>

      {/* Configuração por role */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-loog-muted">Configuração de signatários LOOG</h2>
        {rows.filter((r) => r.role !== "associado").map((r) => (
          <SignerRow key={r.id} row={r} onUpdate={(patch) => update(r.id, patch)} />
        ))}
      </div>

      {/* DocuSeal integration status */}
      <div className="rounded-xl border border-loog-border bg-loog-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold text-white">📝 Integração DocuSeal</h3>
            <p className="mt-1 text-xs text-loog-muted">
              A assinatura eletrônica roda no <strong className="text-white">DocuSeal</strong> (servidor próprio na VPS LOOG — Gratos stack). Quando conectado, cada contrato gerado criará automaticamente um envelope com os signatários acima.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${
            docusealStatus === "disconnected" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-green-500/40 bg-green-500/10 text-green-300"
          }`}>
            {docusealStatus === "disconnected" ? "Não conectado" : "Pendente DNS"}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <a
            href="https://docs.loogstudio.tech"
            target="_blank"
            rel="noreferrer"
            className="rounded border border-loog-border bg-loog-bg px-3 py-1.5 text-white/80 hover:border-loog-brand"
          >
            🔗 Abrir DocuSeal (depende DNS)
          </a>
          <button
            onClick={() => setDocusealStatus("pending")}
            className="rounded border border-loog-brand/50 bg-loog-brand/10 px-3 py-1.5 text-loog-brand hover:bg-loog-brand/20"
          >
            🧪 Testar conexão
          </button>
        </div>
      </div>
    </div>
  );
}

function SignerStep({ emoji, label, sublabel, active }: { emoji: string; label: string; sublabel: string; active?: boolean }) {
  return (
    <div className={`flex min-w-[140px] flex-col items-center rounded-xl border p-3 ${
      active ? "border-loog-brand/50 bg-loog-brand/5" : "border-loog-border bg-loog-panel opacity-50"
    }`}>
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 font-display text-sm font-bold text-white">{label}</div>
      <div className="text-[10px] text-loog-muted">{sublabel}</div>
    </div>
  );
}

function Arrow() {
  return <div className="text-loog-muted">→</div>;
}

function SignerRow({ row, onUpdate }: { row: SignerDefault; onUpdate: (p: Partial<SignerDefault>) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(row);

  async function save() {
    await onUpdate({
      nome: form.nome,
      email: form.email,
      cpf_cnpj: form.cpf_cnpj,
      cargo: form.cargo,
      active: form.active,
    });
    setEditing(false);
  }

  if (!editing) {
    return (
      <article className="flex items-center justify-between rounded-xl border border-loog-border bg-loog-panel p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{ROLE_EMOJI[row.role]}</span>
          <div>
            <div className="font-display font-bold text-white">{row.nome}</div>
            <div className="text-xs text-loog-muted">
              {row.cargo ?? ROLE_LABEL[row.role]}
              {row.email && <> · {row.email}</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
            row.active ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-loog-muted/30 bg-loog-muted/10 text-loog-muted"
          }`}>
            {row.active ? "ATIVO" : "INATIVO"}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="rounded border border-loog-border px-3 py-1 text-xs text-white/80 hover:bg-loog-bg"
          >
            Editar
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="space-y-3 rounded-xl border border-loog-brand/40 bg-loog-brand/5 p-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{ROLE_EMOJI[row.role]}</span>
        <h3 className="font-display font-bold text-white">{ROLE_LABEL[row.role]}</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input label="Nome completo" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
        <Input label="Cargo" value={form.cargo ?? ""} onChange={(v) => setForm({ ...form, cargo: v })} />
        <Input label="E-mail" value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} />
        <Input label="CPF/CNPJ" value={form.cpf_cnpj ?? ""} onChange={(v) => setForm({ ...form, cpf_cnpj: v })} />
      </div>
      <label className="flex items-center gap-2 text-sm text-white/90">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
          className="h-4 w-4 rounded border-loog-border bg-loog-bg"
        />
        Ativar este signatário no fluxo de contratos
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={() => { setForm(row); setEditing(false); }} className="rounded border border-loog-border px-4 py-2 text-sm text-white/80">
          Cancelar
        </button>
        <button onClick={save} className="rounded bg-loog-brand px-4 py-2 text-sm font-semibold text-white shadow-glow hover:brightness-110">
          Salvar
        </button>
      </div>
    </article>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white focus:border-loog-brand focus:outline-none"
      />
    </label>
  );
}
