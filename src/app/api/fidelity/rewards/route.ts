import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved, requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = ["semanal", "mensal", "anual", "conquista"] as const;

const CreateSchema = z.object({
  titulo: z.string().min(2).max(120),
  descricao: z.string().max(500).optional().nullable(),
  scope: z.enum(SCOPES).default("mensal"),
  posicao_min: z.number().int().positive().nullable().optional(),
  pontos_min: z.number().int().positive().nullable().optional(),
  valor: z.string().max(120).optional().nullable(),
  ativo: z.boolean().optional(),
});

const UpdateSchema = CreateSchema.partial().extend({
  id: z.string().uuid(),
});

/** GET — lista recompensas ativas (qualquer aprovado) ou TODAS (admin via ?all=1). */
export async function GET(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1";
  const scope = url.searchParams.get("scope");

  let q = supabase.from("fidelity_rewards").select("*").order("scope").order("posicao_min", { ascending: true });
  if (!all || auth.auth.role !== "admin") q = q.eq("ativo", true);
  if (scope && SCOPES.includes(scope as (typeof SCOPES)[number])) q = q.eq("scope", scope);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rewards: data ?? [] });
}

/** POST — cria recompensa (admin). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "dados_invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("fidelity_rewards")
    .insert({ ...parsed.data, created_by: auth.auth.userId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reward: data }, { status: 201 });
}

/** PATCH — edita recompensa existente (admin). */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "dados_invalidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...patch } = parsed.data;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("fidelity_rewards")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reward: data });
}

/** DELETE — remove recompensa (admin). ?id=... */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_requerido" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("fidelity_rewards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
