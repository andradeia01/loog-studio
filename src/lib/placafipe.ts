import { getSetting } from "./admin-settings";

const UPSTREAM = "https://api.placafipe.com.br/getplacafipe";

export interface VeiculoInfo {
  placa: string;
  placa_alternativa: string | null;
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  ano_modelo: string | null;
  cor: string | null;
  chassi: string | null;
  municipio: string | null;
  uf: string | null;
  segmento: string | null;
  sub_segmento: string | null;
  cilindradas: string | null;
  potencia: string | null;
  combustivel: string | null;
}

export interface FipeMatch {
  marca: string;
  modelo: string;
  ano_modelo: number;
  codigo_fipe: string;
  mes_referencia: string;
  combustivel: string;
  valor: number;
  valor_formatado: string;
  similaridade: number;
}

export interface PlacaFipeResult {
  ok: true;
  placa: string;
  veiculo: VeiculoInfo;
  fipe: FipeMatch[];
  fipe_recomendado: FipeMatch | null;
  /** true quando o match é duvidoso (score < 75 ou transmissão/carroceria conflitante). UI deve pedir confirmação. */
  low_confidence?: boolean;
  /** Top 3 alternativas pro consultor escolher quando low_confidence. */
  fipe_alternatives?: FipeMatch[];
  upstream_ms: number | null;
  aviso?: string;
}

export interface PlacaFipeError {
  ok: false;
  status: number;
  error: string;
  message: string;
}

export function cleanPlaca(raw: string): string | null {
  const only = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (only.length !== 7) return null;
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(only)) return null;
  return only;
}

/**
 * Converte placa Mercosul ↔ placa antiga.
 *
 * Padrão Mercosul: `AAA1A11` (4ª=dígito, 5ª=letra, 6ª-7ª=dígitos)
 * Padrão antigo:   `AAA1111` (4ª-7ª todos dígitos)
 *
 * A conversão SPTrans/Denatran mapeia a 5ª letra ↔ dígito:
 *   A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9
 *
 * Ex.: KZL7A83 (Mercosul) ↔ KZL7083 (antiga)
 *      ABC1D23 (Mercosul) ↔ ABC1323 (antiga)
 *
 * Retorna null se a placa não puder ser convertida (formato inválido ou
 * caractere fora do mapa).
 */
const LETRA_PARA_DIGITO: Record<string, string> = {
  A: "0", B: "1", C: "2", D: "3", E: "4",
  F: "5", G: "6", H: "7", I: "8", J: "9",
};
const DIGITO_PARA_LETRA: Record<string, string> = Object.fromEntries(
  Object.entries(LETRA_PARA_DIGITO).map(([l, d]) => [d, l]),
);

export function isMercosul(placa: string): boolean {
  // AAA1A11
  return /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(placa);
}
export function isPlacaAntiga(placa: string): boolean {
  // AAA1111
  return /^[A-Z]{3}[0-9]{4}$/.test(placa);
}

/** Mercosul → antiga. Retorna null se não for Mercosul válido. */
export function mercosulParaAntiga(placa: string): string | null {
  const p = (placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!isMercosul(p)) return null;
  const letra5 = p[4];
  const digito = LETRA_PARA_DIGITO[letra5];
  if (!digito) return null;
  return p.slice(0, 4) + digito + p.slice(5);
}

/** Antiga → Mercosul. Retorna null se não for antiga válida. */
export function antigaParaMercosul(placa: string): string | null {
  const p = (placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!isPlacaAntiga(p)) return null;
  const digito5 = p[4];
  const letra = DIGITO_PARA_LETRA[digito5];
  if (!letra) return null;
  return p.slice(0, 4) + letra + p.slice(5);
}

