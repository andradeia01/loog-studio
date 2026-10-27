/**
 * GET  /api/leads/:id/pendencias — lista pendencias do lead
 * POST /api/leads/:id/pendencias — cria pendencia manual
 */
import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { PendenciaCreateSchema } from "@/lib/leads/schemas";
import { registrarEvento } from "@/lib/leads/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id: leadId } = await ctx.params;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("lead_pendencias")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, pendencias: data ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id: leadId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = PendenciaCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: lead } = await supabase.from("leads").select("id").eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

  const { data: pend, error } = await supabase
    .from("lead_pendencias")
    .insert({
      lead_id: leadId,
      tipo: parsed.data.tipo,
      descricao: parsed.data.descricao ?? null,
      document_id: parsed.data.document_id ?? null,
      status: "aberta",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });

  await registrarEvento(supabase, {
    leadId,
    actorId: auth.auth.userId,
    evento: "pendencia_criada",
    detalhes: { tipo: parsed.data.tipo, descricao: parsed.data.descricao },
  });

  // Enfileira pro SIVIS
  await supabase.from("sivis_sync_queue").insert({
    lead_id: leadId,
    consultor_id: auth.auth.userId,
    action: "add_pendencia",
    payload: { lead_id: leadId, pendencia_id: pend.id },
    status: "pending",
    next_attempt_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, pendencia: pend }, { status: 201 });
}
