import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  position: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("ready_video_folders").update(parsed.data).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folder: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("ready_video_folders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
