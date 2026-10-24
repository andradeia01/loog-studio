import { NextResponse } from "next/server";
import { createSupabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/inspection/remote/[token]
 * Resolve o token de vistoria externa (gerado por /api/inspection/[id]/remote-link).
 * Devolve dados básicos pra UI mostrar: placa, nome associado, consultor responsável.
 * Público (sem auth) — é o jeito do associado abrir a vistoria pelo link do WhatsApp.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, error: "supabase_off" }, { status: 503 });
  const { token } = await ctx.params;
  if (!token || token.length < 20) {
    return NextResponse.json({ ok: false, error: "token_invalido" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: "service_role_ausente" }, { status: 503 });

  const { data, error } = await admin
    .from("inspections")
    .select("id, placa, marca, modelo, ano, nome_associado, telefone_associado, status, mode, remote_token_expires_at, owner_id")
    .eq("remote_token", token)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "token_nao_encontrado" }, { status: 404 });

  if (data.remote_token_expires_at && new Date(data.remote_token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "token_expirado" }, { status: 410 });
  }

  // Terminal states — vistoria já concluída
  if (data.status === "APPROVED" || data.status === "REJECTED") {
    return NextResponse.json({ ok: false, error: "vistoria_concluida", status: data.status }, { status: 409 });
  }

  // Pega nome do consultor que gerou o link
  let consultorNome: string | null = null;
  if (data.owner_id) {
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", data.owner_id)
      .maybeSingle();
    consultorNome = prof?.full_name ?? null;
  }

  return NextResponse.json({
    ok: true,
    inspection: {
      id: data.id,
      placa: data.placa,
      marca: data.marca,
      modelo: data.modelo,
      ano: data.ano,
      nome_associado: data.nome_associado,
      telefone_associado: data.telefone_associado,
      status: data.status,
      mode: data.mode,
      consultor_nome: consultorNome,
    },
  });
}
