"use client";

/**
 * LeadDetail — página do lead individual (/studio/leads/[id]).
 *
 * Mostra:
 *  - Resumo (contratante + status + sync badge)
 *  - Veículos
 *  - Pendências (com resolve/cancelar)
 *  - Documentos (lista)
 *  - Timeline completa
 *  - Ações: mudar status, re-sync SIVIS
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/errors/api-fetch";

type Status = "lead" | "prospect" | "pendencia" | "cliente" | "perdido";
type SyncStatus = "pending" | "synced" | "failed" | "skipped" | "stale";

interface Lead {
  id: string; consultor_id: string; status: Status;
  contratante_nome: string; contratante_email: string | null;
  contratante_cpf: string | null; contratante_telefone: string | null;
  contratante_cep: string | null; contratante_endereco: string | null;
  contratante_cidade: string | null; contratante_uf: string | null;
  procedencia: string | null; observacao: string | null;
  sivis_id: string | null; sivis_sync_status: SyncStatus;
  sivis_sync_error: string | null; sivis_last_sync_at: string | null;
  created_at: string; updated_at: string;
}

interface Vehicle { id: string; placa: string | null; marca: string; modelo: string; ano_modelo: number | null; tipo: string; valor_fipe_formatado: string | null; fipe_code: string | null; }
interface Document { id: string; tipo: string; filename: string; mime_type: string | null; size_bytes: number | null; storage_path: string; sivis_sync_status: SyncStatus; uploaded_at: string; }
interface Pendencia { id: string; tipo: string; descricao: string | null; status: "aberta" | "resolvida" | "cancelada"; auto_resolvida: boolean; resolvida_em: string | null; created_at: string; }
interface TimelineEvent { id: string; evento: string; detalhes: Record<string, unknown> | null; created_at: string; actor_id: string | null; }

const TRANSICOES: Record<Status, Status[]> = {
  lead: ["prospect", "perdido"],
  prospect: ["pendencia", "cliente", "perdido"],
  pendencia: ["cliente", "perdido"],
  cliente: [],
  perdido: ["lead"],
};

const STATUS_META: Record<Status, { label: string; className: string; emoji: string }> = {
  lead:      { label: "Lead",       emoji: "🌱", className: "bg-sky-500/15 text-sky-200 border-sky-500/30" },
  prospect:  { label: "Prospect",   emoji: "🎯", className: "bg-amber-500/15 text-amber-200 border-amber-500/30" },
  pendencia: { label: "Pendência",  emoji: "📋", className: "bg-orange-500/15 text-orange-200 border-orange-500/30" },
  cliente:   { label: "Cliente",    emoji: "✅", className: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" },
  perdido:   { label: "Perdido",    emoji: "❌", className: "bg-rose-500/15 text-rose-200 border-rose-500/30" },
};

const SYNC_META: Record<SyncStatus, { emoji: string; label: string; className: string }> = {
  pending:  { emoji: "🟡", label: "Sincronizando", className: "bg-amber-500/15 text-amber-200 border-amber-500/30" },
  synced:   { emoji: "🟢", label: "Sincronizado",   className: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" },
  failed:   { emoji: "🔴", label: "Falhou",         className: "bg-rose-500/15 text-rose-200 border-rose-500/30" },
  skipped:  { emoji: "⚪", label: "Pulado",          className: "bg-loog-border text-loog-muted border-loog-border" },
  stale:    { emoji: "🔵", label: "Divergente",     className: "bg-blue-500/15 text-blue-200 border-blue-500/30" },
};

export function LeadDetail({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/leads/${leadId}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
      setLead(data.lead);
      setVehicles(data.vehicles ?? []);
      setDocuments(data.documents ?? []);
      setPendencias(data.pendencias ?? []);
      setTimeline(data.timeline ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const mudarStatus = useCallback(async (novo: Status) => {
    setActing(`status-${novo}`);
    try {
      const r = await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha");
    } finally {
      setActing(null);
    }
  }, [leadId, load]);

  const forcarSync = useCallback(async () => {
    setActing("sync");
    try {
      const r = await apiFetch(`/api/leads/${leadId}/sync`, { method: "POST" });
      if (!r.ok) throw new Error("Falha ao enfileirar");
      await load();
      alert("Sincronização enfileirada. Vai processar nos próximos minutos.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha");
    } finally {
      setActing(null);
    }
  }, [leadId, load]);

  const resolverPendencia = useCallback(async (pendId: string) => {
    setActing(`pend-${pendId}`);
    try {
      await apiFetch(`/api/leads/${leadId}/pendencias/${pendId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolvida" }),
      });
      await load();
    } finally {
      setActing(null);
    }
  }, [leadId, load]);

  const deletar = useCallback(async () => {
    if (!confirm("Deletar esse lead? Essa ação não pode ser desfeita.")) return;
    setActing("delete");
    try {
      const r = await apiFetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Falha ao deletar");
      router.push("/studio/leads");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha");
      setActing(null);
    }
  }, [leadId, router]);

  if (loading) return <div className="p-10 text-center text-loog-muted">Carregando…</div>;
  if (error) return <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-rose-200">{error}</div>;
  if (!lead) return <div className="p-10 text-center text-loog-muted">Lead não encontrado.</div>;

  const statusMeta = STATUS_META[lead.status];
  const syncMeta = SYNC_META[lead.sivis_sync_status];
  const transicoesPossiveis = TRANSICOES[lead.status] ?? [];

  return (
    <div className="space-y-5">
      <Link href="/studio/leads" className="text-sm text-loog-muted hover:text-white">← Voltar aos leads</Link>

      {/* Header */}
      <div className="rounded-2xl border border-loog-border bg-loog-panel p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">{lead.contratante_nome}</h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${statusMeta.className}`}>
                {statusMeta.emoji} {statusMeta.label}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${syncMeta.className}`}>
                {syncMeta.emoji} SIVIS: {syncMeta.label}
              </span>
              {lead.sivis_id && (
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-200">
                  #{lead.sivis_id}
                </span>
              )}
            </div>
          </div>
        </div>

        {lead.sivis_sync_status === "failed" && lead.sivis_sync_error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
            <strong>Erro na sincronização:</strong> {lead.sivis_sync_error}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {transicoesPossiveis.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => mudarStatus(t)}
              disabled={acting !== null}
              className={`rounded-xl px-4 py-2 text-xs font-semibold text-white transition ${STATUS_META[t].className.replace("/15", "/20")} border hover:brightness-125 disabled:opacity-50`}
            >
              → {STATUS_META[t].emoji} {STATUS_META[t].label}
            </button>
          ))}
          <button
            type="button"
            onClick={forcarSync}
            disabled={acting !== null || lead.sivis_sync_status === "synced"}
            className="rounded-xl border border-loog-border bg-loog-panel px-4 py-2 text-xs font-semibold text-loog-muted hover:text-white hover:border-loog-brand/40 disabled:opacity-50"
          >
            🔄 Re-sync SIVIS
          </button>
        </div>
      </div>

      {/* Dados do contratante */}
      <Section title="Contratante">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <InfoRow label="E-mail" value={lead.contratante_email} />
          <InfoRow label="CPF" value={lead.contratante_cpf} />
          <InfoRow label="Telefone" value={lead.contratante_telefone} />
          <InfoRow label="Cidade/UF" value={[lead.contratante_cidade, lead.contratante_uf].filter(Boolean).join("/")} />
          <InfoRow label="Endereço" value={lead.contratante_endereco} />
          <InfoRow label="CEP" value={lead.contratante_cep} />
          <InfoRow label="Procedência" value={lead.procedencia} />
        </div>
      </Section>

      {/* Veículos */}
      <Section title={`Veículos (${vehicles.length})`}>
        {vehicles.length === 0 ? (
          <p className="text-sm text-loog-muted">Nenhum veículo cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {vehicles.map((v) => (
              <div key={v.id} className="rounded-xl border border-loog-border bg-loog-bg p-3">
                <div className="text-sm font-semibold text-white">{v.marca} {v.modelo}</div>
                <div className="text-xs text-loog-muted mt-1">
                  {v.ano_modelo} · {v.tipo}
                  {v.placa && <> · Placa {v.placa}</>}
                  {v.valor_fipe_formatado && <> · FIPE {v.valor_fipe_formatado}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Pendências */}
      <Section title={`Pendências (${pendencias.filter((p) => p.status === "aberta").length} abertas)`}>
        {pendencias.length === 0 ? (
          <p className="text-sm text-loog-muted">Nenhuma pendência.</p>
        ) : (
          <div className="space-y-2">
            {pendencias.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-loog-border bg-loog-bg p-3">
                <div>
                  <div className="text-sm text-white">{p.tipo}</div>
                  {p.descricao && <div className="text-xs text-loog-muted mt-1">{p.descricao}</div>}
                  {p.status === "resolvida" && (
                    <div className="text-xs text-emerald-300 mt-1">
                      ✓ Resolvida {p.auto_resolvida ? "automaticamente" : ""}
                    </div>
                  )}
                </div>
                {p.status === "aberta" && (
                  <button
                    type="button"
                    onClick={() => resolverPendencia(p.id)}
                    disabled={acting !== null}
                    className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:brightness-125 disabled:opacity-50"
                  >
                    Resolver
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Documentos */}
      <Section title={`Documentos (${documents.length})`}>
        {documents.length === 0 ? (
          <p className="text-sm text-loog-muted">Nenhum documento enviado.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-loog-border bg-loog-bg p-3">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {docLabel(d.tipo)} · <span className="font-normal text-loog-muted">{d.filename}</span>
                  </div>
                  <div className="text-xs text-loog-muted mt-1">
                    {d.size_bytes && <>{(d.size_bytes / 1024).toFixed(0)}KB · </>}
                    {d.mime_type}
                    <span className="ml-2">{SYNC_META[d.sivis_sync_status].emoji} {SYNC_META[d.sivis_sync_status].label}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Timeline */}
      <Section title={`Timeline (${timeline.length})`}>
        {timeline.length === 0 ? (
          <p className="text-sm text-loog-muted">Sem eventos.</p>
        ) : (
          <ol className="space-y-2 relative border-l-2 border-loog-border pl-4">
            {timeline.map((e) => (
              <li key={e.id} className="relative">
                <div className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-loog-brand"></div>
                <div className="text-sm text-white">{formatEvento(e.evento)}</div>
                {e.detalhes && Object.keys(e.detalhes).length > 0 && (
                  <div className="text-xs text-loog-muted mt-1 break-words">
                    {Object.entries(e.detalhes).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                  </div>
                )}
                <div className="text-[10px] text-loog-muted/70 mt-1">{new Date(e.created_at).toLocaleString("pt-BR")}</div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Zona de perigo (apenas admin via API) */}
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
        <h3 className="text-sm font-bold text-rose-200">Zona de perigo</h3>
        <p className="text-xs text-rose-200/70 mt-1">
          Deletar o lead remove todos os dados associados (veículos, documentos, pendências, timeline). Prefira mudar status pra &quot;Perdido&quot;.
        </p>
        <button
          type="button"
          onClick={deletar}
          disabled={acting !== null}
          className="mt-3 rounded-lg bg-rose-500/20 border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:brightness-125 disabled:opacity-50"
        >
          Deletar lead
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-loog-border bg-loog-panel p-5">
      <h2 className="font-display text-lg font-bold text-white mb-3">{title}</h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-loog-muted">{label}</div>
      <div className="text-white">{value}</div>
    </div>
  );
}

function docLabel(tipo: string): string {
  const map: Record<string, string> = {
    cnh: "CNH",
    crlv: "CRLV",
    comprovante_residencia: "Comp. Residência",
    comprovante_renda: "Comp. Renda",
    selfie: "Selfie",
    outros: "Outros",
  };
  return map[tipo] ?? tipo;
}

function formatEvento(evento: string): string {
  const map: Record<string, string> = {
    lead_criado: "📝 Lead criado",
    lead_atualizado: "✏️ Lead atualizado",
    lead_deletado: "🗑️ Lead deletado",
    veiculo_adicionado: "🚗 Veículo adicionado",
    veiculo_removido: "🗑️ Veículo removido",
    doc_enviado: "📎 Documento enviado",
    doc_removido: "🗑️ Documento removido",
    pendencia_criada: "📋 Pendência criada",
    pendencia_resolvida: "✅ Pendência resolvida",
    pendencia_cancelada: "❌ Pendência cancelada",
    status_mudou: "🔄 Status mudou",
    sivis_sync_enfileirado: "📤 Sync SIVIS enfileirado",
    sivis_sync_ok: "🟢 Sync SIVIS ok",
    sivis_sync_falhou: "🔴 Sync SIVIS falhou",
    nota: "📝 Nota",
  };
  return map[evento] ?? evento;
}
