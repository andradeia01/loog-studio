/**
 * Monta a mensagem WhatsApp oficial da LOOG no formato "Jhonatan" (modelo
 * aprovado pela diretoria):
 *   - Investimento inicial = adesão + mensalidade
 *   - Valor Total do Plano = mensalidade recorrente
 *   - Lista de benefícios SÓ com nomes (sem valor por cobertura — atrapalha venda)
 *   - Toggles honram o que o consultor desligou na UI
 *
 * Fonte dos valores: cotação real criada no SIVIS via Hub.
 * Fonte da lista de benefícios: fixa por padrão (coberturas da COTA 5.5)
 * mais o que vier do Hub, filtrado pelos toggles do consultor.
 */

export interface CoberturaItem {
  id: string;
  nome: string;
  ligado: boolean;
}

export interface MontarMensagemInput {
  cliente: { nome: string };
  veiculo: {
    placa: string;
    brand: string;
    model: string;
    modelYear: number;
    categoria: string; // "carro" | "moto" | ...
    fipeFormatted: string;
  };
  valores: {
    mensalidadeFormatted: string;
    adesaoFormatted: string;
    investimentoInicialFormatted: string;
  };
  coberturas: CoberturaItem[];
  validadeDias: number;
}

function categoriaLabel(cat: string): string {
  const c = cat.toLowerCase();
  if (c === "moto") return "Moto";
  if (c === "caminhão" || c === "caminhao") return "Caminhão";
  return "Veículo Passeio";
}

/**
 * Linhas de "Proteção Contratada" — sempre presentes no plano base,
 * independente dos toggles de coberturas adicionais.
 */
const PROTECAO_FIXA = [
  "ASSISTÊNCIA 24H EM TODO TERRITÓRIO NACIONAL",
  "Reboque com KM ILIMITADO em casos de colisão e até 300km (150km ida e 150km volta) para pane Mecânica, Elétrica e Falta de Combustível",
];

/**
 * Diferenciais LOOG — fixos.
 * Usamos String.fromCodePoint pra montar os emojis em runtime, garantindo que
 * nenhum passo do build (minifier, transpile, normalização Unicode) corrompa
 * os bytes UTF-8 da string literal.
 */
const X_EMOJI = String.fromCodePoint(0x274C); // ❌
const V_EMOJI = String.fromCodePoint(0x2705); // ✅
const DIFERENCIAIS = [
  `${X_EMOJI} Sem Análise de Perfil;`,
  `${X_EMOJI} Sem Consulta SPC e Serasa;`,
  `${V_EMOJI} Pagamento mensal via Boleto e Cartão de Crédito;`,
  `${V_EMOJI} Pagamento mensal via PIX;`,
  `${V_EMOJI} Proteção *MUITO COMPLETA*`,
];

export function montarMensagemWhats(input: MontarMensagemInput): string {
  const primNome = (input.cliente.nome.trim().split(/\s+/)[0] || "amigo(a)")
    // capitaliza
    .replace(/^(.)/, (c) => c.toUpperCase());

  // Sivisweb/FIPE devolvem a marca com prefixo da sigla ("VW - VolksWagen",
  // "GM - CHEVROLET"), o que ficaria "VW - VolksWagen - Nivus..." no template.
  // Mantemos só a parte depois do " - " quando existir.
  const brandClean = input.veiculo.brand.includes(" - ")
    ? input.veiculo.brand.split(" - ").slice(1).join(" - ").trim()
    : input.veiculo.brand.trim();
  const marcaModelo = `${brandClean} - ${input.veiculo.model}`.trim();
  const adicionaisAtivos = input.coberturas.filter((c) => c.ligado);

  // Monta emojis em runtime via fromCodePoint — imune a corrupção de build.
  //   ✔ + VS16 = ✔️ (check verde emoji, não símbolo texto)
  //   ⚠ + VS16 = ⚠️ (triângulo laranja)
  //   🚗 (passenger car, 2 surrogates)
  const check = String.fromCodePoint(0x2714, 0xFE0F);  // ✔️
  const warn = String.fromCodePoint(0x26A0, 0xFE0F);   // ⚠️
  const car = String.fromCodePoint(0x1F697);           // 🚗

  const linhas: string[] = [
    `*LOOG PROTEÇÃO VEICULAR*`,
    ``,
    `Olá ${primNome}, tudo bem?`,
    ``,
    `${warn} Você está prestes a fazer parte da Melhor Associação de Proteção Veicular do Brasil!`,
    ``,
    `${car} Cotação ${categoriaLabel(input.veiculo.categoria)}`,
    ``,
    `*DADOS DO VEÍCULO*`,
    `Placa: ${input.veiculo.placa}`,
    `Veículo: ${marcaModelo}`,
    `Ano modelo: ${input.veiculo.modelYear}`,
    `Valor FIPE: ${input.veiculo.fipeFormatted}`,
    ``,
    `Investimento inicial: *${input.valores.investimentoInicialFormatted}*`,
    `Valor Mensal do Plano: *${input.valores.mensalidadeFormatted}*`,
    ``,
    `Veja os Benefícios já *inclusos* no seu plano:`,
    ``,
    `*Proteção Contratada*`,
    ...PROTECAO_FIXA.map((p) => `${check} ${p}`),
  ];

  if (adicionaisAtivos.length > 0) {
    linhas.push(``, `*Adicionais Contratados*`);
    for (const c of adicionaisAtivos) {
      linhas.push(`${check} ${c.nome}`);
    }
  }

  linhas.push(
    ``,
    `*DIFERENCIAIS DA LOOG*`,
    ...DIFERENCIAIS,
    ``,
    // Validade padrão LOOG = 24h (urgência de fechamento, não 5 dias).
    // Ignora input.validadeDias e usa texto fixo.
    `Validade da Proposta: 24 HORAS`,
  );

  return linhas.join("\n");
}
