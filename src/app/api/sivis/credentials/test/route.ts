/**
 * POST /api/sivis/credentials/test — testa login SIVIS REAL (sem gravar).
 *
 * Dois modos:
 *   a) Com body { sivis_login, sivis_password }  → testa esses valores direto (consultor pode validar antes de salvar)
 *   b) Sem body → busca credencial gravada do consultor e testa ela (health check)
 *
 * Resposta: { ok: true, consultorNome, consultorId } OU { ok: false, error }
 * Grava o resultado em last_login_test_at/ok/error quando usar credencial salva.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { decrypt } from "@/lib/sivis/crypto";
import { SivisHttpAdapter } from "@/lib/sivis/http-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  sivis_login: z.string().trim().min(3).max(160).optional(),
  sivis_password: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });

  let login: string;
  let password: string;
  let saveResult = false;

  if (parsed.data.sivis_login && parsed.data.sivis_password) {
    // Modo A: testa valores do body (consultor validando antes de salvar)
    login = parsed.data.sivis_login;
    password = parsed.data.sivis_password;
  } else {
    // Modo B: busca credencial salva e testa (health check)
    const supabase = await createSupabaseServer();
    const { data: cred } = await supabase
      .from("consultor_sivis_credentials")
      .select("sivis_login, sivis_password_encrypted")
      .eq("user_id", auth.auth.userId)
      .maybeSingle();
    if (!cred) return NextResponse.json({ error: "no_credential", message: "Sem credencial salva" }, { status: 404 });
    login = cred.sivis_login as string;
    try {
      password = decrypt(cred.sivis_password_encrypted as string);
    } catch (e) {
      return NextResponse.json(
        { error: "decrypt_failed", message: e instanceof Error ? e.message : "Falha ao descriptografar" },
        { status: 500 }
      );
    }
    saveResult = true;
  }

  const adapter = new SivisHttpAdapter();
  const result = await adapter.testarLogin(login, password);

  if (saveResult) {
    const supabase = await createSupabaseServer();
    await supabase
      .from("consultor_sivis_credentials")
      .update({
        last_login_test_at: new Date().toISOString(),
        last_login_test_ok: result.ok,
        last_login_test_error: result.ok ? null : result.error,
      })
      .eq("user_id", auth.auth.userId);
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 }); // 200 pq o server ta ok, so o SIVIS que recusou
  }

  return NextResponse.json({
    ok: true,
    consultorNome: result.consultorNome ?? null,
    consultorId: result.consultorId ?? null,
  });
}
