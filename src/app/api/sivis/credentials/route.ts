/**
 * API /api/sivis/credentials — credenciais SIVIS do consultor logado.
 *
 * GET    → retorna METADADOS (login, status do ultimo teste), nunca a senha
 * POST   → cria/atualiza credencial (criptografa senha com AES-256-GCM)
 * DELETE → remove credencial
 *
 * NUNCA retorna sivis_password_encrypted em nenhuma resposta.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { encrypt } from "@/lib/sivis/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  sivis_login: z.string().trim().min(3).max(160),
  sivis_password: z.string().min(1).max(200),
});

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("consultor_sivis_credentials")
    .select("user_id, sivis_login, last_login_test_at, last_login_test_ok, last_login_test_error, created_at, updated_at")
    .eq("user_id", auth.auth.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, credential: data ?? null });
}

export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  let encrypted: string;
  try {
    encrypted = encrypt(parsed.data.sivis_password);
  } catch (e) {
    return NextResponse.json(
      { error: "crypto_failed", message: e instanceof Error ? e.message : "Falha ao criptografar — SIVIS_ENC_KEY nao configurada?" },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("consultor_sivis_credentials")
    .upsert({
      user_id: auth.auth.userId,
      sivis_login: parsed.data.sivis_login,
      sivis_password_encrypted: encrypted,
      // Zera status do teste — forca teste novo com credencial nova
      last_login_test_at: null,
      last_login_test_ok: null,
      last_login_test_error: null,
    })
    .select("user_id, sivis_login, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: "upsert_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, credential: data });
}

export async function DELETE() {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("consultor_sivis_credentials")
    .delete()
    .eq("user_id", auth.auth.userId);
  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
