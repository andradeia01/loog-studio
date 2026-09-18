import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireApproved } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  cover_url: z.string().url().optional().nullable(),
  position: z.number().int().optional(),
});

/** GET — lista pastas (consultor aprovado ou admin). */
export async function GET() {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("art_folders")
    .select("id, name, description, cover_url, position, created_at, updated_at")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // agrega count por pasta (útil pro consultor navegar)
  const ids = (data ?? []).map((f) => f.id);
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: countRows } = await supabase
      .from("ready_arts")
      .select("folder_id")
      .in("folder_id", ids)
      .eq("active", true);
    for (const r of countRows ?? []) {
      const key = String(r.folder_id);
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  const folders = (data ?? []).map((f) => ({ ...f, count: counts[f.id] ?? 0 }));
  return NextResponse.json({ folders });
}

/** POST — cria pasta (admin). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "dados inválidos", details: parsed.error.flatten() }, { status: 400 });
  }
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("art_folders")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      cover_url: parsed.data.cover_url ?? null,
      position: parsed.data.position ?? 0,
      created_by: auth.auth.userId,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folder: { ...data, count: 0 } }, { status: 201 });
}
