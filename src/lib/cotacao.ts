import type { VeiculoInfo, FipeMatch } from "./placafipe";

export interface PlanoCotacao {
  nome: string;
  mensalidade: number;
  adesao: number;
  mensalidade_formatada: string;
  adesao_formatada: string;
  destaques: string[];
}

export interface CotacaoResult {
  mes_referencia: string;
  valor_fipe: number;
  valor_fipe_formatado: string;
  categoria: "AUTO" | "MOTO" | "CAMINHAO" | "OUTROS";
  idade_veiculo: number;
  fator_mensal_pct: number;
  base_mensalidade: number;
  planos: PlanoCotacao[];
  observacoes: string[];
}

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function classificar(segmento: string | null | undefined, subSegmento: string | null | undefined): CotacaoResult["categoria"] {
  const s = `${segmento ?? ""} ${subSegmento ?? ""}`.toUpperCase();
  if (/MOTO|SCOOT|CICLOMOT/.test(s)) return "MOTO";
  if (/CAMINH|TRATOR|REBOQ/.test(s)) return "CAMINHAO";
  if (/AUTO|PASS|SEDAN|HATCH|SUV|CAMIONETA|PICK/.test(s)) return "AUTO";
  return "OUTROS";
}

function fatorPorCategoria(cat: CotacaoResult["categoria"]): number {
  switch (cat) {
    case "AUTO": return 0.0115; // 1.15%
    case "MOTO": return 0.0155; // 1.55%
    case "CAMINHAO": return 0.0085; // 0.85%
    default: return 0.0120;
  }
}

function arredondarMensalidade(v: number): number {
  // arredonda para múltiplos de R$ 5 e sempre termina em 9,90 (apelativo)
  const base = Math.max(89, Math.min(980, v));
  const rounded = Math.round(base / 5) * 5;
  // transforma 150 → 149.90, 285 → 289.90, etc
  const dezena = Math.floor(rounded / 10) * 10;
  return dezena + 9.9;
}

export function calcularCotacao(veiculo: VeiculoInfo, fipe: FipeMatch | null): CotacaoResult {
  const categoria = classificar(veiculo.segmento, veiculo.sub_segmento);
  const anoRef = new Date().getFullYear();
  const ano = Number(veiculo.ano_modelo ?? veiculo.ano ?? anoRef) || anoRef;
  const idade = Math.max(0, anoRef - ano);

  const valorFipe = fipe?.valor ?? 0;
  const mesReferencia = fipe?.mes_referencia ?? "não informado";

  const fatorBase = fatorPorCategoria(categoria);
  const fatorIdade = idade > 10 ? Math.min(0.004, (idade - 10) * 0.0004) : 0; // até +0.40%
  const fatorMensal = fatorBase + fatorIdade;

  // sem FIPE: usa mínimo informativo
  const base = valorFipe > 0 ? valorFipe * fatorMensal : 149;
  const essencial = arredondarMensalidade(base);
  const completo = arredondarMensalidade(base * 1.45);
  const premium = arredondarMensalidade(base * 1.85);

  return {
    mes_referencia: mesReferencia,
    valor_fipe: valorFipe,
    valor_fipe_formatado: valorFipe ? BRL(valorFipe) : "não disponível",
    categoria,
    idade_veiculo: idade,
    fator_mensal_pct: fatorMensal * 100,
    base_mensalidade: base,
    planos: [
      {
        nome: "Essencial",
        mensalidade: essencial,
        adesao: 0,
        mensalidade_formatada: BRL(essencial),
        adesao_formatada: "Isenta",
        destaques: [
          "Rastreamento 24h via app LOOG",
          "Cobertura de roubo e furto qualificado",
          "Assistência mecânica no DF e grandes capitais",
          "Chaveiro em caso de perda ou quebra",
        ],
      },
      {
        nome: "Completo",
        mensalidade: completo,
        adesao: 0,
        mensalidade_formatada: BRL(completo),
        adesao_formatada: "Isenta",
        destaques: [
          "Tudo do Essencial +",
          "Carro reserva por até 15 dias",
          "Guincho 500km em todo Brasil",
          "Cobertura de colisão com rateio",
          "Vidros, retrovisores e faróis",
        ],
      },
      {
        nome: "Premium",
        mensalidade: premium,
        adesao: 0,
        mensalidade_formatada: BRL(premium),
        adesao_formatada: "Isenta",
        destaques: [
          "Tudo do Completo +",
          "Guincho ilimitado nacional",
          "Carro reserva 30 dias (categoria idêntica)",
          "Assistência pneu, bateria e combustível",
          "Atendimento prioritário por consultor dedicado",
        ],
      },
    ],
    observacoes: [
      "Valores são estimativas calculadas com base no segmento, idade e valor FIPE do veículo.",
      "Proposta final sujeita à análise de perfil do associado e vistoria prévia.",
      "Rateio mensal pode variar conforme movimentação do grupo de proteção.",
      "LOOG é uma associação de proteção veicular — não é seguradora.",
    ],
  };
}
