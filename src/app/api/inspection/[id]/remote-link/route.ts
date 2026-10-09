import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inspection/[id]/remote-link
 * Gera um token aleatório (72h) e retorna o link público /vistoria/[token].
 * Marca a vistoria como mode=REMOTE.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "supabase admin indisponível" }, { status: 500 });

  const { id } = await ctx.params;
  const { data: insp } = await admin.from("inspections").select("owner_id").eq("id", id).single();
  if (!insp) return NextResponse.json({ error: "vistoria não encontrada" }, { status: 404 });
  if (insp.owner_id !== auth.auth.userId && auth.auth.role !== "admin") {
    return NextResponse.json({ error: "não autorizado" }, { status: 403 });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { error: upErr } = await admin
    .from("inspections")
    .update({ mode: "REMOTE", remote_token: token, remote_token_expires_at: expiresAt })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const origin = req.headers.get("origin") ?? req.headers.get("host") ?? "";
  const base = origin.startsWith("http") ? origin : `https://${origin}`;
  const link = `${base}/vistoria/${token}`;

  return NextResponse.json({ token, link, expiresAt });
}
