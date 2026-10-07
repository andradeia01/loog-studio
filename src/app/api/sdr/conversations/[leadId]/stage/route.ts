import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sdr/conversations/[leadId]/stage
 * Body: { bucket: "novo" | "cotado" | "negociando" | "pago" | "perdido" }
 *
 * Muda manualmente o bucket do lead no Kanban. Proxy pro Hub.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ leadId: string }> }
) {
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;
  const { leadId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { bucket } = body as { bucket?: string };
  if (!bucket) {
    return NextResponse.json({ error: "bucket obrigatório" }, { status: 400 });
  }

  if (!hubUrl || !hubKey) {
    return NextResponse.json({ ok: true, _stub: true, bucket });
  }

  try {
    const r = await fetch(
      `${hubUrl}/v1/sdr/conversations/${encodeURIComponent(leadId)}/stage`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hubKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bucket }),
      }
    );
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
