"use client";

import { useState } from "react";

interface Member {
  id: string;
  matricula: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  status: string;
  created_at: string;
  group_id: string | null;
  owner_consultant_id: string | null;
}

interface Vehicle {
  id: string;
  placa: string;
  tipo: string;
  marca: string;
  modelo: string;
  ano_modelo: number;
  fipe_code: string | null;
  fipe_value_cents: number | null;
  active: boolean;
}

interface CrmContact {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  temperatura: string | null;
  status_ciclo: string | null;
  pipeline_stage: string | null;
  last_touch_at: string | null;
}

interface SearchResult {
  query: { cpf?: string; nome?: string };
  studio: {
    members: Member[];
    vehicles: Vehicle[];
    crm_contacts: CrmContact[];
    counts: { members: number; vehicles: number; crm: number };
  };
  plusassist: { status: string; url: string; instruction: string };
  hub_sivis: { status: string; note: string };
}

const PLUSASSIST_LOGIN_URL = "https://sistemas.infornet.com.br/webassist/plusassist/";
const PLUSASSIST_CONSULTA_URL = "https://sistemas.infornet.com.br/webassist/plusassist/cliente/consultabeneficiario.php";

function brl(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCpf(cpf: string | null): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return cpf;
}

export function TriplicePane() {
  const [search, setSearch] = useState("");
  const [searchType, setSearchType] = useState<"cpf" | "nome">("cpf");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = search.trim();
    if (!q) {
      setError("Digite um CPF/CNPJ ou nome.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set(searchType, q);
      const res = await fetch(`/api/admin/triplice/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao buscar");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  function openPlusAssist() {
    // Primeiro abre a tela de consulta já logada (se admin já estiver com sessão PlusAssist)
    window.open(PLUSASSIST_CONSULTA_URL, "_blank", "noopener");
  }

  return (
    <div className="space-y-6">
      {/* Busca */}
      <form onSubmit={doSearch} className="rounded-xl border border-loog-border bg-loog-panel p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">
              Buscar por {searchType === "cpf" ? "CPF ou CNPJ" : "nome"}
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchType === "cpf" ? "ex: 04151058702 ou 04.151.058-702" : "ex: ALESSANDRO"}
              className="input w-full"
            />
          </div>
          <div className="inline-flex rounded-lg border border-loog-border bg-loog-bg p-1">
            <button
              type="button"
              onClick={() => setSearchType("cpf")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                searchType === "cpf" ? "bg-loog-brand text-white" : "text-loog-muted"
              }`}
            >
              CPF/CNPJ
            </button>
            <button
              type="button"
              onClick={() => setSearchType("nome")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                searchType === "nome" ? "bg-loog-brand text-white" : "text-loog-muted"
              }`}
            >
              Nome
            </button>
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Buscando..." : "🔱 Buscar nas 3 fontes"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">⚠️ {error}</p>}
      </form>

      {/* 3 colunas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ─── Coluna A: STUDIO ───────────────────────────────────── */}
        <Column
          index="A"
          title="LOOG Studio"
          subtitle="Base própria · Supabase"
          color="border-loog-brand/40 bg-loog-brand/5"
          emoji="⚡"
        >
          {!result ? (
            <EmptyHint msg="Busque por CPF ou nome pra ver dados daqui." />
          ) : (
            <StudioColumn r={result} />
          )}
        </Column>

        {/* ─── Coluna B: PLUSASSIST ───────────────────────────────── */}
        <Column
          index="B"
          title="PlusAssist (Infornet)"
          subtitle="ERP financeiro oficial"
          color="border-amber-500/40 bg-amber-500/5"
          emoji="💰"
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90">
              <strong>Modo manual.</strong> Clique abaixo pra abrir o PlusAssist em nova aba e buscar{" "}
              {result ? (
                <code className="rounded bg-loog-bg px-1 text-white">{searchType === "cpf" ? result.query.cpf : result.query.nome}</code>
              ) : (
                "o mesmo CPF/nome"
              )}{" "}
              lá.
            </div>
            <button
              onClick={openPlusAssist}
              className="w-full rounded-lg bg-amber-500/20 border border-amber-500/40 px-4 py-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/30"
            >
              ↗ Abrir PlusAssist em nova aba
            </button>
            {result && searchType === "cpf" && (
              <p className="text-[11px] text-loog-muted">
                Copie o CPF: <code className="rounded bg-loog-bg px-1 text-white">{result.query.cpf}</code>
              </p>
            )}
            <details className="group text-xs">
              <summary className="cursor-pointer text-loog-muted hover:text-white">
                ⚙️ Por que não é automático?
              </summary>
              <p className="mt-2 rounded-lg border border-loog-border bg-loog-bg p-3 text-loog-muted">
                O PlusAssist usa reCAPTCHA v3 no login — por segurança a Infornet exige navegador real.
                Automação direta é inviável sem resolver o captcha (serviços pagos ou Puppeteer).
                Caminho correto: pedir API oficial à Infornet.
              </p>
            </details>
          </div>
        </Column>

        {/* ─── Coluna C: SIVIS/HUB ────────────────────────────────── */}
        <Column
          index="C"
          title="SIVIS / Hub LOOG"
          subtitle="Sistema oficial via Hub Fastify"
          color="border-violet-500/40 bg-violet-500/5"
          emoji="🏢"
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-xs text-violet-100/80">
              <strong>Em breve.</strong> Hub Fastify vai expor endpoint de busca por associado no SIVIS.
            </div>
            <div className="rounded-lg border border-dashed border-loog-border p-4 text-center text-xs text-loog-muted">
              Integração pendente — placeholder pra Fase 2
            </div>
          </div>
        </Column>
      </div>

      {/* Rodapé explicativo */}
      <div className="rounded-xl border border-loog-border bg-loog-panel p-4 text-xs text-loog-muted">
        💡 <strong className="text-white">Como usar a Tríplice:</strong> busque pelo mesmo CPF/nome nos 3 sistemas e
        compare visualmente. Qualquer divergência de dados (endereço, telefone, status, placas) aparece lado-a-lado.
        A sincronização automática entre as 3 fontes depende de infra adicional — hoje a comparação é manual.
      </div>
    </div>
  );
}

function Column({ index, title, subtitle, color, emoji, children }: {
  index: string;
  title: string;
  subtitle: string;
  color: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`rounded-xl border p-4 ${color}`}>
      <div className="mb-3 flex items-start justify-between gap-2 border-b border-current/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{emoji}</span>
          <div>
            <h3 className="font-display text-base font-bold text-white">{title}</h3>
            <div className="text-[10px] text-loog-muted">{subtitle}</div>
          </div>
        </div>
        <span className="rounded-full border border-current/30 bg-current/10 px-2 py-0.5 text-[10px] font-bold">
          {index}
        </span>
      </div>
      {children}
    </article>
  );
}

function EmptyHint({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-dashed border-loog-border p-6 text-center text-xs text-loog-muted">
      {msg}
    </div>
  );
}

function StudioColumn({ r }: { r: SearchResult }) {
  const { members, vehicles, crm_contacts, counts } = r.studio;

  if (counts.members === 0 && counts.crm === 0) {
    return (
      <div className="space-y-2">
        <EmptyHint msg="Nada encontrado no Studio." />
        <div className="text-[11px] text-loog-muted">
          Se o PlusAssist (coluna B) achar, você pode <strong className="text-white">importar manualmente</strong> em /admin/associados.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      {/* Members */}
      {members.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-loog-muted">
              👤 Associado{members.length > 1 ? "s" : ""} ({members.length})
            </h4>
          </div>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="rounded-lg border border-loog-border bg-loog-bg/60 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{m.nome}</div>
                    <div className="truncate text-[10px] text-loog-muted">
                      {formatCpf(m.cpf_cnpj)} · {m.matricula}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                    m.status === "ativo"
                      ? "border-green-500/40 bg-green-500/10 text-green-300"
                      : "border-red-500/40 bg-red-500/10 text-red-300"
                  }`}>
                    {m.status}
                  </span>
                </div>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
                  {m.telefone && (<><dt className="text-loog-muted">tel:</dt><dd className="text-white">{m.telefone}</dd></>)}
                  {m.email && (<><dt className="text-loog-muted">email:</dt><dd className="truncate text-white">{m.email}</dd></>)}
                  {(m.cidade || m.uf) && (<><dt className="text-loog-muted">local:</dt><dd className="text-white">{[m.cidade, m.uf].filter(Boolean).join("/")}</dd></>)}
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vehicles */}
      {vehicles.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-loog-muted">
            🚗 Veículos ({vehicles.length})
          </h4>
          <div className="space-y-1">
            {vehicles.map((v) => (
              <div key={v.id} className="rounded border border-loog-border bg-loog-bg/60 p-2 text-[10px]">
                <div className="font-mono font-bold text-white">{v.placa}</div>
                <div className="text-loog-muted">
                  {v.marca} {v.modelo} {v.ano_modelo} · FIPE {brl(v.fipe_value_cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CRM contact */}
      {crm_contacts.length > 0 && (
        <div>
          <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-loog-muted">
            💬 Contato CRM ({crm_contacts.length})
          </h4>
          <div className="space-y-1">
            {crm_contacts.map((c) => (
              <div key={c.id} className="rounded border border-loog-border bg-loog-bg/60 p-2 text-[10px]">
                <div className="font-semibold text-white">{c.nome}</div>
                <div className="text-loog-muted">
                  {c.temperatura ?? "—"} · {c.status_ciclo ?? "—"} · {c.pipeline_stage ?? "sem etapa"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