/**
 * Infere o tipo de veículo (SIVIS/LOOG) a partir do segmento + combustível da PlacaFIPE.
 *
 * SIVIS trabalha com 4 tipos distintos:
 *   - carro       (automóvel comum, flex/gasolina/álcool)
 *   - moto        (motocicleta/triciclo/ciclomotor)
 *   - utilitario  (caminhonete, caminhão, utilitário Diesel — tabela de plano diferente)
 *   - eletrico    (veículos 100% elétricos — tabela separada, prêmio diferente)
 *
 * Prioridade: motocicleta sempre vem primeiro no segmento; elétrico detecta via
 * combustível (campo cilindradas=0 também é bom sinal mas nem sempre vem); diesel/
 * utilitário via segmento + sub_segmento.
 *
 * Retorna null se não conseguir inferir (consultor confirma manualmente).
 */
/**
 * Modelos famosos de pickup/van/furgão/caminhão leve que a SIVIS cobra na tabela
 * "utilitario" (prêmio diferente). Checagem é feita contra o texto completo do modelo
 * em uppercase, com word boundary, pra não casar "RAM" em "RAMONA".
 */
const UTILITARIO_MODELS = [
  // Pickup leve/média
  "HILUX", "STRADA", "SAVEIRO", "MONTANA", "OROCH", "RANGER", "AMAROK",
  "FRONTIER", "DAKOTA", "COURIER", "L200", "TRITON", "TORO", "MARUTI",
  "RAM", "F-?250", "F-?350", "F-?1000", "F-?4000",
  // SIVIS/LOOG também trata S10 como pickup
  "S-?10", "SILVERADO", "D-?20", "D-?10", "CHEYENNE", "D-?MAX",
  // Pickup pesada/comercial
  "BONGO", "HR\\b", "K-?2500", "ACCELO", "ATEGO", "AXOR", "ATRON", "VW\\s*\\d+",
  // Van / Furgão / Micro-ônibus leve
  "MASTER", "DUCATO", "SCUDO", "BOXER", "SPRINTER", "DAILY", "TRAFIC", "JUMPY",
  "JUMPER", "KANGOO", "PARTNER", "BERLINGO", "DOBLO", "DOBL[ÒÓO]", "FIORINO",
  "COMBI", "TRANSIT", "EXPRESS", "VITO", "VIANO", "H100", "H1\\b", "STARIA",
  "EXPERT", "TOURAN\\s*CARGO", "CARGO\\s*BUS", "CITRINE",
  // Caminhões / Caminhonetes identificadas pelo sufixo
  "CARGO", "FURG[AÃ]O", "CHASSI", "TB\\s*DIESEL",
];
const UTILITARIO_RE = new RegExp("\\b(" + UTILITARIO_MODELS.join("|") + ")\\b", "i");

export function inferirTipoVeiculo(input: {
  segmento?: string | null;
  sub_segmento?: string | null;
  combustivel?: string | null;
  modelo?: string | null;
}): "carro" | "moto" | "utilitario" | "eletrico" | null {
  const seg = (input.segmento ?? "").toLowerCase();
  const sub = (input.sub_segmento ?? "").toLowerCase();
  const comb = (input.combustivel ?? "").toLowerCase();
  const modelo = (input.modelo ?? "").toUpperCase();

  // Elétrico (precedência sobre tipo)
  if (/el[eé]tric|battery|ev\b|bev\b/.test(comb)) return "eletrico";

  // Moto
  if (/motoci|motocicleta|moto|triciclo|ciclomoto|scooter/.test(seg + " " + sub)) return "moto";

  // Utilitário por segmento (vai ser raro — PlacaFIPE devolve segmento="AUTOMOVEL" na maioria)
  if (/caminh|utilit[aá]r|van\b|furg[aã]o|pick[-\s]?up|caminhonete/.test(seg + " " + sub)) return "utilitario";
  // Utilitário por combustível (DIESEL sempre vai pra tabela utilitário na SIVIS)
  if (/diesel/.test(comb)) return "utilitario";
  // Utilitário por MODELO — captura Bongo, Master, Hilux, Strada, Toro etc
  // mesmo quando segmento vem genérico e combustível não foi informado
  if (modelo && UTILITARIO_RE.test(modelo)) return "utilitario";

  // Automóvel = carro
  if (/autom[oó]v|carro|sed[aã]|hatch|suv|cup[eê]/.test(seg + " " + sub)) return "carro";

  return null;
}

