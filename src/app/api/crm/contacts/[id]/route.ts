import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { ContactPatchSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;

  const supabase = await createSupabaseServer();

  const [contact, interactions, notes, followups] = await Promise.all([
    supabase.from("crm_contacts").select("*").eq("id", id).maybeSingle(),
    supabase.from("crm_interactions").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("crm_notes").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("crm_followups").select("*").eq("contact_id", id).order("data_followup", { ascending: true }).limit(50),
  ]);

  if (contact.error) return NextResponse.json({ error: "db", message: contact.error.message }, { status: 500 });
  if (!contact.data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    contact: contact.data,
    interactions: interactions.data ?? [],
    notes: notes.data ?? [],
    followups: followups.data ?? [],
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = ContactPatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("crm_contacts")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("crm_contacts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
