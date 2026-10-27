/**
 * Netlify Scheduled Function — dispara o worker de sync SIVIS a cada 1 minuto.
 *
 * Chama internamente POST /api/sivis/sync-worker passando o secret.
 */
import type { Config } from "@netlify/functions";

export default async (_req: Request) => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";
  const secret = process.env.SIVIS_WORKER_SECRET;
  if (!secret) {
    console.warn("[sivis-sync-cron] SIVIS_WORKER_SECRET nao configurada — skipping");
    return new Response("skipped", { status: 200 });
  }
  const res = await fetch(`${base}/api/sivis/sync-worker`, {
    method: "POST",
    headers: { "x-sivis-worker-secret": secret, "content-type": "application/json" },
    body: "{}",
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) console.warn("[sivis-sync-cron]", res.status, body.slice(0, 200));
  return new Response(body, { status: res.status });
};

export const config: Config = {
  schedule: "* * * * *", // a cada minuto
};
