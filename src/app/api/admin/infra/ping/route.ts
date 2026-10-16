import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ ok: false, error: "invalid_url" }, { status: 400 });
  }
  const started = Date.now();
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - started;
    return NextResponse.json({
      ok: resp.status < 500,
      status: resp.status,
      latencyMs,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    });
  }
}
