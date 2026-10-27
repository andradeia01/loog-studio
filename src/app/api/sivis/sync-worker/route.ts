/**
 * POST /api/sivis/sync-worker — endpoint do worker de sync SIVIS.
 *
 * Chamado pela Netlify Scheduled Function (netlify/functions/sivis-sync-cron.mts)
 * a cada 1 minuto. Protegido por header `x-sivis-worker-secret` que bate com
 * env SIVIS_WORKER_SECRET.
 *
 * Pode tambem ser chamado manualmente por admin via UI pra forcar execucao.
 */
import { NextRequest, NextResponse } from "next/server";
import { processSyncQueue } from "@/lib/sivis/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Netlify default 10s nao basta — subir pra 60s pra batches grandes

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-sivis-worker-secret");
  const expected = process.env.SIVIS_WORKER_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "worker_secret_missing", message: "SIVIS_WORKER_SECRET nao configurada no server" }, { status: 500 });
  }
  if (secret !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const result = await processSyncQueue();
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-worker] crash:", msg);
    return NextResponse.json({ error: "worker_crash", message: msg }, { status: 500 });
  }
}
