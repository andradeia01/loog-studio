import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { hubStatus } from "@/lib/loog-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// diagnóstico — só admin acessa, nunca vaza API key
export async function GET() {
  if (supabaseConfigured()) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.res;
  }
  return NextResponse.json(hubStatus());
}
