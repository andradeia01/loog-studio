/**
 * POST /api/leads/:id/documents — upload de documento (CNH, CRLV, etc.)
 *
 * Request: multipart/form-data com campos:
 *   file:  Blob         (obrigatorio)
 *   tipo:  string       (cnh|crlv|comprovante_residencia|comprovante_renda|selfie|outros)
 *
 * Response: { ok: true, document: {...}, storagePath }
 *
 * Fluxo:
 *   1. Valida tipo + mime + tamanho
 *   2. Sobe arquivo pro bucket 'lead-documents' em "<consultor_id>/<lead_id>/<tipo>-<uuid>.<ext>"
 *   3. Grava metadata em lead_documents
 *   4. Enfileira upload_doc no sivis_sync_queue
 *   5. Se existia pendencia aberta do mesmo tipo, auto-resolve
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { DocTipo } from "@/lib/leads/schemas";
import { registrarEvento } from "@/lib/leads/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BUCKET = "lead-documents";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf",
]);

function extFromMime(mime: string, filename: string): string {
  const extFromName = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : null;
  if (extFromName && /^[a-z0-9]{1,5}$/.test(extFromName)) return extFromName;
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/heic": "heic", "application/pdf": "pdf",
  };
  return map[mime] ?? "bin";
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id: leadId } = await ctx.params;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("lead_documents")
    .select("id, tipo, filename, mime_type, size_bytes, storage_path, sivis_sync_status, uploaded_at, uploaded_by")
    .eq("lead_id", leadId)
    .order("uploaded_at", { ascending: false });
  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, documents: data ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id: leadId } = await ctx.params;

  // Parse multipart
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_form", message: "Esperado multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  const tipoRaw = form.get("tipo");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing_file" }, { status: 400 });

  const tipoParsed = DocTipo.safeParse(tipoRaw);
  if (!tipoParsed.success) {
    return NextResponse.json({ error: "invalid_tipo", message: "Tipo invalido. Use cnh|crlv|comprovante_residencia|comprovante_renda|selfie|outros" }, { status: 400 });
  }
  const tipo = tipoParsed.data;

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json({ error: "mime_not_allowed", message: `Tipo ${mime} nao permitido` }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", message: `Max ${MAX_BYTES / 1024 / 1024}MB` }, { status: 413 });
  }

  const supabase = await createSupabaseServer();

  // Valida lead existe/acessivel
  const { data: lead } = await supabase.from("leads").select("id, consultor_id").eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

  // Monta storage path: <consultor_id>/<lead_id>/<tipo>-<uuid>.<ext>
  // (primeiro segmento = owner, respeita policy do bucket)
  const uuid = randomUUID();
  const ext = extFromMime(mime, file.name);
  const storagePath = `${auth.auth.userId}/${leadId}/${tipo}-${uuid}.${ext}`;

  // Upload no Storage
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: "upload_failed", message: uploadErr.message }, { status: 500 });
  }

  // Grava metadata
  const { data: doc, error: insertErr } = await supabase
    .from("lead_documents")
    .insert({
      lead_id: leadId,
      uploaded_by: auth.auth.userId,
      tipo,
      storage_path: storagePath,
      filename: file.name,
      mime_type: mime,
      size_bytes: file.size,
      sivis_sync_status: "pending",
    })
    .select()
    .single();

  if (insertErr) {
    // Rollback storage
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: "insert_failed", message: insertErr.message }, { status: 500 });
  }

  // Auto-resolve pendencia correspondente, se houver
  const tipoPendencia = `aguardando_${tipo}`;
  const { data: pend } = await supabase
    .from("lead_pendencias")
    .select("id")
    .eq("lead_id", leadId)
    .eq("tipo", tipoPendencia)
    .eq("status", "aberta")
    .maybeSingle();
  if (pend) {
    await supabase
      .from("lead_pendencias")
      .update({
        status: "resolvida",
        auto_resolvida: true,
        document_id: doc.id,
        resolvida_por: auth.auth.userId,
        resolvida_em: new Date().toISOString(),
      })
      .eq("id", pend.id);
    await registrarEvento(supabase, {
      leadId,
      actorId: auth.auth.userId,
      evento: "pendencia_resolvida",
      detalhes: { tipo: tipoPendencia, auto: true, document_id: doc.id },
    });
  }

  // Enfileira upload no SIVIS
  await supabase.from("sivis_sync_queue").insert({
    lead_id: leadId,
    consultor_id: auth.auth.userId,
    action: "upload_doc",
    payload: { lead_id: leadId, document_id: doc.id, storage_path: storagePath },
    status: "pending",
    next_attempt_at: new Date().toISOString(),
  });

  await registrarEvento(supabase, {
    leadId,
    actorId: auth.auth.userId,
    evento: "doc_enviado",
    detalhes: { tipo, filename: file.name, size: file.size },
  });

  return NextResponse.json({ ok: true, document: doc, storagePath }, { status: 201 });
}
