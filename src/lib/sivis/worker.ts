/**
 * Worker de sync SIVIS — consome sivis_sync_queue.
 *
 * Fluxo:
 *  1. Pega até N jobs com status pending/retry e next_attempt_at <= now
 *  2. Marca como "running"
 *  3. Executa a acao via SivisHttpAdapter (login + chamada)
 *  4. Grava resultado:
 *     - sucesso: status="done", completed_at=now, atualiza leads.sivis_* ou lead_documents.sivis_*
 *     - falha: incrementa attempts, se < max_attempts volta pra "retry" com backoff, senão "failed"
 *
 * Chamado por Netlify Scheduled Function (cron) a cada 1 minuto.
 * Usa service_role pra bypassar RLS (precisa SUPABASE_SERVICE_ROLE_KEY).
 */
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "./crypto";
import { SivisHttpAdapter, SivisAuthError, SivisApiError, type SivisSession } from "./http-adapter";
import type { LeadInput } from "./http-adapter";

type QueueJob = {
  id: string;
  lead_id: string;
  consultor_id: string;
  action: "create_lead" | "update_lead" | "upload_doc" | "add_pendencia" | "resolve_pendencia" | "update_status" | "finalizar_adesao" | "cancelar_adesao";
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

const BATCH_SIZE = 10;
const BACKOFF_SECS = [10, 30, 60, 180, 600]; // 10s, 30s, 1m, 3m, 10m

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_* nao configurado no worker");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function processSyncQueue(): Promise<{ processed: number; errors: number }> {
  const supabase = serviceClient();
  const nowIso = new Date().toISOString();

  // Pega jobs prontos pra rodar
  const { data: jobs, error } = await supabase
    .from("sivis_sync_queue")
    .select("id, lead_id, consultor_id, action, payload, attempts, max_attempts")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error || !jobs || jobs.length === 0) {
    return { processed: 0, errors: 0 };
  }

  // Agrupa por consultor pra fazer 1 login só por consultor
  const porConsultor = new Map<string, QueueJob[]>();
  for (const j of jobs as QueueJob[]) {
    (porConsultor.get(j.consultor_id) ?? porConsultor.set(j.consultor_id, []).get(j.consultor_id)!).push(j);
  }

  let processed = 0;
  let errors = 0;

  for (const [consultorId, consultorJobs] of porConsultor) {
    // Marca os jobs do consultor como running
    await supabase
      .from("sivis_sync_queue")
      .update({ status: "running" })
      .in("id", consultorJobs.map((j) => j.id));

    // Login SIVIS do consultor
    let session: SivisSession | null = null;
    let loginError: string | null = null;
    try {
      const { data: cred } = await supabase
        .from("consultor_sivis_credentials")
        .select("sivis_login, sivis_password_encrypted")
        .eq("user_id", consultorId)
        .maybeSingle();
      if (!cred) throw new Error("Consultor sem credencial SIVIS cadastrada");
      const password = decrypt(cred.sivis_password_encrypted as string);
      session = await new SivisHttpAdapter().login(cred.sivis_login as string, password);
    } catch (e) {
      loginError = e instanceof Error ? e.message : String(e);
      console.warn("[sivis worker] login falhou:", consultorId, loginError);
    }

    // Processa cada job
    for (const job of consultorJobs) {
      if (!session) {
        // Login falhou → marca todos como retry/failed
        await handleFailure(supabase, job, loginError ?? "login falhou");
        errors++;
        continue;
      }
      try {
        await processJob(supabase, session, job);
        await supabase
          .from("sivis_sync_queue")
          .update({ status: "done", completed_at: new Date().toISOString(), last_error: null })
          .eq("id", job.id);
        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[sivis worker] job falhou:", job.action, job.id, msg);
        await handleFailure(supabase, job, msg);
        errors++;
      }
    }
  }

  return { processed, errors };
}

