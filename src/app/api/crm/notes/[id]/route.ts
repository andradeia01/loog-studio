import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { NotePatchSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = NotePatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("crm_notes").update(parsed.data).eq("id", id).select("*").maybeSingle();
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
  const { error } = await supabase.from("crm_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
