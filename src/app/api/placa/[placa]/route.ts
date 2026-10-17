import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { consultarPlaca } from "@/lib/placafipe";
import {
  errPlacaInvalida, errPlacafipeTokenAusente, errPlacafipeTokenInvalido,
  errPlacafipeNaoEncontrou, errPlacafipeTimeout, errPlacafipeIndisponivel,
  errPlacafipeSemCredito, errRateLimitStudio, errSessaoExpirada,
  errNaoAprovado, toApiResponse,
} from "@/lib/errors/cotacao-errors";
import { checkRateLimit, rateLimitKey } from "@/lib/errors/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 60; // 60 req/min por consultor (ou IP se dev sem supabase)

export async function GET(req: NextRequest, ctx: { params: Promise<{ placa: string }> }) {
  // Auth PRIMEIRO: precisamos do userId pro bucket de rate-limit.
  let userId: string | null = null;
  if (supabaseConfigured()) {
    const auth = await currentUser();
    if (!auth) {
      const err = errSessaoExpirada();
      return NextResponse.json(toApiResponse(err).body, { status: toApiResponse(err).status });
    }
    if (auth.status !== "approved") {
      const err = errNaoAprovado();
      return NextResponse.json(toApiResponse(err).body, { status: toApiResponse(err).status });
    }
    userId = auth.userId;
  }

  // Rate limit por consultor (não IP) — vários consultores no mesmo escritório não brigam.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const rl = checkRateLimit(rateLimitKey(userId, ip, "placa"), LIMIT);
  if (rl.limited) {
    const err = errRateLimitStudio(rl.retryAfterSecs);
    return NextResponse.json(toApiResponse(err).body, {
      status: toApiResponse(err).status,
      headers: { "Retry-After": String(rl.retryAfterSecs) },
    });
  }

  const { placa } = await ctx.params;
  const result = await consultarPlaca(placa ?? "");
  if (!result.ok) {
    // Mapeia o result.error legado → catálogo tipado com source "placafipe"
    const placaStr = String(placa ?? "");
    const err =
      result.error === "placa_invalida"   ? errPlacaInvalida(placaStr) :
      result.error === "token_ausente"    ? errPlacafipeTokenAusente() :
      result.error === "token_invalido"   ? errPlacafipeTokenInvalido(result.message) :
      result.error === "sem_credito"      ? errPlacafipeSemCredito(result.message) :
      result.error === "nao_encontrado"   ? errPlacafipeNaoEncontrou(placaStr, result.message) :
      result.error === "timeout"          ? errPlacafipeTimeout(placaStr) :
                                            errPlacafipeIndisponivel(placaStr, result.message);
    return NextResponse.json(toApiResponse(err).body, { status: toApiResponse(err).status });
  }
  return NextResponse.json(result);
}
