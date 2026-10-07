import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/sdr/config — proxy pro Hub /v1/sdr/config.
 * Hub persiste em arquivo privado. Chaves são mascaradas no GET.
 */
export async function GET() {
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;
  if (!hubUrl || !hubKey) return NextResponse.json({ error: "HUB não configurado" }, { status: 500 });

  try {
    const r = await fetch(`${hubUrl}/v1/sdr/config`, {
      headers: { Authorization: `Bearer ${hubKey}` },
      cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ error: `Hub respondeu ${r.status}` }, { status: 502 });
    return NextResponse.json(await r.json());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;
  if (!hubUrl || !hubKey) return NextResponse.json({ error: "HUB não configurado" }, { status: 500 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "body inválido" }, { status: 400 });

  try {
    const r = await fetch(`${hubUrl}/v1/sdr/config`, {
      method: "POST",
      headers: { Authorization: `Bearer ${hubKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return NextResponse.json({ error: `Hub respondeu ${r.status}` }, { status: 502 });
    return NextResponse.json(await r.json());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
