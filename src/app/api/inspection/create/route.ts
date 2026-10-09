import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inspection/create
 * Body: { placa, marca?, modelo?, ano?, cor?, fipeValor?, fipeCodigo?, nomeAssociado?, telefoneAssociado?, mode? }
 * Cria uma vistoria em DRAFT.
 */
export async function POST(req: Request) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "supabase admin indisponível" }, { status: 500 });

  const body = (await req.json()) as Record<string, unknown>;
  const placa = typeof body.placa === "string" ? body.placa.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (!placa || placa.length < 6) return NextResponse.json({ error: "placa inválida" }, { status: 400 });

  const insert = {
    owner_id: auth.auth.userId,
    placa,
    marca: toStr(body.marca),
    modelo: toStr(body.modelo),
    ano: typeof body.ano === "number" ? body.ano : null,
    cor: toStr(body.cor),
    fipe_valor: toStr(body.fipeValor),
    fipe_codigo: toStr(body.fipeCodigo),
    nome_associado: toStr(body.nomeAssociado),
    telefone_associado: toStr(body.telefoneAssociado),
    mode: body.mode === "REMOTE" ? "REMOTE" : "PRESENCIAL",
    status: "DRAFT",
  };

  const { data, error } = await admin.from("inspections").insert(insert).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

function toStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
