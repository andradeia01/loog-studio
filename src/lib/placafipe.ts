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
