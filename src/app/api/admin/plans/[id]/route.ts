import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { requireApproved } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin edita planos inline. Permite ajustar preco, faixa, participacao, limite,
 * active e flags sem precisar re-subir planilha.
 * NUNCA permite trocar vehicle_type nem source — isso quebraria o cotador local.
 */
const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  group_name: z.string().min(1).max(120).optional(),
  min_fipe_cents: z.number().int().min(0).optional(),
  max_fipe_cents: z.number().int().min(0).nullable().optional(),
  monthly_cents: z.number().int().min(0).optional(),
  participation_type: z.enum(["fixed_cents", "percent_bp"]).optional(),
  participation_value: z.number().int().min(0).optional(),
  year_limit: z.number().int().min(0).max(150).nullable().optional(),
  active: z.boolean().optional(),
  favorite: z.boolean().optional(),
  sell_on_site: z.boolean().optional(),
  installments: z.boolean().optional(),
  monthly_includes_adhesion: z.boolean().optional(),
  extras: z.string().nullable().optional(),
  acrescimos: z.string().nullable().optional(),
  payment_options: z.string().nullable().optional(),
  adhesion_service: z.string().nullable().optional(),
  display_order: z.number().int().min(0).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteParams) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });

  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  // Permite admin OU gestor editar. Consultor nao
  if (auth.auth.role !== "admin" && auth.auth.role !== "gestor") {
    return NextResponse.json({ error: "forbidden", message: "Apenas admin/gestor pode editar planos." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("plans")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ plan: data });
}
