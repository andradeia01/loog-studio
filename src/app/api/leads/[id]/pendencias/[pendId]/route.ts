/**
 * PATCH /api/leads/:id/pendencias/:pendId — resolve/cancela pendencia manualmente
 */
import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { PendenciaPatchSchema } from "@/lib/leads/schemas";
import { registrarEvento } from "@/lib/leads/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; pendId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id: leadId, pendId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = PendenciaPatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const update: Record<string, unknown> = {};
  if (parsed.data.descricao !== undefined) update.descricao = parsed.data.descricao;
  if (parsed.data.document_id !== undefined) update.document_id = parsed.data.document_id;
  if (parsed.data.auto_resolvida !== undefined) update.auto_resolvida = parsed.data.auto_resolvida;
  if (parsed.data.status !== undefined) {
    update.status = parsed.data.status;
    if (parsed.data.status === "resolvida") {
      update.resolvida_por = auth.auth.userId;
      update.resolvida_em = new Date().toISOString();
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const { data: pend, error } = await supabase
    .from("lead_pendencias")
    .update(update)
    .eq("id", pendId)
    .eq("lead_id", leadId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });

  if (parsed.data.status) {
    await registrarEvento(supabase, {
      leadId,
      actorId: auth.auth.userId,
      evento: parsed.data.status === "resolvida" ? "pendencia_resolvida" : "pendencia_cancelada",
      detalhes: { pendencia_id: pendId, tipo: pend.tipo },
    });
    // Enfileira sync pro SIVIS
    if (parsed.data.status === "resolvida") {
      await supabase.from("sivis_sync_queue").insert({
        lead_id: leadId,
        consultor_id: auth.auth.userId,
        action: "resolve_pendencia",
        payload: { lead_id: leadId, pendencia_id: pendId },
        status: "pending",
        next_attempt_at: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ ok: true, pendencia: pend });
}
