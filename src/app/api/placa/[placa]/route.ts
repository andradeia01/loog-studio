import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { getSetting } from "@/lib/admin-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://api.placafipe.com.br/getplaca";

const HITS = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 15;
const WINDOW_MS = 60_000;
function rateLimited(ip: string) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || rec.resetAt < now) { HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  rec.count += 1;
  return rec.count > LIMIT;
}

function cleanPlaca(raw: string): string | null {
  const only = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (only.length !== 7) return null;
  // antigo: AAA9999 | mercosul: AAA9A99
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(only)) return null;
  return only;
}

async function resolveToken(): Promise<string | null> {
  const env = process.env.PLACAFIPE_TOKEN;
  if (env && env.trim()) return env.trim();
  const row = await getSetting<{ placafipe?: string }>("api_keys");
  return row?.placafipe?.trim() || null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ placa: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  if (supabaseConfigured()) {
    const auth = await requireApproved();
    if (!auth.ok) return auth.res;
  }

  const { placa: rawPlaca } = await ctx.params;
  const placa = cleanPlaca(rawPlaca ?? "");
  if (!placa) {
    return NextResponse.json({ error: "placa_invalida", message: "Formato inválido. Use ABC1D23 ou ABC1234." }, { status: 400 });
  }

  const token = await resolveToken();
  if (!token) {
    return NextResponse.json({ error: "token_ausente", message: "Token PlacaFipe não configurado. Peça pro admin cadastrar em /admin/config." }, { status: 500 });
  }

  try {
    const up = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token, placa }),
      // 10s é o suficiente — upstream normalmente responde em <2s
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    const payload = await up.json().catch(() => ({ codigo: 0, msg: "resposta inválida do upstream" }));

    if (!up.ok) {
      return NextResponse.json(
        { error: "upstream_error", status: up.status, message: payload?.msg ?? `HTTP ${up.status}` },
        { status: up.status === 401 ? 502 : up.status >= 500 ? 502 : 400 },
      );
    }

    // codigo != 1 significa "não encontrado" ou erro de negócio da upstream
    if (payload?.codigo !== 1) {
      return NextResponse.json(
        { error: "nao_encontrado", message: payload?.msg ?? "Veículo não encontrado.", placa },
        { status: 404 },
      );
    }

    const info = payload.informacoes_veiculo ?? {};
    return NextResponse.json({
      ok: true,
      placa: info.placa ?? placa,
      placa_alternativa: info.placa_alternativa ?? null,
      marca: info.marca ?? null,
      modelo: info.modelo ?? null,
      ano: info.ano ?? null,
      ano_modelo: info.ano_modelo ?? null,
      cor: info.cor ?? null,
      chassi: info.chassi ?? null,
      municipio: info.municipio ?? null,
      uf: info.uf ?? null,
      segmento: info.segmento ?? null,
      sub_segmento: info.sub_segmento ?? null,
      cilindradas: info.cilindradas ?? null,
      potencia: info.potencia ?? null,
      combustivel: info.combustivel ?? null,
      upstream_ms: payload.tempo ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/placa] erro:", msg);
    const isTimeout = /timeout|AbortError/i.test(msg);
    return NextResponse.json(
      { error: isTimeout ? "timeout" : "falha", message: isTimeout ? "A consulta demorou demais. Tente novamente." : msg },
      { status: 504 },
    );
  }
}
