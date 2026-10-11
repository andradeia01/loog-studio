import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved, requireAdmin } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/assignments
 * Lista todas as atribuições visíveis (RLS filtra por role: admin tudo, gestor
 * grupo, consultor só as suas). Usado pelo front pra cruzar com leads do Hub.
 */
export async function GET(_req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ ok: true, data: [] });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("sdr_assignments")
    .select(`
      lead_id, consultant_id, assigned_by, assigned_at, notes,
      consultant:profiles!sdr_assignments_consultant_id_fkey(full_name, email)
    `)
    .order("assigned_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

const AssignBody = z.object({
  lead_id: z.string().min(1).max(200),
  consultant_id: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/sdr/assignments — ADMIN ONLY
 * Cria ou substitui a atribuição de um lead (lead_id é PK, upsert).
 */
export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const parsed = AssignBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("sdr_assignments")
    .upsert({
      lead_id: parsed.data.lead_id,
      consultant_id: parsed.data.consultant_id,
      assigned_by: auth.auth.userId,
      assigned_at: new Date().toISOString(),
      notes: parsed.data.notes ?? null,
    })
    .select(`
      *,
      consultant:profiles!sdr_assignments_consultant_id_fkey(full_name, email)
    `)
    .single();

  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

const UnassignBody = z.object({ lead_id: z.string().min(1).max(200) });

/** DELETE /api/sdr/assignments — ADMIN ONLY */
export async function DELETE(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const parsed = UnassignBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("sdr_assignments").delete().eq("lead_id", parsed.data.lead_id);
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
