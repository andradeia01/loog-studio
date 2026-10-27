import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { requireApproved } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CRUD de bloqueios de veiculos: admin configura marca ou modelo+marca
 * que nao aceitamos cotar. O cotador consulta antes de calcular e devolve erro
 * se bater.
 */

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ blocks: [] });
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("vehicle_blocks")
    .select("*")
    .order("created_at", { ascending: false });
  return NextResponse.json({ blocks: data ?? [] });
}

const PostSchema = z.object({
  tipo: z.enum(["carros", "motos", "caminhoes"]),
  marca_codigo: z.string().min(1).max(20),
  marca_nome: z.string().min(1).max(120),
  modelo_codigo: z.string().min(1).max(20).optional().nullable(),
  modelo_nome: z.string().min(1).max(200).optional().nullable(),
  motivo: z.string().max(500).optional().nullable(),
  ativo: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  if (auth.auth.role !== "admin" && auth.auth.role !== "gestor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("vehicle_blocks")
    .insert({
      ...parsed.data,
      created_by: auth.auth.userId,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ block: data });
}
