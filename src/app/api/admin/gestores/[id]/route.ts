import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  role: z.enum(["admin", "gestor", "consultant"]).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  group_id: z.string().uuid().nullable().optional(),
  full_name: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(6).max(72).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase admin" }, { status: 500 });

  // Se veio password, atualiza no auth
  if (parsed.data.password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: parsed.data.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Update em profiles (só as chaves de perfil)
  const profilePatch: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) profilePatch.role = parsed.data.role;
  if (parsed.data.status !== undefined) {
    profilePatch.status = parsed.data.status;
    if (parsed.data.status === "approved") {
      profilePatch.approved_at = new Date().toISOString();
      profilePatch.approved_by = auth.auth.userId;
    }
  }
  if (parsed.data.group_id !== undefined) profilePatch.group_id = parsed.data.group_id;
  if (parsed.data.full_name !== undefined) profilePatch.full_name = parsed.data.full_name;

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await admin.from("profiles").update(profilePatch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase admin" }, { status: 500 });
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
