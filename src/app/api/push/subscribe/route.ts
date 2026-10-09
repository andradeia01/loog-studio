import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  userAgent: z.string().max(400).optional(),
});

/**
 * POST /api/push/subscribe
 * Salva a push subscription do browser do usuário (idempotente por endpoint).
 */
export async function POST(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase admin" }, { status: 500 });

  const { data, error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: auth.auth.userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth_key: parsed.data.keys.auth,
        user_agent: parsed.data.userAgent ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    )
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, subscription: data });
}

/** DELETE /api/push/subscribe?endpoint=... — remove a assinatura do browser atual. */
export async function DELETE(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "endpoint obrigatório" }, { status: 400 });
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase admin" }, { status: 500 });
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", auth.auth.userId);
  return NextResponse.json({ ok: true });
}
