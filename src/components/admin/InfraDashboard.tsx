"use client";

import { useState } from "react";

type Tool = {
  key: string;
  name: string;
  emoji: string;
  description: string;
  purpose: string;
  publicUrl: string;
  localPort: number;
  dnsStatus: "pending" | "live";
  category: "db" | "automation" | "docs" | "analytics" | "crm" | "pdf";
};

const TOOLS: Tool[] = [
  {
    key: "n8n",
    name: "n8n",
    emoji: "⚡",
    description: "Workflow automation (triggers → ações)",
    purpose: "Automatiza fluxos: cotação criada → envia e-mail → cria tarefa no CRM → notifica no Slack.",
    publicUrl: "https://n8n.loogstudio.tech",
    localPort: 5678,
    dnsStatus: "pending",
    category: "automation",
  },
  {
    key: "docuseal",
    name: "DocuSeal",
    emoji: "📝",
    description: "Assinatura eletrônica (DocuSign free)",
    purpose: "Associado + presidente/vice assinam o contrato PDF direto no celular. Trilha legal + hash SHA-256.",
    publicUrl: "https://docs.loogstudio.tech",
    localPort: 3010,
    dnsStatus: "pending",
    category: "docs",
  },
  {
    key: "stirling",
    name: "Stirling PDF",
    emoji: "📄",
    description: "Toolkit PDF server-side (60+ ferramentas)",
    purpose: "Gera PDFs premium, mescla contratos + apólice, aplica marca d'água LOOG, converte imagens → PDF.",
    publicUrl: "https://pdf.loogstudio.tech",
    localPort: 3011,
    dnsStatus: "pending",
    category: "pdf",
  },
  {
    key: "plausible",
    name: "Plausible Analytics",
    emoji: "📊",
    description: "Analytics LGPD-safe (GA free)",
    purpose: "Mede tráfego do Studio sem cookies. Sem Google Analytics. Dashboard aberto pra equipe.",
    publicUrl: "https://analytics.loogstudio.tech",
    localPort: 3012,
    dnsStatus: "pending",
    category: "analytics",
  },
  {
    key: "twenty",
    name: "Twenty CRM",
    emoji: "💎",
    description: "CRM moderno (open source alt. Salesforce)",
    purpose: "CRM espelhado do nosso. Útil para experimentar funcionalidades novas antes de portar pro CRM nativo.",
    publicUrl: "https://crm.loogstudio.tech",
    localPort: 3013,
    dnsStatus: "pending",
    category: "crm",
  },
  {
    key: "postgres",
    name: "PostgreSQL",
    emoji: "🐘",
    description: "Banco compartilhado (n8n + docuseal + plausible + twenty)",
    purpose: "Base única para todas as tools evitar múltiplos Postgres. Backup via crontab (planejado).",
    publicUrl: "",
    localPort: 5432,
    dnsStatus: "pending",
    category: "db",
  },
  {
    key: "clickhouse",
    name: "ClickHouse",
    emoji: "🔥",
    description: "Analytics DB pro Plausible",
    purpose: "Base colunar otimizada pros eventos de analytics. Suporta bilhões de pageviews.",
    publicUrl: "",
    localPort: 8123,
    dnsStatus: "pending",
    category: "db",
  },
];

const CATEGORY_COLOR: Record<Tool["category"], string> = {
  db: "border-slate-500/40 bg-slate-500/5",
  automation: "border-violet-500/40 bg-violet-500/5",
  docs: "border-blue-500/40 bg-blue-500/5",
  analytics: "border-emerald-500/40 bg-emerald-500/5",
  crm: "border-pink-500/40 bg-pink-500/5",
  pdf: "border-amber-500/40 bg-amber-500/5",
};

