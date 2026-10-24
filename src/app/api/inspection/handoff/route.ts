import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inspection/handoff
 * Gera um token curto pra transferir a vistoria desktop → celular do PRÓPRIO consultor.
 * Cria rascunho vazio + devolve link pra pré-página. Token válido 2h.
 */
export async function POST(req: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "service_role_ausente" }, { status: 500 });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { data: insp, error } = await admin
    .from("inspections")
    .insert({
      owner_id: auth.auth.userId,
      placa: "AAA0000",
      nome_associado: "A preencher",
      telefone_associado: null,
      tipo_vistoria: "NOVA",
      mode: "REMOTE",
      status: "DRAFT",
      remote_token: token,
      remote_token_expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !insp) {
    return NextResponse.json({ error: error?.message ?? "falha_ao_criar" }, { status: 500 });
  }

  const origin = req.headers.get("origin") ?? `https://${req.headers.get("host") ?? ""}`;
  const link = `${origin}/vistoria/${token}`;

  return NextResponse.json({ ok: true, inspectionId: insp.id, token, link, expiresAt });
}
