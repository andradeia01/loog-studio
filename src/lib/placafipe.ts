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
    // mais provável = maior similaridade, desempate pelo maior valor
    const fipe_recomendado =
      fipeArr.slice().sort((a, b) => b.similaridade - a.similaridade || b.valor - a.valor)[0] ?? null;

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
