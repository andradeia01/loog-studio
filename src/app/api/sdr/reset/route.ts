import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sdr/reset
 *
 * Força desconexão + apaga sessão Baileys no Hub. Próximo /api/sdr/qr
 * vai gerar um pareamento zero. Útil quando o WhatsApp fica em
 * "aguardando mensagem" (sessão criptográfica dessincronizada).
 */
export async function POST() {
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;

  if (!hubUrl || !hubKey) {
    return NextResponse.json({ ok: false, error: "HUB_URL/HUB_INTERNAL_API_KEY ausentes" }, { status: 500 });
  }

  try {
    const r = await fetch(`${hubUrl}/v1/sdr/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${hubKey}` },
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: `Hub respondeu ${r.status}` }, { status: 502 });
    }
    return NextResponse.json(await r.json());
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
