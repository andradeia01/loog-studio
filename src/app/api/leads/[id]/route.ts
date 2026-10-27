/**
 * API /api/leads/:id
 *
 * GET    → detalhe do lead + veiculos + documentos + pendencias + timeline
 * PATCH  → atualiza campos do lead (contratante, procedencia, status com validacao)
 * DELETE → remove lead (apenas admin — soft-delete via status="perdido" eh preferido pela UI)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { LeadPatchSchema, LeadStatus, onlyDigits, transicaoValida } from "@/lib/leads/schemas";
import { registrarEvento } from "@/lib/leads/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;

  const supabase = await createSupabaseServer();

  // RLS do Supabase bloqueia leads de outros consultores — se nao encontrar, trata como 404
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Fetch relacionados em paralelo
  const [vehicles, documents, pendencias, timeline] = await Promise.all([
    supabase.from("lead_vehicles").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase
      .from("lead_documents")
      .select("id, tipo, filename, mime_type, size_bytes, storage_path, sivis_sync_status, uploaded_at, uploaded_by")
      .eq("lead_id", id)
      .order("uploaded_at", { ascending: false }),
    supabase.from("lead_pendencias").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase
      .from("lead_timeline")
      .select("id, actor_id, evento, detalhes, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return NextResponse.json({
    ok: true,
    lead,
    vehicles: vehicles.data ?? [],
    documents: documents.data ?? [],
    pendencias: pendencias.data ?? [],
    timeline: timeline.data ?? [],
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = LeadPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: "Dados invalidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServer();

  // Pega estado atual pra validar transicao de status
  const { data: current } = await supabase.from("leads").select("status, consultor_id").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.contratante_nome !== undefined) update.contratante_nome = d.contratante_nome;
  if (d.contratante_email !== undefined) update.contratante_email = d.contratante_email || null;
  if (d.contratante_cpf !== undefined) update.contratante_cpf = d.contratante_cpf ? onlyDigits(d.contratante_cpf) : null;
  if (d.contratante_telefone !== undefined) update.contratante_telefone = d.contratante_telefone ? onlyDigits(d.contratante_telefone) : null;
  if (d.contratante_data_nasc !== undefined) update.contratante_data_nasc = d.contratante_data_nasc || null;
  if (d.contratante_cep !== undefined) update.contratante_cep = d.contratante_cep ? onlyDigits(d.contratante_cep) : null;
  if (d.contratante_endereco !== undefined) update.contratante_endereco = d.contratante_endereco || null;
  if (d.contratante_numero !== undefined) update.contratante_numero = d.contratante_numero || null;
  if (d.contratante_bairro !== undefined) update.contratante_bairro = d.contratante_bairro || null;
  if (d.contratante_cidade !== undefined) update.contratante_cidade = d.contratante_cidade || null;
  if (d.contratante_uf !== undefined) update.contratante_uf = d.contratante_uf || null;
  if (d.contratante_complemento !== undefined) update.contratante_complemento = d.contratante_complemento || null;
  if (d.procedencia !== undefined) update.procedencia = d.procedencia || null;
  if (d.observacao !== undefined) update.observacao = d.observacao || null;

  let statusChanged = false;
  let novoStatus: LeadStatus | null = null;
  if (d.status !== undefined && d.status !== current.status) {
    const from = LeadStatus.safeParse(current.status);
    if (!from.success) return NextResponse.json({ error: "status_corrompido" }, { status: 500 });
    // Admin pode forçar qualquer transicao; outros respeitam o funil
    const bypass = auth.auth.role === "admin";
    if (!bypass && !transicaoValida(from.data, d.status)) {
      return NextResponse.json(
        { error: "transicao_invalida", message: `Nao pode ir de ${from.data} → ${d.status}` },
        { status: 400 }
      );
    }
    update.status = d.status;
    statusChanged = true;
    novoStatus = d.status;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, lead: current, unchanged: true });
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });

  await registrarEvento(supabase, {
    leadId: id,
    actorId: auth.auth.userId,
    evento: statusChanged ? "status_mudou" : "lead_atualizado",
    detalhes: statusChanged ? { de: current.status, para: novoStatus } : { campos: Object.keys(update) },
  });

  // Se status mudou pra "cliente", enfileira finalizar_adesao no SIVIS
  if (statusChanged && novoStatus === "cliente") {
    await supabase.from("sivis_sync_queue").insert({
      lead_id: id,
      consultor_id: auth.auth.userId,
      action: "finalizar_adesao",
      payload: { lead_id: id },
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    });
  } else if (statusChanged) {
    // Qualquer outra mudanca de status também espelha
    await supabase.from("sivis_sync_queue").insert({
      lead_id: id,
      consultor_id: auth.auth.userId,
      action: "update_status",
      payload: { lead_id: id, status: novoStatus },
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, lead });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  if (auth.auth.role !== "admin") {
    return NextResponse.json({ error: "forbidden", message: "Apenas admin pode deletar lead" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
