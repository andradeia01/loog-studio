import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  active: z.boolean().optional(),
  reason: z.string().trim().nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteParams) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("vehicle_restrictions")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ restriction: data });
}

export async function DELETE(_: Request, ctx: RouteParams) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });
  const { id } = await ctx.params;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("vehicle_restrictions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
