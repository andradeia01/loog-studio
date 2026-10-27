/**
 * POST /api/leads/:id/vehicles — adiciona veiculo ao lead (snapshot da cotacao).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { VehicleCreateSchema } from "@/lib/leads/schemas";
import { registrarEvento } from "@/lib/leads/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id: leadId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = VehicleCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServer();
  // Garante que o lead existe e eh acessivel (RLS cobre)
  const { data: lead } = await supabase.from("leads").select("id").eq("id", leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });

  const { data: vehicle, error } = await supabase
    .from("lead_vehicles")
    .insert({ lead_id: leadId, ...parsed.data })
    .select()
    .single();
  if (error) return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });

  await registrarEvento(supabase, {
    leadId,
    actorId: auth.auth.userId,
    evento: "veiculo_adicionado",
    detalhes: {
      placa: parsed.data.placa,
      marca: parsed.data.marca,
      modelo: parsed.data.modelo,
      ano: parsed.data.ano_modelo,
    },
  });

  return NextResponse.json({ ok: true, vehicle }, { status: 201 });
}
