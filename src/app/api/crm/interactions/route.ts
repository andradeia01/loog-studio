import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { InteractionCreateSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const contactId = sp.get("contact_id");
  if (!contactId) return NextResponse.json({ error: "contact_id_obrigatorio" }, { status: 400 });
  const limit = Math.min(Number(sp.get("limit") || "100"), 500);
  const offset = Math.max(Number(sp.get("offset") || "0"), 0);

  const supabase = await createSupabaseServer();
  const { data, error, count } = await supabase
    .from("crm_interactions")
    .select("*", { count: "exact" })
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data, total: count ?? 0, limit, offset });
}

export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = InteractionCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("crm_interactions")
    .insert({
      contact_id: parsed.data.contact_id,
      owner_id: auth.auth.userId,
      tipo: parsed.data.tipo,
      descricao: parsed.data.descricao ?? null,
      metadata: parsed.data.metadata,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data }, { status: 201 });
}
