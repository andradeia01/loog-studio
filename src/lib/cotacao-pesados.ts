/**
 * Cotacao de CAMINHAO (fonte: tabela plans com source='pesados-026').
 *
 * O Hub externo (loog-hub.ts) só aceita 4 tipos: carro/moto/utilitario/eletrico.
 * Pra CAMINHAO, calculamos tudo localmente contra a tabela `plans` que foi
 * populada pela migration 014 (seed da 026-Planos.xlsx com +10% markup).
 *
 * Retorno espelha a shape de HubQuoteResult pro resto do /api/cotacao não
 * precisar saber se veio do Hub ou local.
 */
import { createSupabaseServer } from "@/lib/supabase/server";
import type { HubQuoteResult, HubPlan, HubVehicle } from "@/lib/loog-hub";

export interface PlanoPesado {
  id: string;
  slug: string;
  name: string;
  group_name: string;
  vehicle_type_label: string;
  min_fipe_cents: number;
  max_fipe_cents: number | null;
  monthly_cents: number;
  monthly_cents_original: number | null;
  participation_type: "fixed_cents" | "percent_bp";
  participation_value: number;
  payment_options: string | null;
  extras: string | null;
  acrescimos: string | null;
  adhesion_service: string | null;
  year_limit: number | null;
  monthly_includes_adhesion: boolean;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Busca o melhor plano pesado pra um veiculo.
 *
 * Criterio de match:
 *   1. source='pesados-026' AND active=true
 *   2. valor_fipe entre min_fipe_cents e max_fipe_cents (ou max null = sem teto)
 *   3. year_limit >= idade do veiculo (ou year_limit null)
 *   4. Prefere matches com nome/grupo contendo "CAVALO MECANICO" / "TRUCK" se o
 *      modelo bater (heuristica fraca — se nao bater, cai no primeiro valido)
 *   5. Dentre os validos, ordena por min_fipe_cents DESC pra pegar a cota mais
 *      especifica (ex: faixa 150k-200k em vez de 0-1.2M quando ambos batem)
 */
export async function buscarPlanoPesado(input: {
  valorFipeCents: number;
  anoModelo: number;
  modelo?: string;
}): Promise<PlanoPesado | null> {
  const supabase = await createSupabaseServer();
  const anoAtual = new Date().getFullYear();
  const idade = anoAtual - input.anoModelo;

  const { data, error } = await supabase
    .from("plans")
    .select(
      "id, slug, name, group_name, vehicle_type_label, min_fipe_cents, max_fipe_cents, monthly_cents, monthly_cents_original, participation_type, participation_value, payment_options, extras, acrescimos, adhesion_service, year_limit, monthly_includes_adhesion"
    )
    .eq("source", "pesados-026")
    .eq("active", true)
    .eq("vehicle_type", "caminhao")
    .lte("min_fipe_cents", input.valorFipeCents)
    .order("min_fipe_cents", { ascending: false });

  if (error || !data) return null;

  const candidatos = data.filter((p) => {
    const max = p.max_fipe_cents ?? Infinity;
    if (input.valorFipeCents > max) return false;
    if (p.year_limit != null && idade > p.year_limit) return false;
    return true;
  });

  if (candidatos.length === 0) return null;

  // Heuristica: se modelo bate em "CAVALO MECANICO" prefere linhas CAVALO MECANICO;
  // se "TRUCK" prefere TRUCK; se "IMPLEMENTO/CARRETA" prefere IMPLEMENTO. Senao, 1o valido.
  const modeloUp = (input.modelo ?? "").toUpperCase();
  const preferir = (kw: string) => candidatos.find((p) => (p.name + " " + p.vehicle_type_label).toUpperCase().includes(kw));

  if (/CAVALO|MECAN|CMB|CAM\.?\s*TRATOR/.test(modeloUp)) {
    const p = preferir("CAVALO MEC");
    if (p) return p as PlanoPesado;
  }
  if (/CARRETA|SEMIR|IMPL|REBOQUE|BITREM|RODOTREM/.test(modeloUp)) {
    const p = preferir("IMPLEMENTO");
    if (p) return p as PlanoPesado;
  }
  if (/TRUCK|CARGO|CONSTELL|ATEGO|AXOR|VW\s*\d/.test(modeloUp)) {
    const p = preferir("TRUCK");
    if (p) return p as PlanoPesado;
  }
  if (/VUC|TOCO|URBAN/.test(modeloUp)) {
    const p = preferir("TOCO");
    if (p) return p as PlanoPesado;
  }

  return (candidatos[0] as PlanoPesado) ?? null;
}

/** Formata a participacao do plano pra texto humano. */
function formatParticipacao(plano: PlanoPesado): string {
  if (plano.participation_type === "percent_bp") {
    return `${(plano.participation_value / 100).toFixed(2).replace(".", ",")}%`;
  }
  return brl(plano.participation_value);
}

/**
 * Monta o resultado da cotacao de caminhao no mesmo formato que o Hub devolve
 * pra uma cotacao de carro — assim o /api/cotacao segue o mesmo fluxo (coberturas,
 * desconto, CRM, meta-capi, resposta).
 */
export async function cotarCaminhaoLocal(input: {
  placa: string;
  marca: string;
  modelo: string;
  anoModelo: number;
  valorFipeCents: number;
  fipeFormatted: string;
  fipeCode?: string;
  customerName: string;
  customerPhone: string;
}): Promise<HubQuoteResult> {
  const plano = await buscarPlanoPesado({
    valorFipeCents: input.valorFipeCents,
    anoModelo: input.anoModelo,
    modelo: input.modelo,
  });

  const vehicle: HubVehicle = {
    plate: input.placa,
    brand: input.marca,
    model: input.modelo,
    modelYear: input.anoModelo,
    fipeCode: input.fipeCode ?? "",
    fipeFormatted: input.fipeFormatted,
    vehicleType: 3, // 1=carro, 2=moto, 3=caminhao (padrao FIPE)
    vehicleCategory: "caminhão",
  };

  if (!plano) {
    return {
      quoteId: `local-caminhao-${Date.now()}`,
      provider: "loog-studio-pesados",
      vehicle,
      plan: {
        productId: "sem-plano",
        name: "Nenhum plano aplicável",
        monthlyValueCents: 0,
        monthlyValueFormatted: brl(0),
      },
      whatsappMessage: montarMensagemWhats({
        cliente: input.customerName,
        marca: input.marca,
        modelo: input.modelo,
        ano: input.anoModelo,
        placa: input.placa,
        valorFipe: input.fipeFormatted,
        plano: null,
      }),
    };
  }

  // ADESÃO PESADOS: R$ 1.500,00 mínimo (Luís 27/10/2026 — custo operacional caminhão)
  const ADESAO_PESADOS_CENTS = 150000;
  const planHub: HubPlan = {
    productId: plano.slug,
    name: plano.name,
    monthlyValueCents: plano.monthly_cents,
    monthlyValueFormatted: brl(plano.monthly_cents),
    joinFeeValueCents: ADESAO_PESADOS_CENTS,
    joinFeeFormatted: brl(ADESAO_PESADOS_CENTS),
    defaultServices: plano.extras
      ? plano.extras.split("|").slice(0, 6).map((s, i) => ({
          id: `svc-${i}`,
          name: s.trim(),
          valueFormatted: "incluso",
        }))
      : [],
    defaultCoverages: [],
  };

  return {
    quoteId: `local-caminhao-${plano.slug}-${Date.now()}`,
    provider: "loog-studio-pesados",
    vehicle,
    plan: planHub,
    whatsappMessage: montarMensagemWhats({
      cliente: input.customerName,
      marca: input.marca,
      modelo: input.modelo,
      ano: input.anoModelo,
      placa: input.placa,
      valorFipe: input.fipeFormatted,
      plano,
    }),
  };
}

function montarMensagemWhats(args: {
  cliente: string;
  marca: string;
  modelo: string;
  ano: number;
  placa: string;
  valorFipe: string;
  plano: PlanoPesado | null;
}): string {
  const linhas = [
    `*Cotação LOOG — Caminhão / Pesado*`,
    "",
    `Cliente: ${args.cliente}`,
    `Veículo: ${args.marca} ${args.modelo} ${args.ano}`,
    `Placa: ${args.placa}`,
    `Valor FIPE: ${args.valorFipe}`,
    "",
  ];
  if (args.plano) {
    linhas.push(
      `*Plano:* ${args.plano.name}`,
      `*Mensalidade:* ${brl(args.plano.monthly_cents)}`,
      `*Participação em perda:* ${formatParticipacao(args.plano)}`,
      `*Limite ano fabricação:* até ${args.plano.year_limit ?? "sem limite"} anos`,
    );
    if (args.plano.extras) linhas.push("", `*Benefícios:* ${args.plano.extras.slice(0, 220)}${args.plano.extras.length > 220 ? "..." : ""}`);
  } else {
    linhas.push(
      "*Nenhum plano aplicável para este caminhão nessa faixa FIPE / ano.*",
      "Entre em contato com a LOOG para avaliação manual.",
    );
  }
  return linhas.join("\n");
}
