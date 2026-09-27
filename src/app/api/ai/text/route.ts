import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import { getOpenAI, MODEL_PRICING, calcTextCost } from "@/lib/ai/openai";
import { getBrandContext } from "@/lib/admin-settings";
import { checkQuota } from "@/lib/ai/quota";
import { systemPrompt, TEMPLATES, type TemplateKey } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  template: z.string(),
  fields: z.record(z.string(), z.string()),
});

/**
 * Modelo é DEFINIDO PELO SISTEMA — consultor não escolhe.
 * Usamos gpt-4o pra qualidade máxima (o -mini às vezes gera copy fraco pra vendas).
 */
const MODEL = "gpt-4o" as const;

export async function POST(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });

  const tplKey = parsed.data.template as TemplateKey;
  const tpl = TEMPLATES[tplKey];
  if (!tpl) return NextResponse.json({ error: "template desconhecido" }, { status: 400 });

  // quota
  const quota = await checkQuota(auth.auth.userId, auth.auth.role, "text");
  if (!quota.ok) return NextResponse.json({ error: quota.reason, quota }, { status: 429 });

  // key check
  const openai = await getOpenAI();
  if (!openai) return NextResponse.json({ error: "OpenAI não configurado. Peça pro admin adicionar a chave em /admin/config." }, { status: 503 });

  // busca contexto brand + dados do consultor
  const brand = await getBrandContext();
  const supabase = await createSupabaseServer();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, city, instagram")
    .eq("id", auth.auth.userId)
    .maybeSingle();

  const sys = systemPrompt(brand, {
    name: profile?.full_name ?? undefined,
    phone: profile?.phone ?? undefined,
    city: profile?.city ?? undefined,
    instagram: profile?.instagram ?? undefined,
  });
  const userPrompt = tpl.build(parsed.data.fields);

  const started = Date.now();
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 900,
    });
    const durationMs = Date.now() - started;
    const text = res.choices[0]?.message?.content ?? "";
    const tokensIn = res.usage?.prompt_tokens ?? 0;
    const tokensOut = res.usage?.completion_tokens ?? 0;
    const cost = calcTextCost(MODEL, tokensIn, tokensOut);

    const admin = createSupabaseAdmin();
    if (admin) {
      await admin.from("ai_generations").insert({
        profile_id: auth.auth.userId,
        type: "text",
        model: MODEL,
        prompt: `[${tplKey}] ${userPrompt}`.slice(0, 5000),
        result: { text, template: tplKey },
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: cost,
        duration_ms: durationMs,
      });
    }

    return NextResponse.json({
      text,
      template: tplKey,
      tokens: { in: tokensIn, out: tokensOut },
      cost_usd: cost,
      quota,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const friendly = friendlyOpenAIError(raw);
    const admin = createSupabaseAdmin();
    if (admin) {
      await admin.from("ai_generations").insert({
        profile_id: auth.auth.userId,
        type: "text",
        model: MODEL,
        prompt: userPrompt.slice(0, 5000),
        error: raw.slice(0, 500),
      });
    }
    return NextResponse.json({ error: friendly, code: friendly.code }, { status: friendly.status });
  }
}

/** Converte erros técnicos da OpenAI em mensagem clara pro consultor. */
function friendlyOpenAIError(raw: string): { message: string; code: string; status: number } {
  const low = raw.toLowerCase();
  if (low.includes("insufficient_quota") || low.includes("credit_balance_exhausted") || low.includes("no credits")) {
    return {
      message: "A conta de IA está sem créditos no momento. Peça pro admin recarregar o saldo.",
      code: "no_credits",
      status: 503,
    };
  }
  if (low.includes("invalid_api_key") || low.includes("incorrect api key")) {
    return { message: "A chave da OpenAI está inválida. Peça pro admin atualizar em Configurações.", code: "invalid_key", status: 503 };
  }
  if (low.includes("rate limit") || low.includes("rate_limit")) {
    return { message: "Muitas gerações agora. Tenta de novo em alguns segundos.", code: "rate_limit", status: 429 };
  }
  if (low.includes("content_policy") || low.includes("content policy")) {
    return { message: "O conteúdo foi bloqueado pelas regras da OpenAI. Reformule o pedido.", code: "content_policy", status: 400 };
  }
  return { message: "Falha na geração. Tenta de novo em alguns segundos.", code: "unknown", status: 500 };
}

/** GET — retorna lista de templates disponíveis (sem chamar OpenAI). */
export async function GET() {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const list = Object.entries(TEMPLATES).map(([k, v]) => ({
    key: k,
    label: v.label,
    description: v.description,
    fields: v.fields,
  }));
  return NextResponse.json({ templates: list });
}
