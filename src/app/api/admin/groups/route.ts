import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  region: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
  cover_url: z.string().url().optional().nullable(),
  position: z.number().int().optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Contagem de membros por grupo
  const ids = (data ?? []).map((g) => g.id);
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("group_id, role")
      .in("group_id", ids);
    for (const p of prof ?? []) {
      const key = String(p.group_id);
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  const groups = (data ?? []).map((g) => ({ ...g, member_count: counts[g.id] ?? 0 }));
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("groups")
    .insert({
      name: parsed.data.name,
      region: parsed.data.region ?? null,
      description: parsed.data.description ?? null,
      cover_url: parsed.data.cover_url ?? null,
      position: parsed.data.position ?? 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: { ...data, member_count: 0 } }, { status: 201 });
}
