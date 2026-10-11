import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me — devolve dados básicos do usuário logado (role, status, userId). */
export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, authenticated: false });
  const auth = await currentUser();
  if (!auth) return NextResponse.json({ ok: false, authenticated: false });
  return NextResponse.json({
    ok: true,
    authenticated: true,
    userId: auth.userId,
    email: auth.email,
    role: auth.role,
    status: auth.status,
    isAdmin: auth.role === "admin",
    isGestor: auth.role === "gestor",
    groupId: auth.groupId ?? null,
  });
}
