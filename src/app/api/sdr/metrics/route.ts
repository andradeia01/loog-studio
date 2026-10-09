import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sdr/metrics — proxy pro Hub, dashboard de métricas. */
export async function GET() {
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;
  if (!hubUrl || !hubKey) return NextResponse.json({ _stub: true });
  try {
    const r = await fetch(`${hubUrl}/v1/sdr/metrics`, {
      headers: { Authorization: `Bearer ${hubKey}` },
      cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ error: `Hub respondeu ${r.status}` }, { status: 502 });
    return NextResponse.json(await r.json());
  } catch (err) {
    return NextResponse.json({ error: `Falha: ${(err as Error).message}` }, { status: 502 });
  }
}
