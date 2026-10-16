import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  scope: z.enum(["fipe_code", "marca", "modelo", "placa"]),
  marca: z.string().trim().nullable().optional(),
  modelo: z.string().trim().nullable().optional(),
  fipe_code: z.string().trim().nullable().optional(),
  fipe_year_id: z.string().trim().nullable().optional(),
  placa: z.string().trim().nullable().optional(),
  vehicle_type: z.enum(["carro", "moto", "utilitario", "eletrico", "caminhao"]).nullable().optional().or(z.literal("")),
  reason: z.string().trim().nullable().optional(),
});

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("vehicle_restrictions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ restrictions: data ?? [] });
}

export async function POST(req: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid_body" }, { status: 400 });
  }
  const supabase = await createSupabaseServer();
  const { data: user } = await supabase.auth.getUser();

  const payload = {
    ...parsed.data,
    vehicle_type: parsed.data.vehicle_type || null,
    created_by: user.user?.id ?? null,
  };

  // sanity: campos obrigatórios por scope
  const errByScope: Record<string, string | null> = {
    fipe_code: payload.fipe_code ? null : "fipe_code obrigatório",
    marca: payload.marca ? null : "marca obrigatória",
    modelo: payload.marca && payload.modelo ? null : "marca e modelo obrigatórios",
    placa: payload.placa ? null : "placa obrigatória",
  };
  const bad = errByScope[parsed.data.scope];
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const { data, error } = await supabase.from("vehicle_restrictions").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ restriction: data });
}
