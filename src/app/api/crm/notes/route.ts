import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { NoteCreateSchema } from "@/lib/crm/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = NoteCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("crm_notes")
    .insert({
      contact_id: parsed.data.contact_id,
      owner_id: auth.auth.userId,
      texto: parsed.data.texto,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data }, { status: 201 });
}
