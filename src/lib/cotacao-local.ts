/**
 * Cotador LOCAL universal — atende todos os tipos: carro, moto, utilitario, eletrico, caminhao.
 *
 * Substitui a dependencia do Hub externo (SIVIS). Query direto na tabela `plans`
 * do Supabase e devolve o mesmo shape de HubQuoteResult pra UI nao precisar
 * saber que a cotacao agora eh local.
 *
 * Regras de match:
 *   1. active=true
 *   2. vehicle_type = tipo da cotacao
 *   3. valor_fipe entre min_fipe_cents e max_fipe_cents (max null = sem teto)
 *   4. year_limit >= idade do veiculo (ou year_limit null = sem limite)
 *   5. Prefere plano com MENOR max_fipe_cents (mais especifico) dentro dos validos
 *   6. Pra caminhao, aplica heuristica de modelo (Cavalo Mecanico, Truck, Van, Implemento)
 */
import { createSupabaseServer } from "@/lib/supabase/server";
import type { HubQuoteResult, HubPlan, HubVehicle } from "@/lib/loog-hub";
import { classificarIdade, verificarBloqueio, tipoParaFipe } from "@/lib/cotacao-rules";

export type VehicleTypeLocal = "carro" | "moto" | "utilitario" | "eletrico" | "caminhao";

export interface PlanoLocal {
  id: string;
  slug: string;
  name: string;
  group_name: string;
  vehicle_type: VehicleTypeLocal;
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
  source: string;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Busca o melhor plano local pra um veiculo.
 * Prefere plano mais especifico (menor max_fipe) e matching por modelo pra caminhao.
 */
export async function buscarPlanoLocal(input: {
  tipo: VehicleTypeLocal;
  valorFipeCents: number;
  anoModelo: number;
  modelo?: string;
}): Promise<PlanoLocal | null> {
  const supabase = await createSupabaseServer();
  const anoAtual = new Date().getFullYear();
  const idade = anoAtual - input.anoModelo;

  const { data, error } = await supabase
    .from("plans")
    .select(
      "id, slug, name, group_name, vehicle_type, vehicle_type_label, min_fipe_cents, max_fipe_cents, monthly_cents, monthly_cents_original, participation_type, participation_value, payment_options, extras, acrescimos, adhesion_service, year_limit, monthly_includes_adhesion, source"
    )
    .eq("active", true)
    .eq("vehicle_type", input.tipo)
    .lte("min_fipe_cents", input.valorFipeCents)
    .order("min_fipe_cents", { ascending: false });

  if (error || !data) return null;

  // Filtra por max_fipe e year_limit
  const validos = data.filter((p) => {
    const max = p.max_fipe_cents ?? Infinity;
    if (input.valorFipeCents > max) return false;
    if (p.year_limit != null && idade > p.year_limit) return false;
    return true;
  });

  if (validos.length === 0) return null;

  // CAMINHAO: heuristica de modelo (varios planos cobrem a mesma faixa)
  if (input.tipo === "caminhao") {
    const modeloUp = (input.modelo ?? "").toUpperCase();
    const preferir = (kw: string) =>
      validos.find((p) => (p.name + " " + p.vehicle_type_label).toUpperCase().includes(kw));

    if (/CAVALO|MECAN|SCANIA\s*R|VOLVO\s*FH|VOLVO\s*FM|AXOR|ACTROS|AROCS|TGX|TGS|CONSTELL|DAF\s*XF|DAF\s*CF/.test(modeloUp)) {
      const p = preferir("CAVALO MEC");
      if (p) return p as PlanoLocal;
    }
    if (/CARRETA|SEMIR|SEMI-?REBOQUE|IMPL|REBOQUE|BITREM|RODOTREM|LIBRELATO|RANDON/.test(modeloUp)) {
      const p = preferir("IMPLEMENTO");
      if (p) return p as PlanoLocal;
    }
    if (/VAN|SPRINTER|DAILY|DUCATO|MASTER|JUMPER|BOXER|TRANSIT|TRAFIC|VIANO|VITO/.test(modeloUp)) {
      const p = preferir("VAN");
      if (p) return p as PlanoLocal;
    }
    if (/TOCO|VUC|URBAN|HR\b|BONGO|ACCELO|TECTOR|K-?2500|HD\s*7\d|HD\s*8\d/.test(modeloUp)) {
      const p = preferir("TOCO");
      if (p) return p as PlanoLocal;
    }
    if (/TRUCK|ATEGO|CARGO|VW\s*\d|VERTIS|EUROCARGO|TRAKKER/.test(modeloUp)) {
      const p = preferir("TRUCK");
      if (p) return p as PlanoLocal;
    }
    // Fallback caminhao: prefere plano com MAIOR min_fipe (mais especifico pra faixa alta)
    return validos[0] as PlanoLocal;
  }

  // LEVE (carro/moto/utilitario/eletrico): prefere o de MENOR max_fipe (faixa mais estreita = mais especifico)
  // Como ja veio ORDER BY min_fipe DESC, o primeiro valido JA eh o mais especifico
  return validos[0] as PlanoLocal;
}

function formatParticipacao(plano: PlanoLocal): string {
  if (plano.participation_type === "percent_bp") {
    return `${(plano.participation_value / 100).toFixed(2).replace(".", ",")}%`;
  }
  return brl(plano.participation_value);
}

function montarMensagemWhats(args: {
  cliente: string;
  marca: string;
  modelo: string;
  ano: number;
  placa: string;
  valorFipe: string;
  tipo: VehicleTypeLocal;
  plano: PlanoLocal | null;
}): string {
  const emoji =
    args.tipo === "moto" ? "🏍️" :
    args.tipo === "caminhao" ? "🚛" :
    args.tipo === "utilitario" ? "🛻" :
    args.tipo === "eletrico" ? "⚡" : "🚗";

  const linhas = [
    `*Cotação LOOG — ${emoji} ${args.tipo === "caminhao" ? "Caminhão / Pesado" : args.tipo.charAt(0).toUpperCase() + args.tipo.slice(1)}*`,
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
      "*Nenhum plano aplicável para esse veículo nessa faixa FIPE / ano.*",
      "Entre em contato com a LOOG para avaliação manual.",
    );
  }
  return linhas.join("\n");
}

