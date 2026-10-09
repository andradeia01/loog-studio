import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PipelineStage = z.enum(["novo", "contato", "documentos", "negociacao", "fechado", "perdido"]);
type PipelineStage = z.infer<typeof PipelineStage>;

/** GET /api/crm/pipeline — devolve todos os contatos agrupados por stage */
export async function GET(_req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("crm_contacts")
    .select("id, nome, telefone, temperatura, status_ciclo, pipeline_stage, pipeline_moved_at, last_touch_at, created_at, metadata")
    .order("pipeline_moved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });

  const grupos: Record<PipelineStage, typeof data> = {
    novo: [], contato: [], documentos: [], negociacao: [], fechado: [], perdido: [],
  };
  for (const c of data ?? []) {
    const stage = c.pipeline_stage as PipelineStage;
    (grupos[stage] ?? grupos.novo).push(c);
  }

  const counts = Object.fromEntries(
    Object.entries(grupos).map(([k, arr]) => [k, arr.length]),
  ) as Record<PipelineStage, number>;

  return NextResponse.json({ ok: true, grupos, counts, total: data?.length ?? 0 });
}

const PatchBody = z.object({
  contact_id: z.string().uuid(),
  pipeline_stage: PipelineStage,
});

/** PATCH /api/crm/pipeline — move 1 contato de stage (drag-drop) */
export async function PATCH(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();

  // Determina se o novo stage implica mudança de status_ciclo
  const sideEffects: Record<string, unknown> = {
    pipeline_stage: parsed.data.pipeline_stage,
    pipeline_moved_at: new Date().toISOString(),
  };
  if (parsed.data.pipeline_stage === "fechado") sideEffects.status_ciclo = "cliente";
  if (parsed.data.pipeline_stage === "perdido") sideEffects.status_ciclo = "perdido";
  // Se saindo de fechado/perdido pra outro stage, destrava status_ciclo pra ativo
  if (!["fechado", "perdido"].includes(parsed.data.pipeline_stage)) sideEffects.status_ciclo = "ativo";

  const { data, error } = await supabase
    .from("crm_contacts")
    .update(sideEffects)
    .eq("id", parsed.data.contact_id)
    .select("id, pipeline_stage, status_ciclo, pipeline_moved_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Registra interação de sistema pra timeline
  await supabase.from("crm_interactions").insert({
    contact_id: parsed.data.contact_id,
    owner_id: auth.auth.userId,
    tipo: "nota_sistema",
    descricao: `Pipeline → ${parsed.data.pipeline_stage}`,
    metadata: { pipeline_stage: parsed.data.pipeline_stage },
  });

  return NextResponse.json({ ok: true, data });
}
