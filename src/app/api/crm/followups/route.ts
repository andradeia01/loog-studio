import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { FollowupCreateSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const pending = sp.get("pending") !== "false"; // default true
  const dias = Number(sp.get("dias") || "0");
  const limit = Math.min(Number(sp.get("limit") || "100"), 500);

  const supabase = await createSupabaseServer();
  let q = supabase.from("crm_followups")
    .select("id, contact_id, data_followup, descricao, done, done_at, created_at, crm_contacts(nome, telefone)")
    .order("data_followup", { ascending: pending })
    .limit(limit);
  if (pending) q = q.eq("done", false);
  if (dias > 0) {
    const limite = new Date(Date.now() + dias * 24 * 3600 * 1000).toISOString();
    q = q.lte("data_followup", limite);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = FollowupCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("crm_followups")
    .insert({
      contact_id: parsed.data.contact_id,
      owner_id: auth.auth.userId,
      data_followup: parsed.data.data_followup,
      descricao: parsed.data.descricao ?? null,
    })
    .select("*").single();
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data }, { status: 201 });
}
