import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/push/health — debug: reporta disponibilidade de envs sem revelar valores. */
export async function GET() {
  const envStatus = {
    PUSH_DISPATCH_SECRET: {
      present: !!process.env.PUSH_DISPATCH_SECRET,
      length: (process.env.PUSH_DISPATCH_SECRET ?? "").length,
    },
    VAPID_PRIVATE_KEY: {
      present: !!process.env.VAPID_PRIVATE_KEY,
      length: (process.env.VAPID_PRIVATE_KEY ?? "").length,
    },
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: {
      present: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      length: (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").length,
    },
    VAPID_SUBJECT: {
      present: !!process.env.VAPID_SUBJECT,
      length: (process.env.VAPID_SUBJECT ?? "").length,
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      length: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length,
    },
  };
  return NextResponse.json({ ok: true, envs: envStatus });
}
