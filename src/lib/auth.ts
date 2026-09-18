import { NextResponse } from "next/server";
import { createSupabaseServer } from "./supabase/server";

export interface AuthContext {
  userId: string;
  email: string;
  role: "admin" | "consultant";
  status: "pending" | "approved" | "rejected";
}

/**
 * Retorna o perfil do usuário logado no request atual (via cookies do Supabase),
 * ou null se não estiver autenticado.
 */
export async function currentUser(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    userId: user.id,
    email: profile.email ?? user.email ?? "",
    role: (profile.role as "admin" | "consultant") ?? "consultant",
    status: (profile.status as "pending" | "approved" | "rejected") ?? "pending",
  };
}

export async function requireApproved():
  Promise<{ ok: true; auth: AuthContext } | { ok: false; res: NextResponse }> {
  const auth = await currentUser();
  if (!auth) return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (auth.status !== "approved")
    return { ok: false, res: NextResponse.json({ error: "not_approved" }, { status: 403 }) };
  return { ok: true, auth };
}

export async function requireAdmin():
  Promise<{ ok: true; auth: AuthContext } | { ok: false; res: NextResponse }> {
  const auth = await currentUser();
  if (!auth) return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (auth.role !== "admin" || auth.status !== "approved")
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { ok: true, auth };
}
