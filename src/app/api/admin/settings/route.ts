import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.unknown(),
});

/** GET — retorna todas as settings (só admin). API keys mascaradas exceto quando ?raw=1. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const raw = req.nextUrl.searchParams.get("raw") === "1";
  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no supabase" }, { status: 500 });
  const { data, error } = await supabase.from("admin_settings").select("*").order("key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings = (data ?? []).map((row) => {
    if (!raw && row.key === "api_keys" && row.value && typeof row.value === "object") {
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(row.value as Record<string, string>)) {
        if (typeof v === "string" && v.length > 0) {
          masked[k] = v.slice(0, 6) + "…" + v.slice(-4);
        } else {
          masked[k] = "";
        }
      }
      return { ...row, value: masked };
    }
    return row;
  });
  return NextResponse.json({ settings });
}

/** PATCH — upsert de uma setting. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });

  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "no supabase" }, { status: 500 });
  const { data, error } = await supabase
    .from("admin_settings")
    .upsert({
      key: parsed.data.key,
      value: parsed.data.value as never,
      updated_by: auth.auth.userId,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ setting: data });
}
