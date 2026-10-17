import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin, createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trim + nullable helper: aceita "" como null (admin apagou o campo)
const nullableStr = (max = 200) =>
  z.string().trim().max(max).transform((v) => v || null).nullable().optional();

const PatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["approve", "reject", "revoke", "promote", "demote", "enable_sdr", "disable_sdr"]),
    reason: z.string().max(300).optional(),
  }),
  z.object({
    action: z.literal("update_profile"),
    profile: z.object({
      full_name: nullableStr(120),
      email: z.string().email().max(200).optional(),
      phone: nullableStr(30),
      instagram: nullableStr(60),
      city: nullableStr(120),
      photo_url: nullableStr(500),
      role: z.enum(["admin", "gestor", "consultant", "consultant_sdr"]).optional(),
    }),
  }),
]);

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

  // Edição completa de perfil pelo admin — campos opcionais; se vier, atualiza.
  // Email precisa sincronizar com auth.users (via admin client), por isso trata separado.
  if (parsed.data.action === "update_profile") {
    const p = parsed.data.profile;
    if (p.full_name !== undefined) patch.full_name = p.full_name;
    if (p.phone !== undefined) patch.phone = p.phone;
    if (p.instagram !== undefined) patch.instagram = p.instagram;
    if (p.city !== undefined) patch.city = p.city;
    if (p.photo_url !== undefined) patch.photo_url = p.photo_url;
    if (p.role !== undefined) patch.role = p.role;

    // Troca de e-mail: precisa atualizar em auth.users via service role
    if (p.email && supabaseConfigured()) {
      const admin = createSupabaseAdmin();
      if (!admin) {
        return NextResponse.json(
          { error: "service_role_ausente", message: "SUPABASE_SERVICE_ROLE_KEY não configurado — não dá pra trocar e-mail." },
          { status: 500 },
        );
      }
      try {
        const { error: emailErr } = await admin.auth.admin.updateUserById(id, { email: p.email });
        if (emailErr) {
          return NextResponse.json(
            { error: "email_update_falhou", message: emailErr.message },
            { status: 400 },
          );
        }
        patch.email = p.email;
      } catch (err) {
        return NextResponse.json(
          { error: "email_update_falhou", message: err instanceof Error ? err.message : String(err) },
          { status: 500 },
        );
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "nada_a_atualizar" }, { status: 400 });
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

  // Actions legadas (approve/reject/promote/etc)
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
    case "enable_sdr":
      patch.role = "consultant_sdr";
      break;
    case "disable_sdr":
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