async function processJob(
  supabase: ReturnType<typeof serviceClient>,
  session: SivisSession,
  job: QueueJob,
) {
  const adapter = new SivisHttpAdapter();

  switch (job.action) {
    case "create_lead":
    case "update_lead": {
      // Monta LeadInput do banco (lead + primeiro veiculo)
      const { data: lead } = await supabase.from("leads").select("*").eq("id", job.lead_id).single();
      const { data: vehicles } = await supabase.from("lead_vehicles").select("*").eq("lead_id", job.lead_id).limit(1);
      const vehicle = vehicles?.[0];
      if (!lead || !vehicle) throw new Error("lead ou veiculo nao encontrado");

      const input: LeadInput = {
        nome: lead.contratante_nome,
        telefone: lead.contratante_telefone ?? "",
        procedencia: lead.procedencia ?? "29",
        cpf: lead.contratante_cpf ?? undefined,
        email: lead.contratante_email ?? undefined,
        veiculo: {
          placa: vehicle.placa ?? undefined,
          tipo: vehicle.tipo,
          marca: vehicle.marca,
          modelo: vehicle.modelo,
          anoModelo: vehicle.ano_modelo ?? 0,
          fipeCode: vehicle.fipe_code ?? undefined,
          combustivel: vehicle.combustivel ?? undefined,
          siglaCombustivel: vehicle.sigla_combustivel ?? undefined,
          mesReferenciaFipe: vehicle.mes_referencia_fipe ?? undefined,
          valorFipeCents: vehicle.valor_fipe_cents ?? undefined,
          consultaFipe: (vehicle.consulta_fipe === 2 ? 2 : 0),
        },
      };
      const { sivisLeadId } = await adapter.createLead(session, input);
      await supabase
        .from("leads")
        .update({
          sivis_id: sivisLeadId,
          sivis_sync_status: "synced",
          sivis_sync_error: null,
          sivis_last_sync_at: new Date().toISOString(),
          sivis_attempts: 0,
        })
        .eq("id", job.lead_id);
      await supabase.from("lead_timeline").insert({
        lead_id: job.lead_id,
        actor_id: null,
        evento: "sivis_sync_ok",
        detalhes: { action: job.action, sivis_id: sivisLeadId },
      });
      break;
    }
    case "upload_doc": {
      const docId = job.payload.document_id as string | undefined;
      if (!docId) throw new Error("document_id ausente no payload");
      const { data: doc } = await supabase.from("lead_documents").select("*").eq("id", docId).single();
      const { data: lead } = await supabase.from("leads").select("sivis_id").eq("id", job.lead_id).single();
      if (!doc) throw new Error("documento nao encontrado");
      if (!lead?.sivis_id) throw new Error("lead ainda nao sincronizado — faz create_lead antes");

      // Baixa do Storage
      const { data: file, error: dlErr } = await supabase.storage
        .from("lead-documents")
        .download(doc.storage_path);
      if (dlErr || !file) throw new Error(`baixar do Storage falhou: ${dlErr?.message}`);
      const bytes = new Uint8Array(await file.arrayBuffer());

      const { docId: sivisDocId } = await adapter.uploadDocument(session, {
        tipo: doc.tipo,
        filename: doc.filename,
        mimeType: doc.mime_type ?? "application/octet-stream",
        bytes,
        sivisLeadId: lead.sivis_id,
      });
      await supabase
        .from("lead_documents")
        .update({
          sivis_doc_id: sivisDocId ?? null,
          sivis_sync_status: "synced",
          sivis_sync_error: null,
          sivis_last_sync_at: new Date().toISOString(),
        })
        .eq("id", docId);
      break;
    }
    case "finalizar_adesao": {
      const { data: lead } = await supabase.from("leads").select("sivis_id").eq("id", job.lead_id).single();
      if (!lead?.sivis_id) throw new Error("sem sivis_id — nao da pra finalizar");
      // SIVIS espera id_plano (nao id_lead) — por ora passamos sivis_id, se nao bater ajustamos
      await adapter.finalizarAdesao(session, { id_plano: lead.sivis_id });
      await supabase.from("lead_timeline").insert({
        lead_id: job.lead_id,
        actor_id: null,
        evento: "sivis_sync_ok",
        detalhes: { action: "finalizar_adesao" },
      });
      break;
    }
    case "cancelar_adesao": {
      const { data: lead } = await supabase.from("leads").select("sivis_id").eq("id", job.lead_id).single();
      if (!lead?.sivis_id) throw new Error("sem sivis_id");
      await adapter.cancelarAdesao(session, { id_plano: lead.sivis_id });
      break;
    }
    case "update_status":
    case "add_pendencia":
    case "resolve_pendencia": {
      // Placeholder — essas acoes precisam de endpoints SIVIS que ainda nao mapeamos 1:1.
      // Marca como skipped por ora e segue.
      await supabase
        .from("sivis_sync_queue")
        .update({ status: "done", last_error: "action nao implementada no adapter — skipped" })
        .eq("id", job.id);
      break;
    }
    default:
      throw new Error(`action desconhecida: ${job.action}`);
  }
}

async function handleFailure(
  supabase: ReturnType<typeof serviceClient>,
  job: QueueJob,
  errorMsg: string,
) {
  const newAttempts = job.attempts + 1;
  const esgotou = newAttempts >= job.max_attempts;
  const delay = BACKOFF_SECS[Math.min(newAttempts, BACKOFF_SECS.length - 1)];
  const nextAttempt = new Date(Date.now() + delay * 1000).toISOString();

  await supabase
    .from("sivis_sync_queue")
    .update({
      status: esgotou ? "failed" : "retry",
      attempts: newAttempts,
      next_attempt_at: nextAttempt,
      last_error: errorMsg.slice(0, 500),
    })
    .eq("id", job.id);

  if (esgotou) {
    await supabase
      .from("leads")
      .update({
        sivis_sync_status: "failed",
        sivis_sync_error: errorMsg.slice(0, 500),
        sivis_attempts: newAttempts,
      })
      .eq("id", job.lead_id);
    await supabase.from("lead_timeline").insert({
      lead_id: job.lead_id,
      actor_id: null,
      evento: "sivis_sync_falhou",
      detalhes: { action: job.action, error: errorMsg.slice(0, 300), attempts: newAttempts },
    });
  }
}

// Avisa o TS que SivisAuthError/SivisApiError sao usados pelos imports — eles sao
// no http-adapter mas re-exportados aqui pra conveniencia.
export { SivisAuthError, SivisApiError };
