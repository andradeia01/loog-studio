import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  action: z.enum(["approve", "reject", "revoke", "promote", "demote"]),
  reason: z.string().max(300).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "requisição inválida" }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const patch: Record<string, unknown> = {};

  switch (parsed.data.action) {
    case "approve":
      patch.status = "approved";
      patch.approved_at = new Date().toISOString();
      patch.approved_by = auth.auth.userId;
      patch.rejected_reason = null;
      break;
    case "reject":
      patch.status = "rejected";
      patch.rejected_reason = parsed.data.reason ?? null;
      break;
    case "revoke":
      patch.status = "pending";
      patch.approved_at = null;
      patch.approved_by = null;
      break;
    case "promote":
      patch.role = "admin";
      break;
    case "demote":
      patch.role = "consultant";
      break;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  if (id === auth.auth.userId) {
    return NextResponse.json({ error: "não pode se excluir" }, { status: 400 });
  }
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
