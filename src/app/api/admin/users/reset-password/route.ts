import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128).optional(),
  generate: z.boolean().optional(),
});

/** Gera senha legível: 3 blocos separados por hífen, letras+números+1 símbolo */
function gerarSenha(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const miniúsc = "abcdefghjkmnpqrstuvwxyz";
  const nums = "23456789";
  const simb = "@#!";
  const r = (s: string) => s[crypto.randomInt(0, s.length)];
  return [
    r(letras) + r(miniúsc) + r(miniúsc),
    r(nums) + r(nums) + r(nums) + r(nums),
    r(letras) + r(miniúsc) + r(miniúsc) + r(simb),
  ].join("-");
}

/**
 * POST /api/admin/users/reset-password — ADMIN ONLY
 * Reseta a senha de um usuário por email. Se `generate=true` ou `password` ausente,
 * gera uma senha nova e devolve. Também confirma o email (`email_confirm: true`)
 * caso o usuário ainda não tenha confirmado.
 */
export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = createSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "service_role_ausente" }, { status: 503 });

  // Buscar user via admin.listUsers (pagina até achar — ok pra base < 50k users)
  let userId: string | null = null;
  let page = 1;
  // 1000 users/página; 10 páginas = 10k users de proteção máxima
  while (!userId && page <= 10) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) return NextResponse.json({ error: "list_fail", message: listErr.message }, { status: 500 });
    const match = list.users.find((u) => (u.email || "").toLowerCase() === parsed.data.email.toLowerCase());
    if (match) userId = match.id;
    if (list.users.length < 1000) break;
    page += 1;
  }
  if (!userId) return NextResponse.json({ error: "user_not_found", message: `Nenhum user com email ${parsed.data.email}` }, { status: 404 });

  const novaSenha = parsed.data.password ?? gerarSenha();

  const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
    password: novaSenha,
    email_confirm: true,
  });
  if (updErr) return NextResponse.json({ error: "update_fail", message: updErr.message }, { status: 500 });

  console.log(`[admin/reset-password] senha trocada: ${parsed.data.email} por ${auth.auth.email}`);

  return NextResponse.json({
    ok: true,
    email: parsed.data.email,
    password: novaSenha, // SÓ aparece aqui no response; não é gravada em log
    generated: !parsed.data.password,
  });
}
