/**
 * POST /api/leads/:id/sync — forca re-sync do lead pro SIVIS.
 *
 * Util quando o consultor ve "sincronizacao falhou" e quer tentar de novo
 * depois de corrigir alguma coisa (credencial renovada, SIVIS voltou do ar, etc.).
 *
 * Reseta sivis_sync_status pra 'pending' e enfileira novamente.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { registrarEvento } from "@/lib/leads/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id: leadId } = await ctx.params;

  const supabase = await createSupabaseServer();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, sivis_id, sivis_sync_status")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

  // Reseta status + enfileira
  const action = lead.sivis_id ? "update_lead" : "create_lead";
  await supabase
    .from("leads")
    .update({ sivis_sync_status: "pending", sivis_sync_error: null })
    .eq("id", leadId);

  await supabase.from("sivis_sync_queue").insert({
    lead_id: leadId,
    consultor_id: auth.auth.userId,
    action,
    payload: { lead_id: leadId },
    status: "pending",
    next_attempt_at: new Date().toISOString(),
  });

  await registrarEvento(supabase, {
    leadId,
    actorId: auth.auth.userId,
    evento: "sivis_sync_enfileirado",
    detalhes: { action, forced: true },
  });

  return NextResponse.json({ ok: true, enqueued: action });
}
