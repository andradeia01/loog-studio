import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/sdr/config  → config atual (sem segredos)
 * POST /api/sdr/config  → salva nova config
 *
 * Hoje: STUB. Devolve defaults. Fase 2: Supabase (tabela sdr_config,
 * uma row por workspace, com chaves criptografadas via pgcrypto).
 */
interface SdrConfig {
  elevenLabsKey: string;
  elevenLabsVoiceId: string;
  claudeKey: string;
  claudeModel: "haiku-4-5" | "sonnet-5-5" | "opus-5-5";
  systemPrompt: string;
  audioStrategy: "nunca" | "estrategico" | "sempre-primeiro";
}

const DEFAULT: SdrConfig = {
  elevenLabsKey: "",
  elevenLabsVoiceId: "",
  claudeKey: "",
  claudeModel: "haiku-4-5",
  systemPrompt: "",
  audioStrategy: "estrategico",
};

export async function GET() {
  // Nunca devolve chaves reais pro cliente — mascara.
  const safe: SdrConfig = {
    ...DEFAULT,
    elevenLabsKey: DEFAULT.elevenLabsKey ? "••••••••" : "",
    claudeKey: DEFAULT.claudeKey ? "••••••••" : "",
  };
  return NextResponse.json(safe);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "body inválido" }, { status: 400 });

  // Fase 2: persistir em Supabase com pgcrypto. Por enquanto só eco.
  return NextResponse.json({ ok: true, _stub: true });
}
