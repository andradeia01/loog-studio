// Esta rota foi substituída por /api/cotacao, que agora delega 100% ao LOOG Hub.
// Mantida como shim para evitar 404 em clientes antigos.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const forwardUrl = new URL("/api/cotacao", req.url);
  return NextResponse.redirect(forwardUrl, { status: 308, headers: { "x-loog-shim": "sivis-cotacao-deprecated" } });
  // 308 preserva método POST + body
}
