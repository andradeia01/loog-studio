import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { supabaseConfigured, createSupabaseServer } from "@/lib/supabase/server";
import { quoteFromPlate, quoteFromText, HubError } from "@/lib/loog-hub";
import { registrarInteracaoCRM } from "@/lib/crm/registrar";
import { consultarPlaca, variantesPlaca, inferirTipoVeiculo } from "@/lib/placafipe";
import { cotarCaminhaoLocal } from "@/lib/cotacao-pesados";
import { cotarVeiculoLocal } from "@/lib/cotacao-local";

/**
 * Flag central pra escolher primario: Hub SIVIS vs cotador LOCAL.
 *
 * DEFAULT = TRUE (local primario): cotador local agora usa `sivis_price_table`
 * (migration 016) com tabela DEDUZIDA de 225 cotacoes reais do SIVIS. Validado:
 *   - 100% das motos acertam ao centavo
 *   - 94.7% dos carros com erro < R$1
 *
 * CAMINHAO: SEMPRE local (SIVIS nao conhece caminhao).
 *
 * Pra forcar Hub como primario (ex: suspeita que tabela saiu de sync):
 * USE_LOCAL_PRICING=false em env var.
 */
const USE_LOCAL_PRICING = process.env.USE_LOCAL_PRICING !== "false";
import { sendCAPIEvent, newEventId } from "@/lib/meta-capi";
import {
  errSessaoExpirada, errNaoAprovado, errTelefoneInvalido, errBodyInvalido,
  errRateLimitStudio, classifyHubError, errHubOffline, errDesconhecido,
  isNetworkError, toApiResponse, type CotacaoError,
} from "@/lib/errors/cotacao-errors";
import { checkRateLimit, rateLimitKey } from "@/lib/errors/rate-limit";

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

/** Desconto AUTOMATICO = 0% (SIVIS nao tem desconto no fluxo oficial).
 *  Consultor pode ATIVAR desconto 1-10% via slider na UI, mas nao vem ligado por default.
 *  Decisao Luis 27/10/2026 — "No SIVIS nao tem desconto". */
const DESCONTO_AUTOMATICO_PCT = 0;

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
  adesaoCentsRequerido?: number,
): Promise<{
  result: Record<string, unknown>;
  breakdown: { codigo: string; descricao: string; delta_cents: number; grupo_label?: string }[];
  totalDeltaCents: number;
  descontoCents: number;
  descontoPct: number;
  adesaoCents: number;
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
  // Politica LOOG: desconto maximo 10% (consultor nao pode dar mais sem aprovacao fora do sistema)
  const descontoPct = Math.max(0, Math.min(10, descontoPctRequerido ?? DESCONTO_AUTOMATICO_PCT));
  const descontoCents = Math.round(totalBrutoCents * (descontoPct / 100));
  const totalFinalCents = Math.max(0, totalBrutoCents - descontoCents);

  // ADESÃO: respeita piso por tipo (R$ 100 leve, R$ 1.500 pesado).
  // Consultor pode SUBIR via UI, mas nunca descer do piso.
  const piso = pisoAdesao(tipoVeiculo);
  const adesaoCents = Math.max(piso, Math.round(adesaoCentsRequerido ?? piso));

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
      joinFeeValueCents: adesaoCents,
      joinFeeFormatted: brl(adesaoCents),
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
    adesao_cents: adesaoCents,
    adesao_piso_cents: piso,
    defaults_aplicados: defaultCodes,
  };

  return { result: r, breakdown, totalDeltaCents, descontoCents, descontoPct, adesaoCents, defaultCodes, coberturasAplicadas: codigosFinais };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rate limit por consultor (não IP): 40 cotações/min — margem pra ninguém atingir num dia normal
const COTACAO_LIMIT = 40;

/** Helper: devolve NextResponse já formatado a partir de um CotacaoError. */
function errResponse(err: CotacaoError, extraHeaders?: Record<string, string>): NextResponse {
  const { body, status } = toApiResponse(err);
  return NextResponse.json(body, { status, headers: extraHeaders });
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
  tipo_veiculo: z.enum(["carro", "moto", "utilitario", "eletrico", "caminhao"]).optional(),
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
  descontoPct: z.number().min(0).max(10).optional(),
  /** Adesão customizada em centavos. Piso por tipo: 10000 (R$ 100) leves ou 150000 (R$ 1.500) caminhão.
   *  Consultor pode subir, nunca descer do piso. Default = piso do tipo. */
  adesaoCents: z.number().int().min(0).max(10_000_000).optional(),
});

/** Piso de adesão por tipo (Luís 27/10/2026). Caminhão tem custo operacional bem maior. */
function pisoAdesao(tipo: string): number {
  return tipo === "caminhao" ? 150000 : 10000;
}

