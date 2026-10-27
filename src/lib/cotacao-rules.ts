/**
 * Regras de negocio da cotacao LOOG — centralizadas pra reuso em local e Hub.
 *
 * - Bloqueio por marca/modelo (consulta vehicle_blocks)
 * - Regra de idade: ate 20 anos OK, 21-25 "panela velha", acima rejeita
 * - Mensagens humoradas pra consultor em veiculos 21-25
 */
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Normaliza nome pra matching (strip accents, lowercase, so alnum).
 * "VW - VOLKSWAGEN" -> "vwvolkswagen"
 * "Volkswagen"      -> "volkswagen"
 * Pra bater os dois: comparamos includes de um no outro.
 */
export function normalizar(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Normaliza marca da PlacaFIPE/FIPE (ex "GM - CHEVROLET" vira "chevrolet") */
export function marcaBase(s: string | null | undefined): string {
  const parts = (s ?? "").split(/[-\/|]/);
  // Pega a parte MAIOR (geralmente o nome real da marca, nao a sigla)
  return normalizar(parts.sort((a, b) => b.length - a.length)[0] ?? "");
}

export type TipoFipe = "carros" | "motos" | "caminhoes";

/** Converte vehicle_type do cotador -> tipo FIPE do catalogo */
export function tipoParaFipe(vehicleType: string): TipoFipe {
  if (vehicleType === "moto") return "motos";
  if (vehicleType === "caminhao") return "caminhoes";
  // carro, utilitario, eletrico -> carros no FIPE
  return "carros";
}

export interface BlockCheck {
  bloqueado: boolean;
  tipo: "marca" | "modelo" | null;
  marca_nome?: string;
  modelo_nome?: string;
  motivo?: string;
}

/**
 * Verifica se marca/modelo esta bloqueado.
 * Faz matching fuzzy por nome normalizado — comparando com cada bloqueio ativo.
 */
export async function verificarBloqueio(input: {
  tipo: TipoFipe;
  marca: string;
  modelo: string;
}): Promise<BlockCheck> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("vehicle_blocks")
    .select("marca_codigo, marca_nome, modelo_codigo, modelo_nome, motivo, allowed_model_codes, allowed_model_names")
    .eq("tipo", input.tipo)
    .eq("ativo", true);

  if (!data || data.length === 0) return { bloqueado: false, tipo: null };

  const marcaIn = marcaBase(input.marca);
  const modeloIn = normalizar(input.modelo);

  for (const b of data) {
    const marcaB = marcaBase(b.marca_nome as string);
    // Match de marca: um contem o outro (acomoda "chevrolet" vs "gmchevrolet")
    const marcaBate = marcaIn && marcaB && (marcaIn.includes(marcaB) || marcaB.includes(marcaIn));
    if (!marcaBate) continue;

    // Bloqueio de marca inteira — mas verifica EXCEÇÕES (allowed_model_names)
    if (!b.modelo_codigo) {
      const liberados = (b.allowed_model_names ?? []) as string[];
      if (liberados.length > 0 && modeloIn) {
        const estaLiberado = liberados.some((nome) => {
          const n = normalizar(nome);
          return n && (modeloIn.includes(n) || n.includes(modeloIn));
        });
        if (estaLiberado) continue; // modelo e excecao — pula pro proximo bloqueio
      }
      return {
        bloqueado: true, tipo: "marca",
        marca_nome: b.marca_nome as string,
        motivo: b.motivo as string | undefined,
      };
    }
    // Bloqueio de modelo especifico
    const modeloB = normalizar(b.modelo_nome as string);
    if (modeloIn && modeloB && (modeloIn.includes(modeloB) || modeloB.includes(modeloIn))) {
      return {
        bloqueado: true, tipo: "modelo",
        marca_nome: b.marca_nome as string,
        modelo_nome: b.modelo_nome as string,
        motivo: b.motivo as string | undefined,
      };
    }
  }
  return { bloqueado: false, tipo: null };
}

// ============================================================
// Regra de idade — ate 20 OK, 21-25 "panela velha", >25 rejeita
// ============================================================

export const IDADE_OK_LIMITE = 20;
export const IDADE_PANELA_VELHA_LIMITE = 25;

export type IdadeStatus = "ok" | "panela-velha" | "fora-regulamento";

/** Mensagens humoradas pra consultor que cota veiculo 21-25 anos. */
const PANELA_VELHA_MSGS = [
  "🍲 Panela velha é que faz comida boa — mas essa cotação precisa de vistoria + aprovação da diretoria antes de fechar.",
  "🧓 Veículo com cara de patriarca! Pode cotar sim, mas pra fechar: vistoria presencial + ok da gerência.",
  "🕰️ Clássico do mercado! Lembre: até fechar, precisa passar na vistoria e ter sinal verde da diretoria.",
  "📜 Esse aí já viu muita história. Cota agora, mas o fechamento depende de vistoria e aprovação da gerência.",
  "🎖️ Veterano no asfalto! Pode cotar, mas o cliente precisa aceitar vistoria presencial + aval da diretoria.",
  "🪵 Madeira de lei! Esses envelhecem bem — só não esquece: vistoria + aprovação antes de fechar.",
  "🎸 Rock dos velhos tempos! Cotação liberada, mas pra assinar o contrato precisa de vistoria + ok gerência.",
  "⚙️ Mecânica de guerra! Pode mostrar o valor pro cliente, mas fechamento SÓ depois de vistoria + aprovação.",
  "🏛️ Patrimônio histórico sobre rodas! Cota liberada, só não fecha sem vistoria presencial + diretoria dizendo sim.",
  "🚂 Que relíquia bonita! Dá sim pra cotar — mas o OK final vem só com vistoria + aprovação da gerência.",
];

export function mensagemPanelaVelha(): string {
  return PANELA_VELHA_MSGS[Math.floor(Math.random() * PANELA_VELHA_MSGS.length)];
}

export function classificarIdade(anoModelo: number, anoAtual: number = new Date().getFullYear()): {
  status: IdadeStatus;
  idade: number;
  mensagem?: string;
  requerVistoriaEAprovacao: boolean;
} {
  const idade = anoAtual - anoModelo;
  if (idade <= IDADE_OK_LIMITE) {
    return { status: "ok", idade, requerVistoriaEAprovacao: false };
  }
  if (idade <= IDADE_PANELA_VELHA_LIMITE) {
    return {
      status: "panela-velha", idade,
      mensagem: mensagemPanelaVelha(),
      requerVistoriaEAprovacao: true,
    };
  }
  return {
    status: "fora-regulamento", idade,
    mensagem: `🛑 Veículo com ${idade} anos — fora do regulamento LOOG (máximo 25 anos). Não cotamos.`,
    requerVistoriaEAprovacao: false,
  };
}
