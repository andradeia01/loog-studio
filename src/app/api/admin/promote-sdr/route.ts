import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  emails: z.array(z.string().email()).min(1).max(20),
});

/**
 * POST /api/admin/promote-sdr
 * Body: { emails: ["a@b.com", ...] }
 *
 * Para cada e-mail: se o profile existe, atualiza role→consultant_sdr e
 * status→approved. Retorna lista dos que foram promovidos e os que não
 * foram encontrados (precisam fazer /signup antes).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase admin" }, { status: 500 });

  const normalized = parsed.data.emails.map((e) => e.trim().toLowerCase());

  const { data: existing, error: fetchErr } = await admin
    .from("profiles")
    .select("id, email, role, status")
    .in("email", normalized);
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const existingEmails = new Set((existing ?? []).map((p) => (p.email ?? "").toLowerCase()));
  const notFound = normalized.filter((e) => !existingEmails.has(e));

  const promoted: Array<{ email: string; previousRole: string }> = [];
  const failed: Array<{ email: string; error: string }> = [];

  for (const p of existing ?? []) {
    const { error: updErr } = await admin
      .from("profiles")
      .update({
        role: "consultant_sdr",
        status: "approved",
        approved_at: p.status === "approved" ? undefined : new Date().toISOString(),
        approved_by: p.status === "approved" ? undefined : auth.auth.userId,
      })
      .eq("id", p.id);
    if (updErr) failed.push({ email: p.email ?? "", error: updErr.message });
    else promoted.push({ email: p.email ?? "", previousRole: p.role ?? "" });
  }

  return NextResponse.json({ promoted, notFound, failed });
}
