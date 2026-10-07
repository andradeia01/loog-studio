import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/leads
 *
 * Proxy pro Hub /v1/sdr/conversations.
 */
export async function GET() {
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;

  if (!hubUrl || !hubKey) return NextResponse.json([]);

  try {
    const r = await fetch(`${hubUrl}/v1/sdr/conversations`, {
      headers: { Authorization: `Bearer ${hubKey}` },
      cache: "no-store",
    });
    if (!r.ok) return NextResponse.json([]);
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json([]);
  }
}
