import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sdr/send
 * Body: { leadId, text }
 *
 * Envia mensagem manual pelo painel pra conversa do lead (via Hub → Baileys).
 *
 * Hoje: STUB. Devolve ok fake.
 * Fase 2: POST pro Hub /v1/sdr/send.
 */
export async function POST(req: Request) {
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;

  const body = await req.json().catch(() => ({}));
  const { leadId, text } = body as { leadId?: string; text?: string };
  if (!leadId || !text) {
    return NextResponse.json({ error: "leadId e text obrigatórios" }, { status: 400 });
  }

  if (!hubUrl || !hubKey) {
    return NextResponse.json({ ok: true, _stub: true });
  }

  try {
    const r = await fetch(`${hubUrl}/v1/sdr/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${hubKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, text }),
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Hub respondeu ${r.status}` },
        { status: 502 }
      );
    }
    return NextResponse.json(await r.json());
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao contactar Hub: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
