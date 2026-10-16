import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured, createSupabaseServer } from "@/lib/supabase/server";
import { quoteFromPlate, quoteFromText, HubError } from "@/lib/loog-hub";
import { registrarInteracaoCRM } from "@/lib/crm/registrar";
import { consultarPlaca, variantesPlaca, inferirTipoVeiculo } from "@/lib/placafipe";
import { sendCAPIEvent, newEventId } from "@/lib/meta-capi";

/**
 * Códigos de coberturas que a cotação RÁPIDA já inclui por padrão em cada tipo de veículo.
 * Esses códigos têm `delta_cents=0` no banco (ver migration 010 + fix) — a UI mostra como
 * "incluso" e pré-seleciona pra o consultor saber o que já tá valendo. Upgrades a partir
 * daí cobram a DIFERENÇA (ex: trocar terceiros_30k pelo _100k cobra +R$ 50).
 */
const COBERTURAS_DEFAULT_POR_TIPO: Record<string, string[]> = {
  carro:      ["reboque_carro_300",      "terceiros_carro_30k",      "reserva_carro_10d",      "vidros_carro_completa"],
  moto:       ["reboque_moto_300",       "terceiros_moto_30k"],
  utilitario: ["reboque_util_300",       "terceiros_util_30k",       "reserva_util_10d",       "vidros_util_completa"],
  eletrico:   ["reboque_eletrico_300",   "terceiros_eletrico_30k",   "reserva_eletrico_10d",   "vidros_eletrico_completa"],
  caminhao:   [],
};

/** Desconto automático aplicado em toda cotação do consultor. 10% é a política atual
 *  (consultor pode dar até 10% sem pedir aprovação; acima disso precisa de gestor). */
const DESCONTO_AUTOMATICO_PCT = 10;

