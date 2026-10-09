import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/version — retorna o commit do build atual.
 * Usado pelo cliente pra detectar que saiu uma versão nova.
 * Netlify expõe COMMIT_REF automaticamente durante o build.
 */
export async function GET() {
  const commit = process.env.COMMIT_REF
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.NEXT_PUBLIC_BUILD_ID
    || "dev";
  return NextResponse.json({ commit: commit.slice(0, 12), builtAt: process.env.NETLIFY_BUILD_START || null });
}
