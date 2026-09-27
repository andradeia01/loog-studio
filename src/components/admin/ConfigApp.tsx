"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "api-keys" | "grupos" | "gestores" | "quotas";

interface SettingRow {
  key: string;
  value: unknown;
  description?: string;
}
interface Group {
  id: string;
  name: string;
  region: string | null;
  description: string | null;
  cover_url: string | null;
  position: number;
  member_count: number;
}
interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "gestor" | "consultant";
  status: "pending" | "approved" | "rejected";
  group_id: string | null;
  groups?: { name: string } | null;
}

export function ConfigApp() {
  const [tab, setTab] = useState<Tab>("api-keys");
  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap rounded-2xl border border-loog-border bg-loog-panel p-1">
        {(
          [
            ["api-keys", "🔑 API Keys"],
            ["grupos", "🗺️ Grupos"],
            ["gestores", "👥 Gestores / Consultores"],
            ["quotas", "⚡ Quotas"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === k ? "bg-loog-brand text-white" : "text-loog-muted hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "api-keys" && <ApiKeysTab />}
      {tab === "grupos" && <GroupsTab />}
      {tab === "gestores" && <GestoresTab />}
      {tab === "quotas" && <QuotasTab />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 1: API Keys
// ────────────────────────────────────────────────────────────────────────────
function ApiKeysTab() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [rawKeys, setRawKeys] = useState<Record<string, string>>({});
  const [showRaw, setShowRaw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load(raw = false) {
    const r = await fetch(`/api/admin/settings${raw ? "?raw=1" : ""}`);
    if (r.ok) {
      const { settings: rows } = await r.json();
      setSettings(rows ?? []);
      const apiRow = (rows ?? []).find((s: SettingRow) => s.key === "api_keys");
      if (raw && apiRow) setRawKeys(apiRow.value as Record<string, string>);
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "api_keys", value: rawKeys }),
      });
      if (!r.ok) throw new Error(await r.text());
      setMsg("✅ Salvo!");
      setShowRaw(false);
      await load();
      setTimeout(() => setMsg(null), 4000);
    } catch (e) {
      setMsg("Erro ao salvar: " + (e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  const apiRow = settings.find((s) => s.key === "api_keys");
  const masked = (apiRow?.value ?? {}) as Record<string, string>;
  const providers = [
    { key: "openai", label: "OpenAI (GPT-4o, DALL-E, Whisper)", hint: "sk-proj-... — https://platform.openai.com/api-keys" },
    { key: "elevenlabs", label: "ElevenLabs (voz)", hint: "sk_... — https://elevenlabs.io/app/settings/api-keys" },
    { key: "fal", label: "Fal.ai (imagem/vídeo)", hint: "key_... — https://fal.ai/dashboard/keys" },
    { key: "replicate", label: "Replicate (imagem/vídeo)", hint: "r8_... — https://replicate.com/account/api-tokens" },
  ];

  return (
    <div className="card space-y-4 p-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">API Keys dos providers</h2>
        <p className="mt-1 text-xs text-loog-muted/80">
          Cole as chaves dos serviços que quer habilitar. Somente admins veem/editam. As chaves não são expostas ao frontend em uso — o servidor injeta nos requests.
        </p>
      </div>

      {!showRaw ? (
        <>
          <div className="space-y-2">
            {providers.map((p) => {
              const hasKey = masked[p.key] && masked[p.key] !== "";
              return (
                <div key={p.key} className="flex items-center justify-between rounded-lg border border-loog-border px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">{p.label}</div>
                    <div className="text-[11px] text-loog-muted">
                      {hasKey ? <>Configurado: <code>{masked[p.key]}</code></> : "Não configurado"}
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", hasKey ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300")}>
                    {hasKey ? "OK" : "vazio"}
                  </span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="btn-primary !py-2 !text-xs"
            onClick={async () => { await load(true); setShowRaw(true); }}
          >
            Editar chaves
          </button>
        </>
      ) : (
        <>
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.key}>
                <label className="label mb-1.5">{p.label}</label>
                <input
                  type="password"
                  className="input"
                  value={rawKeys[p.key] ?? ""}
                  onChange={(e) => setRawKeys({ ...rawKeys, [p.key]: e.target.value })}
                  placeholder={p.hint}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1 !py-2 !text-xs" onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" className="btn-ghost !py-2 !text-xs" onClick={() => { setShowRaw(false); load(); }}>
              Cancelar
            </button>
          </div>
        </>
      )}
      {msg && <div className="rounded-lg border border-loog-border bg-loog-panel/40 px-3 py-2 text-xs">{msg}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 2: Grupos regionais
// ────────────────────────────────────────────────────────────────────────────
function GroupsTab() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [form, setForm] = useState({ name: "", region: "", description: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/groups");
    if (r.ok) setGroups((await r.json()).groups ?? []);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          region: form.region.trim() || null,
          description: form.description.trim() || null,
        }),
      });
      if (r.ok) {
        setForm({ name: "", region: "", description: "" });
        await load();
      }
    } finally { setBusy(false); }
  }

  async function rename(id: string) {
    const cur = groups.find((g) => g.id === id);
    const name = prompt("Novo nome do grupo:", cur?.name ?? "");
    if (!name || !name.trim() || name === cur?.name) return;
    const r = await fetch(`/api/admin/groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (r.ok) load();
  }
  async function remove(id: string) {
    const cur = groups.find((g) => g.id === id);
    if (!confirm(`Excluir grupo "${cur?.name}"? Os membros ficam sem grupo.`)) return;
    const r = await fetch(`/api/admin/groups/${id}`, { method: "DELETE" });
    if (r.ok) load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <form onSubmit={create} className="card space-y-3 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Novo grupo</h3>
        <div>
          <label className="label mb-1.5">Nome</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Sul Fluminense" />
        </div>
        <div>
          <label className="label mb-1.5">Região</label>
          <input className="input" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Ex.: Rio de Janeiro" />
        </div>
        <div>
          <label className="label mb-1.5">Descrição</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="opcional" />
        </div>
        <button className="btn-primary w-full !py-2 !text-xs" disabled={busy || !form.name.trim()}>
          + Criar grupo
        </button>
      </form>

      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-loog-muted">Grupos existentes ({groups.length})</h3>
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-loog-border p-8 text-center text-loog-muted">
            Nenhum grupo criado ainda.
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between rounded-lg border border-loog-border px-3 py-2">
                <div>
                  <div className="text-sm font-semibold">{g.name}</div>
                  <div className="text-[11px] text-loog-muted">
                    {g.region && <>{g.region} · </>}
                    {g.member_count} membro(s)
                  </div>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="rounded p-1 text-xs hover:bg-white/10" onClick={() => rename(g.id)}>✎</button>
                  <button type="button" className="rounded p-1 text-xs hover:bg-red-500/20 text-red-400" onClick={() => remove(g.id)}>🗑</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 3: Gestores / Consultores
// ────────────────────────────────────────────────────────────────────────────
function GestoresTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "gestor" as "gestor" | "consultant",
    group_id: "" as string,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "admin" | "gestor" | "consultant">("all");

  async function load() {
    const [p, g] = await Promise.all([
      fetch("/api/admin/gestores").then((r) => r.json()),
      fetch("/api/admin/groups").then((r) => r.json()),
    ]);
    setProfiles(p.profiles ?? []);
    setGroups(g.groups ?? []);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/gestores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
          group_id: form.group_id || null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setMsg(`✅ Criado: ${form.email}`);
      setForm({ email: "", password: "", full_name: "", role: "gestor", group_id: "" });
      await load();
    } catch (e) {
      setMsg("Erro: " + (e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function updateProfile(id: string, patch: Record<string, unknown>) {
    const r = await fetch(`/api/admin/gestores/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (r.ok) load();
  }
  async function resetPass(id: string) {
    const pass = prompt("Nova senha (mín 6):");
    if (!pass || pass.length < 6) return;
    const r = await fetch(`/api/admin/gestores/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass }),
    });
    alert(r.ok ? "Senha alterada." : "Falhou.");
  }
  async function remove(id: string, email: string) {
    if (!confirm(`Excluir user ${email}? Não pode ser desfeito.`)) return;
    const r = await fetch(`/api/admin/gestores/${id}`, { method: "DELETE" });
    if (r.ok) load();
  }

  const filtered = filter === "all" ? profiles : profiles.filter((p) => p.role === filter);

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card grid gap-3 p-5 md:grid-cols-5">
        <input className="input" type="email" required placeholder="email@exemplo.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" type="text" required placeholder="Nome completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <input className="input" type="password" required minLength={6} placeholder="Senha (mín 6)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "gestor" | "consultant" })}>
          <option value="gestor">Gestor</option>
          <option value="consultant">Consultor</option>
        </select>
        <div className="flex gap-2">
          <select className="input flex-1" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
            <option value="">Sem grupo</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button className="btn-primary !px-4 !text-xs" disabled={busy}>+</button>
        </div>
      </form>
      {msg && <div className="rounded-lg border border-loog-border bg-loog-panel/40 px-3 py-2 text-xs">{msg}</div>}

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1">
            {(["all", "admin", "gestor", "consultant"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn("rounded-lg px-3 py-1.5 text-xs", filter === f ? "bg-loog-brand text-white" : "text-loog-muted hover:text-white")}
              >
                {f === "all" ? "Todos" : f}
              </button>
            ))}
          </div>
          <span className="text-xs text-loog-muted">{filtered.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-loog-border text-left text-[10px] uppercase text-loog-muted">
                <th className="py-2">Nome / Email</th>
                <th className="py-2">Role</th>
                <th className="py-2">Status</th>
                <th className="py-2">Grupo</th>
                <th className="py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-loog-border/30">
                  <td className="py-2">
                    <div className="font-semibold">{p.full_name || "—"}</div>
                    <div className="text-[11px] text-loog-muted">{p.email}</div>
                  </td>
                  <td className="py-2">
                    <select
                      className="input !py-1 !text-[11px]"
                      value={p.role}
                      onChange={(e) => updateProfile(p.id, { role: e.target.value })}
                    >
                      <option value="admin">admin</option>
                      <option value="gestor">gestor</option>
                      <option value="consultant">consultant</option>
                    </select>
                  </td>
                  <td className="py-2">
                    <select
                      className="input !py-1 !text-[11px]"
                      value={p.status}
                      onChange={(e) => updateProfile(p.id, { status: e.target.value })}
                    >
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </select>
                  </td>
                  <td className="py-2">
                    <select
                      className="input !py-1 !text-[11px]"
                      value={p.group_id ?? ""}
                      onChange={(e) => updateProfile(p.id, { group_id: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" className="rounded px-2 py-1 text-xs hover:bg-white/10" onClick={() => resetPass(p.id)}>Senha</button>
                    <button type="button" className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20" onClick={() => remove(p.id, p.email)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TAB 4: Quotas
// ────────────────────────────────────────────────────────────────────────────
type QuotaRole = "consultor" | "gestor" | "admin";
type QuotaKey = "text" | "image" | "voice_chars" | "transcribe_min";

function QuotasTab() {
  const [quotas, setQuotas] = useState<Record<QuotaRole, Record<QuotaKey, number>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/admin/settings");
    if (r.ok) {
      const { settings } = await r.json();
      const q = settings.find((s: SettingRow) => s.key === "quotas");
      if (q) setQuotas(q.value as Record<QuotaRole, Record<QuotaKey, number>>);
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!quotas) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "quotas", value: quotas }),
      });
      setMsg(r.ok ? "✅ Salvo" : "Erro");
      setTimeout(() => setMsg(null), 3000);
    } finally { setSaving(false); }
  }

  if (!quotas) return <div className="card p-6 text-center text-loog-muted">Carregando…</div>;

  const roles: QuotaRole[] = ["consultor", "gestor", "admin"];
  const keys: [QuotaKey, string][] = [
    ["text", "Textos IA / mês"],
    ["image", "Imagens IA / mês"],
    ["voice_chars", "Caracteres de voz / mês"],
    ["transcribe_min", "Minutos transcrição / mês"],
  ];

  return (
    <div className="card space-y-4 p-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Quotas mensais por role</h2>
        <p className="mt-1 text-xs text-loog-muted/80">Use <code>-1</code> pra ilimitado. As quotas resetam automaticamente no dia 1 de cada mês.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-loog-border text-left text-[10px] uppercase text-loog-muted">
              <th className="py-2">Recurso</th>
              {roles.map((r) => <th key={r} className="py-2 text-center capitalize">{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {keys.map(([k, label]) => (
              <tr key={k} className="border-b border-loog-border/30">
                <td className="py-2 text-loog-muted">{label}</td>
                {roles.map((r) => (
                  <td key={r} className="py-2 text-center">
                    <input
                      type="number"
                      className="input !w-24 !py-1 !text-center !text-xs"
                      value={quotas[r][k]}
                      onChange={(e) => setQuotas({ ...quotas, [r]: { ...quotas[r], [k]: Number(e.target.value) } })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary !py-2 !text-xs" onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar quotas"}
        </button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}
