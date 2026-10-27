import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { requireApproved } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  ativo: z.boolean().optional(),
  motivo: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: Request, ctx: RouteParams) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  if (auth.auth.role !== "admin" && auth.auth.role !== "gestor") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("vehicle_blocks")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ block: data });
}

export async function DELETE(_: Request, ctx: RouteParams) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  if (auth.auth.role !== "admin" && auth.auth.role !== "gestor") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("vehicle_blocks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
