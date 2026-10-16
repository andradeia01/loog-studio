import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hub/health
 * Health-check do LOOG Hub externo. Serve pra UI mostrar banner quando o Hub
 * tá fora do ar (que acontece: a URL muda, IP cai, SSL quebra, etc).
 *
 * Resposta: { ok: boolean, url?: string, error?: string, latencyMs?: number }
 * Nunca retorna 5xx — sempre JSON válido (pra UI nunca travar).
 */
export async function GET() {
  const url = process.env.LOOG_HUB_URL ?? process.env.HUB_URL;
  if (!url) {
    return NextResponse.json({
      ok: false,
      error: "HUB_URL não configurado",
      url: null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const started = Date.now();
  try {
    // Tenta /health primeiro, cai pro root. Timeout curto pra não travar a UI.
    const target = `${url.replace(/\/+$/, "")}/v1/health`;
    const r = await fetch(target, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    // Qualquer resposta HTTP (incluindo 401 "falta auth" e 404 "rota não existe")
    // significa que o Hub tá UP e respondendo. Só erro de rede/SSL conta como offline.
    if (r.status < 500 || r.status === 503) {
      return NextResponse.json({
        ok: true,
        url,
        latencyMs,
        httpStatus: r.status,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      ok: false,
      url,
      error: `Hub respondeu HTTP ${r.status}`,
      latencyMs,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      url,
      error: msg.includes("fetch failed") ? "Hub inacessível (conexão recusada)"
          : msg.includes("timeout") ? "Hub não respondeu em 4s"
          : msg,
      latencyMs,
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