/**
 * Monta o resultado da cotacao local no mesmo formato que o Hub devolve.
 * UI nao precisa saber que veio de local — segue mesmo fluxo pra PDF, WhatsApp,
 * coberturas e desconto automatico de 10%.
 */
export async function cotarVeiculoLocal(input: {
  tipo: VehicleTypeLocal;
  placa: string;
  marca: string;
  modelo: string;
  anoModelo: number;
  valorFipeCents: number;
  fipeFormatted: string;
  fipeCode?: string;
  customerName: string;
  customerPhone: string;
}): Promise<HubQuoteResult & {
  blocked?: { tipo: "marca" | "modelo"; marca_nome?: string; modelo_nome?: string; motivo?: string };
  idade?: { status: string; idade: number; mensagem?: string; requerVistoriaEAprovacao: boolean };
}> {
  const vehicleTypeNum =
    input.tipo === "moto" ? 2 :
    input.tipo === "caminhao" ? 3 : 1;
  const vehicleCategory =
    input.tipo === "moto" ? "moto" :
    input.tipo === "caminhao" ? "caminhão" : "carro";

  const vehicle: HubVehicle = {
    plate: input.placa,
    brand: input.marca,
    model: input.modelo,
    modelYear: input.anoModelo,
    fipeCode: input.fipeCode ?? "",
    fipeFormatted: input.fipeFormatted,
    vehicleType: vehicleTypeNum,
    vehicleCategory,
  };

  // 1. CHECK IDADE — rejeita se >25 anos
  const idadeInfo = classificarIdade(input.anoModelo);
  if (idadeInfo.status === "fora-regulamento") {
    return {
      quoteId: `local-rejeitado-idade-${Date.now()}`,
      provider: "loog-studio-local",
      vehicle,
      plan: { productId: "sem-plano", name: "Rejeitado — fora do regulamento (>25 anos)", monthlyValueCents: 0, monthlyValueFormatted: brl(0) },
      whatsappMessage: `❌ Veículo com ${idadeInfo.idade} anos — fora do regulamento LOOG (máximo 25 anos).`,
      idade: idadeInfo,
    };
  }

  // 2. CHECK BLOQUEIO — marca/modelo bloqueado
  const bloqueio = await verificarBloqueio({
    tipo: tipoParaFipe(input.tipo),
    marca: input.marca,
    modelo: input.modelo,
  });
  if (bloqueio.bloqueado) {
    const motivoTxt = bloqueio.motivo ? ` Motivo: ${bloqueio.motivo}.` : "";
    const alvoTxt = bloqueio.tipo === "marca"
      ? `A marca ${bloqueio.marca_nome} está bloqueada pela LOOG.`
      : `O modelo ${bloqueio.marca_nome} ${bloqueio.modelo_nome} está bloqueado pela LOOG.`;
    return {
      quoteId: `local-bloqueado-${Date.now()}`,
      provider: "loog-studio-local",
      vehicle,
      plan: { productId: "sem-plano", name: `🚫 Bloqueado — ${bloqueio.tipo === "marca" ? "marca" : "modelo"}`, monthlyValueCents: 0, monthlyValueFormatted: brl(0) },
      whatsappMessage: `🚫 Cotação não autorizada.\n\n${alvoTxt}${motivoTxt}\n\nEntre em contato com a diretoria se precisar de exceção.`,
      blocked: {
        tipo: bloqueio.tipo!,
        marca_nome: bloqueio.marca_nome,
        modelo_nome: bloqueio.modelo_nome,
        motivo: bloqueio.motivo,
      },
    };
  }

  // 3. Busca plano
  const plano = await buscarPlanoLocal({
    tipo: input.tipo,
    valorFipeCents: input.valorFipeCents,
    anoModelo: input.anoModelo,
    modelo: input.modelo,
  });

  if (!plano) {
    return {
      quoteId: `local-${input.tipo}-${Date.now()}`,
      provider: "loog-studio-local",
      vehicle,
      plan: {
        productId: "sem-plano",
        name: "Nenhum plano aplicável",
        monthlyValueCents: 0,
        monthlyValueFormatted: brl(0),
      },
      whatsappMessage: montarMensagemWhats({
        cliente: input.customerName,
        marca: input.marca, modelo: input.modelo, ano: input.anoModelo,
        placa: input.placa, valorFipe: input.fipeFormatted,
        tipo: input.tipo, plano: null,
      }),
      idade: idadeInfo,
    };
  }

  const planHub: HubPlan = {
    productId: plano.slug,
    name: plano.name,
    monthlyValueCents: plano.monthly_cents,
    monthlyValueFormatted: brl(plano.monthly_cents),
    joinFeeValueCents: 0,
    joinFeeFormatted: brl(0),
    defaultServices: plano.extras
      ? plano.extras.split("|").slice(0, 6).map((s, i) => ({
          id: `svc-${i}`, name: s.trim(), valueFormatted: "incluso",
        }))
      : [],
    defaultCoverages: [],
  };

  // Mensagem WhatsApp inclui aviso humorado + fluxo pra 21-25 anos
  const whatsBase = montarMensagemWhats({
    cliente: input.customerName,
    marca: input.marca, modelo: input.modelo, ano: input.anoModelo,
    placa: input.placa, valorFipe: input.fipeFormatted,
    tipo: input.tipo, plano,
  });
  const whats = idadeInfo.status === "panela-velha"
    ? `${whatsBase}\n\n---\n⚠️ *Veículo com ${idadeInfo.idade} anos:*\nPermitido cotar. Para fechar o contrato é obrigatório:\n1️⃣ Vistoria presencial do veículo\n2️⃣ Aprovação da diretoria/gerência`
    : whatsBase;

  return {
    quoteId: `local-${input.tipo}-${plano.slug}-${Date.now()}`,
    provider: "loog-studio-local",
    vehicle,
    plan: planHub,
    whatsappMessage: whats,
    idade: idadeInfo,
  };
}
