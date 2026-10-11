import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/consultores
 *
 * Lista consultores aprovados pros quais um admin pode atribuir leads SDR.
 * Hoje são 4 nomeados (Ana, Felipe, Henrico, João) mas o endpoint é dinâmico:
 * retorna QUALQUER consultant/consultant_sdr aprovado — tem que ter 'sdr' ou
 * nome específico? Não, simplificamos: todos consultores approved.
 *
 * Filtro `?role=consultant_sdr` disponível pra limitar aos que tem SDR habilitado.
 */
export async function GET(req: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ ok: true, data: [] });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const roleFilter = url.searchParams.get("role");

  const supabase = await createSupabaseServer();
  let q = supabase
    .from("profiles")
    .select("id, full_name, email, phone, photo_url, role, group_id")
    .eq("status", "approved")
    .in("role", ["consultant", "consultant_sdr"])
    .order("full_name", { ascending: true });

  if (roleFilter === "consultant_sdr") q = q.eq("role", "consultant_sdr");

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
