import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/messages?leadId=xxx
 *
 * Histórico de mensagens de uma conversa do WhatsApp.
 *
 * Hoje: STUB. [].
 * Fase 2: proxy pro Hub GET /v1/sdr/conversations/:leadId/messages.
 */
export async function GET(req: Request) {
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;
  const url = new URL(req.url);
  const leadId = url.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId obrigatório" }, { status: 400 });

  if (!hubUrl || !hubKey) return NextResponse.json([]);

  try {
    const r = await fetch(`${hubUrl}/v1/sdr/conversations/${encodeURIComponent(leadId)}/messages`, {
      headers: { Authorization: `Bearer ${hubKey}` },
    });
    if (!r.ok) return NextResponse.json([]);
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json([]);
  }
}
