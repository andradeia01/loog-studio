import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(400).optional(),
  image: z.string().url().optional(),
  tag: z.string().max(60).optional(),
  url: z.string().optional(),
  requireInteraction: z.boolean().optional(),
  /** Roles que recebem. Default: admin + consultant_sdr */
  roles: z.array(z.enum(["admin", "gestor", "consultant", "consultant_sdr"])).optional(),
});

/**
 * POST /api/push/dispatch
 * Chamado pelo Hub quando chega cotação/handoff. Autenticado via header
 * x-dispatch-secret (compartilhado com o Hub).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  const got = req.headers.get("x-dispatch-secret");
  if (!secret || got !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "payload inválido" }, { status: 400 });

  const vapidPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPriv = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:andrade@axencode.com.br";
  if (!vapidPub || !vapidPriv) return NextResponse.json({ error: "vapid keys missing" }, { status: 500 });
  webpush.setVapidDetails(vapidSubject, vapidPub, vapidPriv);

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase admin" }, { status: 500 });

  const roles = parsed.data.roles ?? ["admin", "consultant_sdr"];

  // 1) pega user_ids com role autorizada e status approved
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .in("role", roles)
    .eq("status", "approved");
  const userIds = (profiles ?? []).map((p) => p.id as string);
  if (userIds.length === 0) return NextResponse.json({ ok: true, sent: 0, note: "no eligible users" });

  // 2) pega subscriptions desses users
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key, user_id")
    .in("user_id", userIds);
  const subscriptions = subs ?? [];
  if (subscriptions.length === 0) return NextResponse.json({ ok: true, sent: 0, note: "no subscriptions" });

  // 3) dispara em paralelo
  const payload = JSON.stringify({
    title: parsed.data.title,
    body: parsed.data.body ?? "",
    image: parsed.data.image,
    tag: parsed.data.tag ?? "loog-sdr",
    requireInteraction: parsed.data.requireInteraction ?? true,
    data: { url: parsed.data.url ?? "/studio?mundo=vendas&sub=sdr" },
  });

  const results = await Promise.allSettled(
    subscriptions.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth_key as string } },
        payload,
      )
    ),
  );
  let sent = 0, failed = 0;
  const toRemove: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") sent++;
    else {
      failed++;
      // 404/410 = subscription inválida — remove
      const code = (r.reason as { statusCode?: number } | undefined)?.statusCode;
      if (code === 404 || code === 410) {
        const s = subscriptions[i];
        if (s?.endpoint) toRemove.push(s.endpoint as string);
      }
    }
  });
  if (toRemove.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", toRemove);
  }
  return NextResponse.json({ ok: true, sent, failed, pruned: toRemove.length });
}