export function InfraDashboard() {
  const [checking, setChecking] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, "unknown" | "up" | "down">>({});

  async function check(tool: Tool) {
    if (!tool.publicUrl) return;
    setChecking(tool.key);
    try {
      const resp = await fetch(`/api/admin/infra/ping?url=${encodeURIComponent(tool.publicUrl)}`);
      const data = await resp.json();
      setStatuses((s) => ({ ...s, [tool.key]: data.ok ? "up" : "down" }));
    } catch {
      setStatuses((s) => ({ ...s, [tool.key]: "down" }));
    } finally {
      setChecking(null);
    }
  }

  const activeCount = TOOLS.length;

  return (
    <div className="space-y-6">
      {/* Banner VPS */}
      <div className="rounded-xl border border-loog-brand/40 bg-loog-brand/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold text-white">🖥️ VPS Hostinger LOOG</h3>
            <p className="mt-1 text-xs text-loog-muted">
              <code className="text-white">srv1995983.hstgr.cloud</code> · <code className="text-white">2.25.189.22</code> · Ubuntu 24.04 LTS · Docker Compose v2
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Pill emoji="📦" label={`${activeCount} containers UP`} />
              <Pill emoji="💾" label="21 GB disco" />
              <Pill emoji="🧠" label="2.4 GB RAM" />
              <Pill emoji="💸" label="R$ 50/mês (VPS)" />
            </div>
          </div>
          <div>
            <a
              href="https://hpanel.hostinger.com/vps"
              target="_blank"
              rel="noreferrer"
              className="rounded border border-loog-border bg-loog-bg px-3 py-1.5 text-xs text-white/80 hover:border-loog-brand"
            >
              🔗 Painel Hostinger
            </a>
          </div>
        </div>
      </div>

      {/* DNS status banner */}
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
        <h3 className="font-display text-sm font-bold text-amber-200">⚠️ DNS wildcard pendente</h3>
        <p className="mt-1 text-xs text-amber-100/80">
          Os subdomínios abaixo (<code className="text-white">n8n.loogstudio.tech</code>, <code className="text-white">docs.loogstudio.tech</code>, etc) precisam de um registro A wildcard: <code className="text-white">*.loogstudio.tech → 2.25.189.22</code>.
          Enquanto o DNS não existe, as tools só são acessíveis via <strong className="text-white">SSH tunnel</strong> (ver abaixo).
        </p>
      </div>

      {/* Tools grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const st = statuses[tool.key] ?? "unknown";
          return (
            <article key={tool.key} className={`rounded-xl border p-4 ${CATEGORY_COLOR[tool.category]}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{tool.emoji}</span>
                  <div>
                    <h3 className="font-display text-base font-bold text-white">{tool.name}</h3>
                    <div className="text-[11px] text-loog-muted">{tool.description}</div>
                  </div>
                </div>
                <StatusDot status={st} />
              </div>

              <p className="mt-3 text-xs text-white/80">{tool.purpose}</p>

              <div className="mt-3 space-y-1 text-[11px]">
                <div className="text-loog-muted">
                  Porta local: <code className="text-white">127.0.0.1:{tool.localPort}</code>
                </div>
                {tool.publicUrl && (
                  <div className="text-loog-muted">
                    URL pública: <code className="text-white">{tool.publicUrl.replace("https://", "")}</code>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {tool.publicUrl && (
                  <>
                    <a
                      href={tool.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-loog-border bg-loog-bg/60 px-2.5 py-1 text-[11px] text-white/80 hover:border-loog-brand"
                    >
                      Abrir ↗
                    </a>
                    <button
                      onClick={() => check(tool)}
                      disabled={checking === tool.key}
                      className="rounded border border-loog-brand/40 bg-loog-brand/10 px-2.5 py-1 text-[11px] text-loog-brand hover:bg-loog-brand/20 disabled:opacity-50"
                    >
                      {checking === tool.key ? "..." : "🏓 Ping"}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* SSH tunnel bloco */}
      <div className="rounded-xl border border-loog-border bg-loog-panel p-5">
        <h3 className="font-display text-sm font-bold text-white">🔐 Como acessar agora (SSH tunnel)</h3>
        <p className="mt-1 text-xs text-loog-muted">
          Enquanto o DNS wildcard não existe, use SSH tunnel do laptop para a VPS:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-loog-border bg-loog-bg p-3 text-[11px] text-white/80">
{`ssh -L 5678:127.0.0.1:5678 \\
    -L 3010:127.0.0.1:3010 \\
    -L 3011:127.0.0.1:3011 \\
    -L 3012:127.0.0.1:3012 \\
    -L 3013:127.0.0.1:3013 \\
    root@2.25.189.22

# Depois abra no navegador:
#   http://localhost:5678   (n8n)
#   http://localhost:3010   (DocuSeal)
#   http://localhost:3011   (Stirling PDF)
#   http://localhost:3012   (Plausible)
#   http://localhost:3013   (Twenty CRM)`}
        </pre>
        <p className="mt-3 text-xs text-loog-muted">
          Credenciais iniciais em <code className="text-white">/opt/gratos-stack/.env</code> na VPS (chmod 600). Peça acesso ao admin se precisar.
        </p>
      </div>
    </div>
  );
}

function Pill({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-loog-border bg-loog-panel px-2.5 py-1 text-xs text-white/90">
      <span>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}

function StatusDot({ status }: { status: "unknown" | "up" | "down" }) {
  const colors = {
    unknown: "bg-loog-muted/40",
    up: "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]",
    down: "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]",
  };
  const labels = { unknown: "sem check", up: "online", down: "offline" };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${colors[status]}`} />
      <span className="text-[10px] uppercase tracking-wider text-loog-muted">{labels[status]}</span>
    </div>
  );
}