/**
 * Aplica deltas de coberturas opcionais sobre o resultado do Hub + desconto automático.
 * Fonte: tabela cotacao_coverages (seed oficial LOOG, migração 010).
 * Toda cobertura é somada em R$ fixo — exceto Roubo+Furto e Colisão que são
 * % FIPE e JÁ VÊM no monthlyValueCents do Hub.
 *
 * Fluxo:
 *   1. Lê base (plan.monthlyValueCents ou monthlyValueCents)
 *   2. Soma deltas das coberturas marcadas pelo consultor
 *   3. Aplica desconto automático de 10%
 *   4. Devolve result com o novo total + breakdown detalhado
 */
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function aplicarDeltasCoberturas(
  result: Record<string, unknown>,
  coberturasCodigos: string[],
  tipoVeiculo: string,
  descontoPctRequerido?: number,
): Promise<{
  result: Record<string, unknown>;
  breakdown: { codigo: string; descricao: string; delta_cents: number; grupo_label?: string }[];
  totalDeltaCents: number;
  descontoCents: number;
  descontoPct: number;
  defaultCodes: string[];
  coberturasAplicadas: string[];
}> {
  const defaultCodes = COBERTURAS_DEFAULT_POR_TIPO[tipoVeiculo] ?? [];
  // REGRA: UI é fonte de verdade. Se o consultor mandou lista, essa é a lista final (ele
  // pode ter trocado terceiros_30k pelo _50k — não devemos re-inserir o default). Se mandou
  // vazio, aplicamos os defaults como estado inicial da cotação.
  const codigosFinais = coberturasCodigos.length > 0 ? coberturasCodigos : [...defaultCodes];

  let breakdown: { codigo: string; descricao: string; delta_cents: number }[] = [];
  if (codigosFinais.length && supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const { data } = await supabase
      .from("cotacao_coverages")
      .select("codigo, descricao, delta_cents, grupo_label")
      .in("codigo", codigosFinais)
      .eq("ativo", true);
    breakdown = (data ?? []).map((r) => ({
      codigo: r.codigo as string,
      descricao: r.descricao as string,
      delta_cents: r.delta_cents as number,
      grupo_label: r.grupo_label as string | undefined,
    }));
  }
  const totalDeltaCents = breakdown.reduce((s, r) => s + r.delta_cents, 0);

  const r = { ...result } as Record<string, unknown>;
  const plan = (r.plan ?? {}) as Record<string, unknown>;
  const baseMensalPlan = typeof plan.monthlyValueCents === "number" ? plan.monthlyValueCents : null;
  const baseMensalRoot = typeof r.monthlyValueCents === "number" ? (r.monthlyValueCents as number) : null;
  const base = baseMensalPlan ?? baseMensalRoot ?? 0;

  // Fórmula clara:
  //   bruto = base_do_Hub + Σ(deltas das coberturas escolhidas)
  //   desconto = 10% × bruto
  //   final = bruto - desconto
  // O desconto SEMPRE recalcula sobre o bruto atual — se o consultor adicionar coberturas,
  // o desconto aumenta junto (porque é % do bruto novo).
  const totalBrutoCents = base + totalDeltaCents;
  // pct vem do consultor (0 = sem desconto) ou usa o default (10%)
  // Clampa em 0-20 por segurança (role check vem depois)
  const descontoPct = Math.max(0, Math.min(20, descontoPctRequerido ?? DESCONTO_AUTOMATICO_PCT));
  const descontoCents = Math.round(totalBrutoCents * (descontoPct / 100));
  const totalFinalCents = Math.max(0, totalBrutoCents - descontoCents);

  // CRÍTICO: atualizar BOTH monthlyValueCents (número) E monthlyValueFormatted (string).
  // O frontend prefere a string quando ela existe — se não atualizarmos, UI mostra valor stale.
  if (baseMensalPlan != null) {
    r.plan = {
      ...plan,
      monthlyValueCents: totalFinalCents,
      monthlyValueFormatted: brl(totalFinalCents),
      monthlyValueCentsBase: base,
      monthlyValueCentsBruto: totalBrutoCents,
      monthlyValueFormattedBruto: brl(totalBrutoCents),
    };
  }
  if (baseMensalRoot != null) r.monthlyValueCents = totalFinalCents;

  r.coverageBreakdown = {
    base_cents: base,
    deltas: breakdown,
    bruto_cents: totalBrutoCents,
    desconto_pct: descontoPct,
    desconto_cents: descontoCents,
    total_cents: totalFinalCents,
    defaults_aplicados: defaultCodes,
  };

  return { result: r, breakdown, totalDeltaCents, descontoCents, descontoPct, defaultCodes, coberturasAplicadas: codigosFinais };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 60_000;
function rateLimited(ip: string) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || rec.resetAt < now) { HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  rec.count += 1;
  return rec.count > LIMIT;
}

const TrackingSchema = z.object({
  utm_source: z.string().max(120).nullable().optional(),
  utm_medium: z.string().max(120).nullable().optional(),
  utm_campaign: z.string().max(200).nullable().optional(),
  utm_content: z.string().max(200).nullable().optional(),
  utm_term: z.string().max(200).nullable().optional(),
  fbclid: z.string().max(300).nullable().optional(),
  gclid: z.string().max(300).nullable().optional(),
  referrer: z.string().max(500).nullable().optional(),
  landing_url: z.string().max(500).nullable().optional(),
  fbp: z.string().max(300).nullable().optional(),
  fbc: z.string().max(300).nullable().optional(),
  event_id: z.string().max(100).nullable().optional(),
}).optional();

const Body = z.object({
  placa: z.string().min(7).max(10),
  tipo_veiculo: z.enum(["carro", "moto", "utilitario", "eletrico"]).optional(),
  cliente: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(8).max(20),
  }),
  tracking: TrackingSchema,
  leadId: z.string().optional(),
  /** Códigos de coberturas opcionais aditivas (ex: ["terceiros_carro_100k","vidros_carro_completa"]). */
  coberturas: z.array(z.string().max(80)).max(20).optional(),
  /** FIPE escolhido manualmente pelo consultor na desambiguação (prevalece sobre o recomendado). */
  fipeCode: z.string().max(20).optional(),
  /** % de desconto a aplicar (0 a 20). Default = 10 (política padrão LOOG).
   *  Validações de role: consultor até 10% livre, gestor até 15%, admin até 20%. */
  descontoPct: z.number().min(0).max(20).optional(),
});

