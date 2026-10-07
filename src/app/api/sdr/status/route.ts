import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/status
 *
 * Proxy pro Hub VPS 24/7 (Fase 2 — Baileys + Claude Haiku).
 * Hub expõe GET /v1/sdr/status com { connected, phoneNumber, qrCode (dataURL),
 * engine, stats }.
 */
export async function GET() {
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;

  if (!hubUrl || !hubKey) {
    return NextResponse.json({
      connected: false,
      phoneNumber: null,
      channelName: null,
      qrCode: null,
      qrExpiresAt: null,
      engine: "none",
      stats: { totalLeads: 0, cotacoesHoje: 0, aguardandoResposta: 0, fechamentos: 0 },
    });
  }

  try {
    const r = await fetch(`${hubUrl}/v1/sdr/status`, {
      headers: { Authorization: `Bearer ${hubKey}` },
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json({
        connected: false,
        phoneNumber: null,
        channelName: null,
        qrCode: null,
        qrExpiresAt: null,
        engine: "none",
        stats: { totalLeads: 0, cotacoesHoje: 0, aguardandoResposta: 0, fechamentos: 0 },
        _error: `Hub respondeu ${r.status}`,
      });
    }
    return NextResponse.json(await r.json());
  } catch (err) {
    return NextResponse.json({
      connected: false,
      phoneNumber: null,
      channelName: null,
      qrCode: null,
      qrExpiresAt: null,
      engine: "none",
      stats: { totalLeads: 0, cotacoesHoje: 0, aguardandoResposta: 0, fechamentos: 0 },
      _error: (err as Error).message,
    });
  }
}
