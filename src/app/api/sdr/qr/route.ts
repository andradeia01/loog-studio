import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sdr/qr
 *
 * Pede pro Hub gerar um QR code novo via Baileys.
 *
 * Hoje: STUB. Devolve estado "ainda sem Hub Baileys" com instruções.
 * Fase 2: POST pro Hub (https://2-25-189-22.sslip.io/v1/sdr/qr), que
 * inicia uma sessão Baileys e retorna { qrCode (dataUrl), expiresAt }.
 */
export async function POST() {
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
      _note: "HUB_URL ou HUB_INTERNAL_API_KEY não configurado no env da Netlify",
    });
  }

  try {
    const r = await fetch(`${hubUrl}/v1/sdr/qr`, {
      method: "POST",
      headers: { Authorization: `Bearer ${hubKey}`, "Content-Type": "application/json" },
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Hub respondeu ${r.status}`, engine: "none" },
        { status: 502 }
      );
    }
    return NextResponse.json(await r.json());
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao contactar Hub: ${(err as Error).message}`, engine: "none" },
      { status: 502 }
    );
  }
}