/**
 * Rota única: recebe placa + cliente, chama Hub `/v1/quote/from-plate`,
 * devolve cotação oficial LOOG (valor mensal, adesão, pdfUrl, whatsappMessage).
 *
 * O Hub cuida de: lookup placa → FIPE → cadeia Sivisweb → PDF proxy.
 * O LOOG Studio não calcula nada por conta própria.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let consultorId: string | undefined;
  let groupId: string | null | undefined;
  if (supabaseConfigured()) {
    const auth = await requireApproved();
    if (!auth.ok) return auth.res;
    consultorId = auth.auth.userId;
    groupId = auth.auth.groupId;
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  const telefoneDigits = parsed.data.cliente.telefone.replace(/[^0-9]/g, "");
  if (telefoneDigits.length < 10) {
    return NextResponse.json({ error: "telefone_invalido", message: "Telefone precisa ter DDD + número (10 ou 11 dígitos)." }, { status: 400 });
  }
  // Hub espera E.164 BR (55DDNNNNNNNNN); se já veio com 55, mantém, senão prefixa.
  const customerPhone = telefoneDigits.startsWith("55") ? telefoneDigits : `55${telefoneDigits}`;
  const leadIdFinal = parsed.data.leadId ?? (consultorId ? `loogstudio:${consultorId}` : undefined);

  // ========================================================================
  // CAMINHO PRIMÁRIO: PlacaFIPE (API paga configurada no admin) → quoteFromText
  // ========================================================================
  // Mais confiável que o provider interno do Hub pra placas Mercosul.
  // Se a PlacaFIPE tiver o veículo + FIPE, montamos o payload e enviamos
  // diretamente pelo endpoint from-text do Hub, pulando o lookup interno.
  let viaPrimario: "placafipe" | null = null;
  try {
    const placafipe = await consultarPlaca(parsed.data.placa);
    if (placafipe.ok && placafipe.veiculo.marca && placafipe.veiculo.modelo) {
      const v = placafipe.veiculo;
      const fipe = placafipe.fipe_recomendado;

      // IMPORTANTE: a PlacaFIPE retorna 2 descrições do veículo:
      //   - informacoes_veiculo.modelo   = texto curto/abreviado (ex "PALIO WK ADVEN FLEX")
      //   - fipe[].modelo                = texto COMPLETO do catálogo FIPE (ex "Palio Weekend Adventure LOCKER 1.8 Flex")
      // O Hub faz matching por similaridade no catálogo FIPE, então usar o
      // texto curto gera MATCH ERRADO (ex: casa com "Palio ELX 1.0 Fire"
      // que não é o veículo real). Preferir SEMPRE o texto do FIPE quando houver.
      const marcaFinal = fipe?.marca || v.marca;
      const modeloFinal = fipe?.modelo || v.modelo;
      const anoModelo = Number(fipe?.ano_modelo || v.ano_modelo || v.ano || 0);

      if (anoModelo >= 1980 && marcaFinal && modeloFinal) {
        viaPrimario = "placafipe";
        const placaPraHub = placafipe.veiculo.placa_alternativa ?? parsed.data.placa;

        // Tipo de veículo: usuário manda explícito OU inferimos do segmento/combustível/MODELO.
        // Passar modelo é fundamental — PlacaFIPE devolve segmento genérico ("AUTOMOVEL")
        // mesmo pra pickup/van/caminhão leve, então sem modelo o Bongo/Master/Toro iam
        // parar na tabela errada ("carro") com prêmio mais baixo que o devido.
        const tipoInferido = inferirTipoVeiculo({
          segmento: v.segmento,
          sub_segmento: v.sub_segmento,
          combustivel: fipe?.combustivel ?? v.combustivel,
          modelo: modeloFinal,
        });
        const vehicleTypeFinal = parsed.data.tipo_veiculo ?? tipoInferido ?? "carro";

        // Se o consultor desambiguou manualmente, troca pro FIPE escolhido
        const fipeManual = parsed.data.fipeCode
          ? (placafipe.fipe ?? []).find((f) => f.codigo_fipe === parsed.data.fipeCode)
          : null;
        const marcaUsada = fipeManual?.marca ?? marcaFinal;
        const modeloUsado = fipeManual?.modelo ?? modeloFinal;
        const anoUsado = Number(fipeManual?.ano_modelo ?? anoModelo);
        const fipeCodeUsado = fipeManual?.codigo_fipe ?? fipe?.codigo_fipe;

        const rawResult = await quoteFromText({
          brand: marcaUsada,
          model: modeloUsado,
          modelYear: anoUsado,
          fuel: (fipeManual?.combustivel ?? fipe?.combustivel ?? v.combustivel) ?? undefined,
          fipeCode: fipeCodeUsado ?? undefined,
          vehicleType: vehicleTypeFinal,
          plate: placaPraHub,
          customerName: parsed.data.cliente.nome,
          customerPhone,
          leadId: leadIdFinal,
        });

        // Aplica deltas + desconto variável (pct vem do consultor; default 10%)
        const { result, breakdown, totalDeltaCents, descontoCents, descontoPct, defaultCodes, coberturasAplicadas } = await aplicarDeltasCoberturas(
          rawResult as unknown as Record<string, unknown>,
          parsed.data.coberturas ?? [],
          vehicleTypeFinal,
          parsed.data.descontoPct,
        );

        if (consultorId) {
          void registrarInteracaoCRM({
            ownerId: consultorId,
            groupId,
            tipo: "cotacao_rapida",
            nome: parsed.data.cliente.nome,
            telefone: parsed.data.cliente.telefone,
            tracking: parsed.data.tracking ?? null,
            payload: {
              via: "placafipe+from-text",
              placa: parsed.data.placa,
              marcaCurta: v.marca, modeloCurto: v.modelo,
              marca: marcaFinal, modelo: modeloFinal, ano: anoModelo,
              cor: v.cor, uf: v.uf, municipio: v.municipio,
              fipeCodigo: fipe?.codigo_fipe ?? null,
              fipeValor: fipe?.valor_formatado ?? null,
              fipeSimilaridade: fipe?.similaridade ?? null,
              vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
              valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? fipe?.valor_formatado ?? null,
              quoteId: (result as { quoteId?: string }).quoteId ?? null,
              monthlyValueCents: (result as { monthlyValueCents?: number }).monthlyValueCents ?? null,
              whatsappMessage: (result as { whatsappMessage?: string }).whatsappMessage ?? null,
              coberturasCustomizadas: (parsed.data.coberturas ?? []).length ? breakdown : null,
              deltaCustomizacaoCents: totalDeltaCents || null,
              fipeManualEscolhido: parsed.data.fipeCode ?? null,
            },
          });
        }

        // Meta CAPI — evento Lead server-side (dedup com browser pelo event_id)
        const eventId = parsed.data.tracking?.event_id ?? newEventId();
        const monthly = (result as { plan?: { monthlyValueCents?: number } }).plan?.monthlyValueCents
          ?? (result as { monthlyValueCents?: number }).monthlyValueCents;
        void sendCAPIEvent({
          eventName: "Lead",
          eventId,
          eventSourceUrl: parsed.data.tracking?.landing_url ?? undefined,
          user: {
            phone: parsed.data.cliente.telefone,
            firstName: parsed.data.cliente.nome.split(" ")[0],
            lastName: parsed.data.cliente.nome.split(" ").slice(1).join(" ") || null,
            city: v.municipio ?? undefined,
            state: v.uf ?? undefined,
            country: "br",
            fbp: parsed.data.tracking?.fbp ?? undefined,
            fbc: parsed.data.tracking?.fbc ?? undefined,
            clientIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
            userAgent: req.headers.get("user-agent") ?? undefined,
          },
          custom: {
            value: monthly ? monthly / 100 : undefined,
            currency: "BRL",
            content_name: `${marcaFinal} ${modeloFinal}`,
            content_category: "cotacao_rapida",
          },
        });

        // Expõe as alternativas FIPE pra UI de desambiguação inline
        const fipeAlternatives = (placafipe.fipe_alternatives ?? []).map((f) => ({
          codigo_fipe: f.codigo_fipe,
          marca: f.marca,
          modelo: f.modelo,
          ano_modelo: f.ano_modelo,
          combustivel: f.combustivel,
          valor_formatado: f.valor_formatado,
          similaridade: f.similaridade,
        }));
        const fipeEscolhido = fipeManual ? parsed.data.fipeCode : fipe?.codigo_fipe;

        return NextResponse.json({
          ok: true,
          via: "placafipe",
          eventId,
          fipeAlternatives,
          fipeEscolhido,
          lowConfidence: placafipe.low_confidence ?? false,
          // coberturasAplicadas vem da função — reflete EXATAMENTE o que o consultor pediu,
          // sem forçar union com defaults (evita duplicatas por grupo exclusivo)
          coberturasAplicadas,
          coberturasDefault: defaultCodes,
          descontoCents,
          descontoPct,
          ...result,
        });
      }
    } else if (!placafipe.ok) {
      // Log só pra observabilidade — não derruba, cai no fallback
      console.warn("[cotacao] PlacaFIPE falhou (seguindo pra Hub direto):", placafipe.status, placafipe.message);
    }
  } catch (pfErr) {
    console.warn("[cotacao] PlacaFIPE erro inesperado:", pfErr instanceof Error ? pfErr.message : pfErr);
  }

  // ========================================================================
  // FALLBACK: provider interno do Hub (quoteFromPlate)
  // Tenta variantes de placa (Mercosul ↔ antiga) sequencialmente — o Hub
  // pode conhecer uma mas não a outra (ex: SIVIS historicamente usa antiga).
  // ========================================================================
  const placasPraTentar = variantesPlaca(parsed.data.placa);
  let ultimoErro: unknown = null;

  for (const placaVariante of placasPraTentar) {
    try {
      const rawResult = await quoteFromPlate({
        plate: placaVariante,
        vehicleType: parsed.data.tipo_veiculo,
        customerName: parsed.data.cliente.nome,
        customerPhone,
        leadId: leadIdFinal,
      });

      // Aplica deltas + desconto variável (fallback path)
      const tipoFallback = parsed.data.tipo_veiculo ?? "carro";
      const { result, breakdown, totalDeltaCents, descontoCents, descontoPct, defaultCodes, coberturasAplicadas } = await aplicarDeltasCoberturas(
        rawResult as unknown as Record<string, unknown>,
        parsed.data.coberturas ?? [],
        tipoFallback,
        parsed.data.descontoPct,
      );

      if (consultorId) {
        void registrarInteracaoCRM({
          ownerId: consultorId,
          groupId,
          tipo: "cotacao_rapida",
          nome: parsed.data.cliente.nome,
          telefone: parsed.data.cliente.telefone,
          tracking: parsed.data.tracking ?? null,
          payload: {
            via: placaVariante !== parsed.data.placa ? "hub-from-plate+variant" : "hub-from-plate",
            placa: parsed.data.placa,
            placaUsada: placaVariante,
            vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
            valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? null,
            quoteId: (result as { quoteId?: string }).quoteId ?? null,
            monthlyValueCents: (result as { monthlyValueCents?: number }).monthlyValueCents ?? null,
            whatsappMessage: (result as { whatsappMessage?: string }).whatsappMessage ?? null,
            coberturasCustomizadas: (parsed.data.coberturas ?? []).length ? breakdown : null,
            deltaCustomizacaoCents: totalDeltaCents || null,
          },
        });
      }

      // Meta CAPI — evento Lead server-side (fallback hub path)
      const eventId = parsed.data.tracking?.event_id ?? newEventId();
      const monthly = (result as { plan?: { monthlyValueCents?: number } }).plan?.monthlyValueCents
        ?? (result as { monthlyValueCents?: number }).monthlyValueCents;
      void sendCAPIEvent({
        eventName: "Lead",
        eventId,
        eventSourceUrl: parsed.data.tracking?.landing_url ?? undefined,
        user: {
          phone: parsed.data.cliente.telefone,
          firstName: parsed.data.cliente.nome.split(" ")[0],
          lastName: parsed.data.cliente.nome.split(" ").slice(1).join(" ") || null,
          country: "br",
          fbp: parsed.data.tracking?.fbp ?? undefined,
          fbc: parsed.data.tracking?.fbc ?? undefined,
          clientIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
          userAgent: req.headers.get("user-agent") ?? undefined,
        },
        custom: {
          value: monthly ? monthly / 100 : undefined,
          currency: "BRL",
          content_name: "cotacao_rapida",
          content_category: "cotacao_rapida",
        },
      });

      return NextResponse.json({
        ok: true,
        via: "hub-from-plate",
        eventId,
        placaUsada: placaVariante,
        coberturasAplicadas,
        coberturasDefault: defaultCodes,
        descontoCents,
        descontoPct,
        ...result,
      });
    } catch (err) {
      ultimoErro = err;
      // Se for 404 (placa não encontrada), vale tentar a próxima variante.
      // Se for outro erro (401/403/500), também vale tentar — o Hub pode se comportar diferente.
      if (err instanceof HubError) {
        console.warn(`[cotacao] Hub falhou pra ${placaVariante}: ${err.status} ${err.message}`);
        continue;
      }
      // Erro não-Hub: aborta
      break;
    }
  }

  // Se chegou aqui, nenhuma variante funcionou. Processa o último erro.
  {
    const err = ultimoErro;
    void viaPrimario; // evita unused warning
    if (err instanceof HubError) {
      // Log DETALHADO pra diagnóstico (nunca vaza pro cliente, só pros Function Logs)
      console.error("[cotacao] HubError:", {
        status: err.status,
        code: err.code,
        message: err.message,
        placa: parsed.data.placa,
        payload: err.payload,
      });

      // Mensagem específica por status — ajuda o consultor entender e sugere caminho
      let user: string;
      let canFallbackManual = false;
      switch (err.status) {
        case 401:
          user = "Chave do sistema LOOG inválida ou sessão expirada. Fale com o admin pra renovar — enquanto isso, use cotação manual (marca/modelo/ano).";
          canFallbackManual = true;
          break;
        case 403:
          user = "Esta placa está bloqueada no provedor LOOG (pode ser restrição comercial da base). Tente cotação manual.";
          canFallbackManual = true;
          break;
        case 404:
          user = "Placa não encontrada no provedor LOOG. Verifique se digitou certo — se tiver certeza da placa, use cotação manual (informa marca/modelo/ano).";
          canFallbackManual = true;
          break;
        case 429:
          user = "Muitas consultas em pouco tempo. Aguarde ~30s e tente novamente.";
          break;
        case 408:
        case 504:
          user = "O provedor LOOG demorou demais pra responder. Tente de novo.";
          break;
        case 502:
        case 503:
          user = "Sistema interno LOOG indisponível no momento. Tente em alguns segundos.";
          break;
        default:
          user = `Erro ao consultar placa (status ${err.status}). ${err.message}`;
      }
      return NextResponse.json(
        { error: err.code ?? "hub_error", message: user, status: err.status, canFallbackManual },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cotacao] falha nao-Hub:", msg);
    // Detecta erros de rede comuns (Hub offline, SSL quebrado, DNS, timeout)
    // e devolve mensagem clara pro consultor em vez do "fetch failed" cru.
    const isNetworkError = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|certificate|SSL|TLS/i.test(msg);
    if (isNetworkError) {
      return NextResponse.json({
        error: "hub_offline",
        message: "Sistema LOOG Hub temporariamente fora do ar. Nenhuma cotação consegue chegar no SIVIS agora. Tente de novo em alguns minutos — ou avise o admin.",
        hubOffline: true,
        canFallbackManual: false,
      }, { status: 503 });
    }
    return NextResponse.json({ error: "falha", message: msg }, { status: 500 });
  }
}
