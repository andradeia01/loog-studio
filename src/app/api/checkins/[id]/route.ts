import { NextResponse } from "next/server";
import { requireApproved, requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InvalidateSchema = z.object({
  invalidated: z.boolean(),
  reason: z.string().max(200).optional().nullable(),
  points_awarded: z.number().int().min(0).max(500).optional(),
});

/** DELETE — consultor apaga seu próprio checkin OU admin apaga qualquer. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("checkins").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** PATCH — admin invalida checkin ou ajusta pontos. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const parsed = InvalidateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const patch: Record<string, unknown> = {};
  if (parsed.data.invalidated) {
    patch.invalidated_at = new Date().toISOString();
    patch.invalidated_by = auth.auth.userId;
    patch.invalidated_reason = parsed.data.reason ?? null;
    patch.approved = false;
  } else {
    patch.invalidated_at = null;
    patch.invalidated_by = null;
    patch.invalidated_reason = null;
    patch.approved = true;
  }
  if (typeof parsed.data.points_awarded === "number") {
    patch.points_awarded = parsed.data.points_awarded;
  }
  const { data, error } = await supabase
    .from("checkins")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ checkin: data });
}
