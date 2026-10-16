import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  matricula: z.string().trim().min(1, "Matrícula obrigatória"),
  nome: z.string().trim().min(2, "Nome inválido"),
  cpf_cnpj: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  telefone: z.string().trim().optional().or(z.literal("")),
  cidade: z.string().trim().optional().or(z.literal("")),
  uf: z.string().trim().length(2).optional().or(z.literal("")),
});

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ members: data ?? [] });
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
    cpf_cnpj: parsed.data.cpf_cnpj || null,
    email: parsed.data.email || null,
    telefone: parsed.data.telefone || null,
    cidade: parsed.data.cidade || null,
    uf: parsed.data.uf || null,
    owner_consultant_id: user.user?.id ?? null,
  };
  const { data, error } = await supabase.from("members").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ member: data });
}
