import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(24).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  role: z.enum(["admin", "gestor", "consultant"]).default("gestor"),
  group_id: z.string().uuid().nullable().optional(),
});

/**
 * POST — cria user + profile já aprovado com role definida.
 * Uso: admin cria gestor ou consultor manualmente (bypassa signup).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase admin" }, { status: 500 });

  // 1) cria user via Admin API
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.full_name,
      phone: parsed.data.phone ?? "",
      city: parsed.data.city ?? "",
    },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "falha ao criar user";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 2) promove role + status + group_id via update (trigger handle_new_user já criou profile)
  const { data: profile, error: updErr } = await admin
    .from("profiles")
    .update({
      role: parsed.data.role,
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: auth.auth.userId,
      group_id: parsed.data.group_id ?? null,
    })
    .eq("id", created.user.id)
    .select()
    .single();
  if (updErr) return NextResponse.json({ error: `criado, mas falhou promover: ${updErr.message}` }, { status: 500 });

  return NextResponse.json({ profile }, { status: 201 });
}

/** GET — lista todos os gestores/consultores (admin), com o grupo. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, city, role, status, group_id, created_at, groups(name)")
    .in("role", ["admin", "gestor", "consultant"])
    .order("role")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}