/**
 * Rota única: recebe placa + cliente, chama Hub `/v1/quote/from-plate`,
 * devolve cotação oficial LOOG (valor mensal, adesão, pdfUrl, whatsappMessage).
 *
 * O Hub cuida de: lookup placa → FIPE → cadeia Sivisweb → PDF proxy.
 * O LOOG Studio não calcula nada por conta própria.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Auth PRIMEIRO (precisamos do userId pro rate-limit por consultor).
  // Sessão expirada = 401 com source "auth" → cliente oferece "Entrar de novo".
  let consultorId: string | undefined;
  let groupId: string | null | undefined;
  if (supabaseConfigured()) {
    const auth = await currentUser();
    if (!auth) return errResponse(errSessaoExpirada());
    if (auth.status !== "approved") return errResponse(errNaoAprovado());
    consultorId = auth.userId;
    groupId = auth.groupId;
  }

  const rl = checkRateLimit(rateLimitKey(consultorId ?? null, ip, "cotacao"), COTACAO_LIMIT);
  if (rl.limited) return errResponse(errRateLimitStudio(rl.retryAfterSecs), { "Retry-After": String(rl.retryAfterSecs) });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errResponse(errBodyInvalido(parsed.error.flatten()));

  const telefoneDigits = parsed.data.cliente.telefone.replace(/[^0-9]/g, "");
  if (telefoneDigits.length < 10) return errResponse(errTelefoneInvalido());
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
        // RESPEITA a escolha do consultor sempre que ele mandou — a UI sempre envia
        // (defaults pra "carro"). Inferencia so entra se chegou undefined (ex: cotacao
        // via API externa sem UI). Isso evita que FP de regex em modelo (ex: Mercedes
        // R-Class R350 batendo em padrao de Scania R350) jogue carros em tabela errada.
        const vehicleTypeFinal = parsed.data.tipo_veiculo ?? tipoInferido ?? "carro";

        // Se o consultor desambiguou manualmente, troca pro FIPE escolhido
        const fipeManual = parsed.data.fipeCode
          ? (placafipe.fipe ?? []).find((f) => f.codigo_fipe === parsed.data.fipeCode)
          : null;
        const marcaUsada = fipeManual?.marca ?? marcaFinal;
        const modeloUsado = fipeManual?.modelo ?? modeloFinal;
        const anoUsado = Number(fipeManual?.ano_modelo ?? anoModelo);
        const fipeCodeUsado = fipeManual?.codigo_fipe ?? fipe?.codigo_fipe;

        // ROTEAMENTO:
        //   USE_LOCAL_PRICING=true (default) → cotador local pra TODOS os tipos
        //     (saindo do SIVIS, usa a tabela `plans` com os seeds leves-oficial + pesados-026)
        //   caminhao sempre vai local (SIVIS nao conhece caminhao)
        //   fallback: se local nao encontrar plano, cai no Hub pra tipos que nao sao caminhao
        const fipeValorCents = Math.round(((fipeManual?.valor ?? fipe?.valor ?? 0) as number) * 100);
        const fipeFmt = fipeManual?.valor_formatado ?? fipe?.valor_formatado ?? "";

        let rawResult;
        if (USE_LOCAL_PRICING || vehicleTypeFinal === "caminhao") {
          // Caminho novo: 100% local, sem SIVIS
          rawResult = await cotarVeiculoLocal({
            tipo: vehicleTypeFinal,
            placa: placaPraHub,
            marca: marcaUsada,
            modelo: modeloUsado,
            anoModelo: anoUsado,
            valorFipeCents: fipeValorCents,
            fipeFormatted: fipeFmt,
            fipeCode: fipeCodeUsado ?? undefined,
            customerName: parsed.data.cliente.nome,
            customerPhone,
          });
          // Fallback: se local nao achou plano E nao eh caminhao, tenta o Hub
          const planoAchado = rawResult.plan?.productId && rawResult.plan.productId !== "sem-plano";
          if (!planoAchado && vehicleTypeFinal !== "caminhao") {
            console.warn("[cotacao] Local nao achou plano, tentando Hub como fallback:", vehicleTypeFinal);
            try {
              rawResult = await quoteFromText({
                brand: marcaUsada, model: modeloUsado, modelYear: anoUsado,
                fuel: (fipeManual?.combustivel ?? fipe?.combustivel ?? v.combustivel) ?? undefined,
                fipeCode: fipeCodeUsado ?? undefined,
                vehicleType: vehicleTypeFinal,
                plate: placaPraHub,
                customerName: parsed.data.cliente.nome,
                customerPhone, leadId: leadIdFinal,
              });
            } catch (hubErr) {
              console.warn("[cotacao] Hub fallback tambem falhou — devolvendo resultado local sem plano");
            }
          }
        } else {
          // Modo legado: Hub como primario (SIVIS)
          rawResult = await quoteFromText({
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
        }

        // Aplica deltas + desconto variável (pct vem do consultor; default 10%) + adesão (default piso por tipo)
        const { result, breakdown, totalDeltaCents, descontoCents, descontoPct, adesaoCents, defaultCodes, coberturasAplicadas } = await aplicarDeltasCoberturas(
          rawResult as unknown as Record<string, unknown>,
          parsed.data.coberturas ?? [],
          vehicleTypeFinal,
          parsed.data.descontoPct,
          parsed.data.adesaoCents,
        );

        if (consultorId) {
          const planObj = (result as { plan?: Record<string, unknown> }).plan ?? {};
          const providerUsed = (rawResult as { provider?: string }).provider ?? "unknown";
          const isLocal = providerUsed.includes("local");
          void registrarInteracaoCRM({
            ownerId: consultorId,
            groupId,
            tipo: "cotacao_rapida",
            nome: parsed.data.cliente.nome,
            telefone: parsed.data.cliente.telefone,
            tracking: parsed.data.tracking ?? null,
            payload: {
              // Fonte de verdade: provider real que calculou (loog-studio-local vs sivis via Hub)
              via: isLocal ? "local-plans" : "hub-from-text",
              provider: providerUsed,
              placa: parsed.data.placa,
              marcaCurta: v.marca, modeloCurto: v.modelo,
              marca: marcaFinal, modelo: modeloFinal, ano: anoModelo,
              cor: v.cor, uf: v.uf, municipio: v.municipio,
              fipeCodigo: fipe?.codigo_fipe ?? null,
              fipeValor: fipe?.valor_formatado ?? null,
              fipeSimilaridade: fipe?.similaridade ?? null,
              tipoVeiculo: vehicleTypeFinal,
              vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
              valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? fipe?.valor_formatado ?? null,
              quoteId: (result as { quoteId?: string }).quoteId ?? null,
              // Snapshot completo do plano aplicado — fica no CRM pra auditoria historica
              planoNome: planObj.name ?? null,
              planoSlug: planObj.productId ?? null,
              planoMensalCents: planObj.monthlyValueCents ?? null,
              planoMensalFormatted: planObj.monthlyValueFormatted ?? null,
              monthlyValueCents: (result as { monthlyValueCents?: number }).monthlyValueCents ?? planObj.monthlyValueCents ?? null,
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

        // Propaga idade e blocked do cotador local pra UI alertar o consultor
        const rawExtra = rawResult as { idade?: unknown; blocked?: unknown };
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
          adesaoCents,
          adesaoPisoCents: pisoAdesao(vehicleTypeFinal),
          idade: rawExtra.idade ?? null,
          blocked: rawExtra.blocked ?? null,
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
      // Hub nao aceita "caminhao" — se o cliente marcou caminhao mas chegamos
      // ate aqui (PlacaFIPE falhou), mandamos sem tipo e o Hub escolhe default.
      // O cotador local de pesados so funciona se PlacaFIPE devolver valor FIPE.
      const vehicleTypeHub = parsed.data.tipo_veiculo === "caminhao" ? undefined : parsed.data.tipo_veiculo;
      const rawResult = await quoteFromPlate({
        plate: placaVariante,
        vehicleType: vehicleTypeHub,
        customerName: parsed.data.cliente.nome,
        customerPhone,
        leadId: leadIdFinal,
      });

      // Aplica deltas + desconto variável (fallback path). "caminhao" nao se
      // beneficia aqui porque o Hub nao calculou plano de caminhao — tratamos como carro
      // pra nao perder a cotacao bruta que veio.
      const tipoFallback = parsed.data.tipo_veiculo && parsed.data.tipo_veiculo !== "caminhao"
        ? parsed.data.tipo_veiculo
        : "carro";
      const { result, breakdown, totalDeltaCents, descontoCents, descontoPct, adesaoCents, defaultCodes, coberturasAplicadas } = await aplicarDeltasCoberturas(
        rawResult as unknown as Record<string, unknown>,
        parsed.data.coberturas ?? [],
        tipoFallback,
        parsed.data.descontoPct,
        parsed.data.adesaoCents,
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
        adesaoCents,
        adesaoPisoCents: pisoAdesao(tipoFallback),
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
      console.error("[cotacao] HubError:", {
        status: err.status, code: err.code, message: err.message,
        placa: parsed.data.placa, payload: err.payload,
      });
      // Mapeia pelo catálogo tipado — source "sivis" e nextAction coerente
      return errResponse(classifyHubError(err, parsed.data.placa));
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cotacao] falha nao-Hub:", msg);
    if (isNetworkError(msg)) return errResponse(errHubOffline());
    return errResponse(errDesconhecido(err));
  }
}