/** Retorna [placa_original, placa_equivalente] se existir equivalência. */
export function variantesPlaca(placa: string): string[] {
  const p = (placa || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const set = new Set<string>([p]);
  const alt1 = mercosulParaAntiga(p); if (alt1) set.add(alt1);
  const alt2 = antigaParaMercosul(p); if (alt2) set.add(alt2);
  return [...set];
}

export async function resolvePlacaFipeToken(): Promise<string | null> {
  const env = process.env.PLACAFIPE_TOKEN;
  if (env && env.trim()) return env.trim();
  const row = await getSetting<{ placafipe?: string }>("api_keys");
  return row?.placafipe?.trim() || null;
}

function parseValor(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return 0;
  const s = raw.trim();
  // formato BR "30.761,00" → tem vírgula como decimal
  if (s.includes(",")) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  // formato US "30761.00" (upstream da PlacaFipe) → ponto como decimal
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Classifica a transmissão de uma descrição de veículo.
 * Detecta variações comuns no PlacaFIPE/SIVIS:
 *   AUT, AT, CVT, DCT, DSG, DUAL CLUTCH, AUTOMATICO → AUTO
 *   MT, MEC, MANUAL, MECANICO → MANUAL
 *   caso contrário, null (não é discriminador seguro)
 */
function detectTransmission(s: string | null | undefined): "AUTO" | "MANUAL" | null {
  const u = String(s ?? "").toUpperCase();
  // Precisa de palavra separada pra evitar falsos positivos (ex: "FLAT" não é AT)
  if (/\b(AUT|AT|CVT|DCT|DSG|AUTOM[AÁ]TIC\w*)\b/.test(u)) return "AUTO";
  if (/\b(MT|MEC|MANUAL|MEC[AÂ]NIC\w*)\b/.test(u)) return "MANUAL";
  return null;
}

/** Classifica carroceria: HB (Hatch), SW (Station Wagon), SD (Sedan), SUV, PICKUP. */
function detectBody(s: string | null | undefined): string | null {
  const u = String(s ?? "").toUpperCase();
  if (/\b(SW|STATION|PERUA)\b/.test(u)) return "SW";
  if (/\b(HB|HATCH\w*)\b/.test(u)) return "HATCH";
  if (/\b(SD|SEDAN)\b/.test(u)) return "SEDAN";
  if (/\bSUV\b/.test(u)) return "SUV";
  if (/\b(PICKUP|PICK[-\s]UP|CAMINH\w*)\b/.test(u)) return "PICKUP";
  return null;
}

interface ScoredFipe { match: FipeMatch; score: number; }

/**
 * Escolhe o melhor match FIPE priorizando semântica em cima da similaridade crua da API.
 * Score composto:
 *   similaridade (0-100) +
 *   match de ano_modelo (+30 se exato) +
 *   match de transmissão (+20 se bate, -50 se conflita) +
 *   match de carroceria (+15 se bate, -30 se conflita)
 */
function escolherMelhorFipe(
  fipeArr: FipeMatch[],
  veiculo: { ano_modelo?: string | null; modelo?: string | null; combustivel?: string | null },
): { recomendado: FipeMatch | null; low_confidence: boolean; top3: FipeMatch[] } {
  if (fipeArr.length === 0) return { recomendado: null, low_confidence: false, top3: [] };

  const anoAlvo = Number(veiculo.ano_modelo ?? 0) || null;
  const transmAlvo = detectTransmission(veiculo.modelo);
  const bodyAlvo = detectBody(veiculo.modelo);
  const combAlvo = String(veiculo.combustivel ?? "").toUpperCase();

  const scored: ScoredFipe[] = fipeArr.map((f) => {
    let score = Number(f.similaridade) || 0;

    // Ano
    if (anoAlvo && f.ano_modelo === anoAlvo) score += 30;
    else if (anoAlvo && Math.abs(f.ano_modelo - anoAlvo) === 1) score += 10;
    else if (anoAlvo && Math.abs(f.ano_modelo - anoAlvo) > 3) score -= 10;

    // Transmissão
    const t = detectTransmission(f.modelo);
    if (transmAlvo && t) {
      if (t === transmAlvo) score += 20;
      else score -= 50; // conflito direto é motivo forte pra descartar
    }

    // Carroceria
    const b = detectBody(f.modelo);
    if (bodyAlvo && b) {
      if (b === bodyAlvo) score += 15;
      else score -= 30;
    }

    // Combustível (bate se contém o mesmo radical, ex: FLEX, DIESEL, GASOLINA)
    if (combAlvo && f.combustivel) {
      const c = f.combustivel.toUpperCase();
      if (combAlvo.includes("DIESEL") && c.includes("DIESEL")) score += 10;
      else if (combAlvo.includes("FLEX") && c.includes("FLEX")) score += 10;
      else if (combAlvo.includes("DIESEL") && !c.includes("DIESEL")) score -= 15;
    }

    return { match: f, score };
  });

  scored.sort((a, b) => b.score - a.score || b.match.valor - a.match.valor);
  const top = scored[0]?.match ?? null;
  // Low confidence: score baixo OU segundo colocado muito próximo (ambíguo)
  const low_confidence =
    (scored[0]?.score ?? 0) < 75
    || (scored.length > 1 && (scored[0].score - scored[1].score) < 10);
  const top3 = scored.slice(0, 3).map((s) => s.match);
  return { recomendado: top, low_confidence, top3 };
}

export async function consultarPlaca(placaRaw: string): Promise<PlacaFipeResult | PlacaFipeError> {
  const placa = cleanPlaca(placaRaw);
  if (!placa) return { ok: false, status: 400, error: "placa_invalida", message: "Formato inválido. Use ABC1D23 ou ABC1234." };

  const token = await resolvePlacaFipeToken();
  if (!token) return { ok: false, status: 500, error: "token_ausente", message: "Token PlacaFipe não configurado." };

  try {
    const up = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token, placa }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const payload = await up.json().catch(() => null);
    if (!payload) {
      return { ok: false, status: 502, error: "upstream_invalido", message: "Resposta inválida do upstream." };
    }
    // codigo 1 = ok; 22 = parcial (combustível diferente); 499 = fipe não encontrada mas veículo sim
    const codigo = payload.codigo;
    const info = payload.informacoes_veiculo;
    if (!info) {
      return { ok: false, status: 404, error: "nao_encontrado", message: payload.msg ?? "Veículo não encontrado." };
    }
    const fipeArr: FipeMatch[] = Array.isArray(payload.fipe)
      ? payload.fipe.map((f: Record<string, unknown>) => {
          const valor = parseValor(f.valor);
          return {
            marca: String(f.marca ?? ""),
            modelo: String(f.modelo ?? ""),
            ano_modelo: Number(f.ano_modelo ?? 0),
            codigo_fipe: String(f.codigo_fipe ?? ""),
            mes_referencia: String(f.mes_referencia ?? ""),
            combustivel: String(f.combustivel ?? ""),
            valor,
            valor_formatado: formatBRL(valor),
            similaridade: Number(f.similaridade ?? 0),
          };
        })
      : [];
    // Scoring semântico: ano + transmissão + carroceria + combustível em cima da similaridade.
    // Evita o bug do "desempate pelo maior valor" que puxava versões AUT quando o veículo
    // era manual, ou SW quando era HB.
    const { recomendado: fipe_recomendado, low_confidence, top3 } = escolherMelhorFipe(fipeArr, {
      ano_modelo: info.ano_modelo,
      modelo: info.modelo,
      combustivel: info.combustivel,
    });

    return {
      ok: true,
      placa,
      veiculo: {
        placa: String(info.placa ?? placa),
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
      },
      fipe: fipeArr,
      fipe_recomendado,
      low_confidence,
      fipe_alternatives: top3,
      upstream_ms: typeof payload.tempo === "number" ? payload.tempo : null,
      aviso: codigo !== 1 && codigo !== 22 ? payload.msg : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout|AbortError/i.test(msg);
    return {
      ok: false,
      status: 504,
      error: isTimeout ? "timeout" : "falha",
      message: isTimeout ? "A consulta demorou demais. Tente novamente." : msg,
    };
  }
}
