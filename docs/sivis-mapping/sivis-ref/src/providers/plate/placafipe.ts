import { DomainError } from '../../lib/errors.js';
import type { PlateLookupProvider, PlateLookupResult } from './types.js';

/**
 * placafipe.com.br adapter.
 *
 * Docs: https://doc.placafipe.com.br
 *
 * Uses the getplacafipe endpoint which returns vehicle data AND a ranked list
 * of FIPE candidates in a single call, so it also fills fipeCode + fipeValueCents
 * on the result — no separate FIPE resolver step needed downstream.
 *
 * Auth: token in the JSON body.
 */
export interface PlaceFipeConfig {
  baseUrl?: string;
  token: string;
  timeoutMs?: number;
}

interface PlaceFipeVehicleInfo {
  marca?: string;
  modelo?: string;
  modelo_lista?: string[];
  ano?: string | number | null;
  ano_modelo?: string | number | null;
  cor?: string | null;
  chassi?: string | null;
  municipio?: string | null;
  uf?: string | null;
  combustivel?: string | null;
  placa?: string;
}

interface PlaceFipeFipeItem {
  similaridade?: string | number;
  correspondencia?: string | number;
  marca?: string;
  modelo?: string;
  ano_modelo?: number;
  codigo_fipe?: string;
  mes_referencia?: string;
  combustivel?: string;
  valor?: string | number;
  unidade_valor?: string;
}

interface PlaceFipeResponse {
  codigo?: number;
  msg?: string;
  placa?: string;
  informacoes_veiculo?: PlaceFipeVehicleInfo;
  fipe?: PlaceFipeFipeItem[];
}

/**
 * FIPE code prefix hints at vehicle category on the Sivisweb FIPE endpoint:
 *   001..799 → cars (tipo=1)
 *   800..899 → motorcycles (tipo=2)
 *   900..999 → trucks/heavy (tipo=3)
 * Returns the most likely tipo first, so callers can try that before cascading.
 */
export function orderedVehicleTypesForFipeCode(fipeCode: string | undefined): number[] {
  if (!fipeCode) return [1, 2, 3];
  const prefix = Number(fipeCode.replace(/[^0-9]/g, '').slice(0, 3));
  if (Number.isFinite(prefix)) {
    if (prefix >= 800 && prefix <= 899) return [2, 1, 3];
    if (prefix >= 900 && prefix <= 999) return [3, 1, 2];
  }
  return [1, 2, 3];
}

function parseSimilarity(v: string | number | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseFipeValueCents(v: string | number | undefined): number | undefined {
  if (v === undefined || v === null) return undefined;
  // API returns e.g. "103548.00" (BRL, dot-decimal). Convert to cents integer.
  const s = typeof v === 'number' ? v.toFixed(2) : String(v).trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 100);
}

function pickYear(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 1900 && n < 2100 ? n : undefined;
}

function inferFuelInitial(fuel: string | undefined): string | undefined {
  if (!fuel) return undefined;
  const f = fuel.toUpperCase();
  if (f.includes('FLEX')) return 'F';
  if (f.includes('GASOLINA') || f === 'GAS') return 'G';
  if (f.includes('DIESEL')) return 'D';
  if (f.includes('ALCOOL') || f.includes('ETANOL')) return 'A';
  if (f.includes('HIBRID')) return 'H';
  if (f.includes('ELETR')) return 'E';
  return undefined;
}

export class PlaceFipePlateLookupProvider implements PlateLookupProvider {
  readonly name = 'placafipe';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: PlaceFipeConfig) {
    this.baseUrl = cfg.baseUrl ?? 'https://api.placafipe.com.br';
    this.timeoutMs = cfg.timeoutMs ?? 15_000;
  }

  async lookupByPlate(plate: string): Promise<PlateLookupResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/getplacafipe`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'LoogSDRHub/1.0',
        },
        body: JSON.stringify({ placa: plate, token: this.cfg.token }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `placafipe request failed: ${(err as Error).message}`,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'placafipe rejected the token (401/403).',
      });
    }
    if (res.status >= 500) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `placafipe ${res.status}`,
        retryable: true,
      });
    }

    let body: PlaceFipeResponse | null = null;
    try {
      body = (await res.json()) as PlaceFipeResponse;
    } catch {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'placafipe returned an unparseable body.',
      });
    }

    // placafipe response codes:
    //   1   = found, FIPE match perfect
    //   22  = found, FIPE match with fuel mismatch warning (still valid data)
    //   499 = vehicle found but no FIPE row for it
    //   4862 = daily quota exceeded (token exhausted)
    //   other = token error, upstream error, or truly not found
    if (!body) return null;

    if (body.codigo === 4862 || /limite\s+di[áa]rio|quota|consultas atingido/i.test(body.msg ?? '')) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `placafipe daily quota exhausted: ${body.msg ?? 'quota exceeded'}`,
        retryable: false,
      });
    }

    const msgLower = String(body.msg ?? '').toLowerCase();
    if (msgLower.includes('token')) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `placafipe token error: ${body.msg ?? 'unknown'}`,
      });
    }

    // Accept codigo=1 (perfect) and codigo=22 (vehicle+FIPE present, just fuel warning).
    // Reject codigo=499 (no FIPE candidate — the FIPE resolver downstream has nothing to work with)
    // and any other unknown code.
    const ACCEPTED_CODES = new Set([1, 22]);
    if (!ACCEPTED_CODES.has(body.codigo ?? -1)) {
      return null;
    }

    const info = body.informacoes_veiculo;
    if (!info) return null;
    const brand = (info.marca ?? '').trim();
    const model = (info.modelo ?? '').trim();
    const modelYear = pickYear(info.ano_modelo) ?? pickYear(info.ano);
    if (!brand || !model || !modelYear) return null;

    // Pick best FIPE candidate by similaridade desc.
    const candidates = Array.isArray(body.fipe) ? [...body.fipe] : [];
    candidates.sort((a, b) => parseSimilarity(b.similaridade) - parseSimilarity(a.similaridade));
    const best = candidates[0];

    const fuel = (info.combustivel ?? best?.combustivel ?? '').toString().trim() || undefined;

    const result: PlateLookupResult = {
      plate,
      brand,
      model,
      modelYear,
      ...(pickYear(info.ano) ? { manufactureYear: pickYear(info.ano)! } : {}),
      ...(fuel ? { fuel } : {}),
      ...(fuel && inferFuelInitial(fuel) ? { fuelInitial: inferFuelInitial(fuel)! } : {}),
      ...(info.cor ? { color: String(info.cor).trim() } : {}),
      ...(info.chassi ? { chassis: String(info.chassi).trim() } : {}),
      ...(info.municipio ? { city: String(info.municipio).trim() } : {}),
      ...(info.uf ? { state: String(info.uf).trim() } : {}),
      ...(best?.codigo_fipe ? { fipeCode: best.codigo_fipe } : {}),
      ...(best?.mes_referencia ? { fipeReferenceMonth: best.mes_referencia } : {}),
      ...(parseFipeValueCents(best?.valor) !== undefined
        ? { fipeValueCents: parseFipeValueCents(best?.valor)! }
        : {}),
      provider: 'placafipe',
      raw: body as unknown as Record<string, unknown>,
    };
    return result;
  }
}
