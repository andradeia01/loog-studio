import { DomainError } from '../../lib/errors.js';
import type { PlateLookupProvider, PlateLookupResult } from './types.js';

/**
 * WDAPI2 vehicle plate adapter (wdapi2.com.br).
 *
 * Pay-per-consultation model (~R$0.20/lookup). Auth uses a single token
 * passed either in the URL path (older format) or as query/body.
 *
 * Common response shape after 2024:
 * {
 *   codigoRetorno: 1,       // 1 = success, 0/-1 = error/not found
 *   MARCA: "FORD",
 *   MODELO: "KA 1.5 SEDAN SE",
 *   ANO: "2021",
 *   anoModelo: "2021",
 *   COR: "PRETA",
 *   chassi: "9BF...",
 *   combustivel: "ALCOOL/GASOLINA",
 *   municipio: "SAO PAULO",
 *   uf: "SP",
 *   extra: { ... }
 * }
 */
export interface Wdapi2Config {
  baseUrl?: string; // default https://wdapi2.com.br
  token: string;
  timeoutMs?: number;
}

interface Wdapi2Payload {
  codigoRetorno?: number | string;
  message?: string;
  MARCA?: string;
  MODELO?: string;
  ANO?: string | number;
  anoModelo?: string | number;
  ANO_MODELO?: string | number;
  COR?: string;
  chassi?: string;
  CHASSI?: string;
  combustivel?: string;
  COMBUSTIVEL?: string;
  municipio?: string;
  MUNICIPIO?: string;
  uf?: string;
  UF?: string;
  extra?: Record<string, unknown>;
  marca?: string;
  modelo?: string;
  ano?: string | number;
}

function pickNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

function inferFuelInitial(fuel: string | undefined): string | undefined {
  if (!fuel) return undefined;
  const f = fuel.toUpperCase();
  if (f.includes('FLEX') || (f.includes('ALCOOL') && f.includes('GASOL'))) return 'F';
  if (f.includes('GASOL') || f === 'GAS') return 'G';
  if (f.includes('DIESEL')) return 'D';
  if (f.includes('ALCOOL') || f.includes('ETANOL')) return 'A';
  if (f.includes('HIBRID')) return 'H';
  if (f.includes('ELETR')) return 'E';
  return undefined;
}

export class Wdapi2PlateLookupProvider implements PlateLookupProvider {
  readonly name = 'wdapi2';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: Wdapi2Config) {
    this.baseUrl = (cfg.baseUrl ?? 'https://wdapi2.com.br').replace(/\/$/, '');
    this.timeoutMs = cfg.timeoutMs ?? 15_000;
  }

  async lookupByPlate(plate: string): Promise<PlateLookupResult | null> {
    // Format expected by WDAPI2: GET /consulta/{plate}/{token}
    const url = `${this.baseUrl}/consulta/${encodeURIComponent(plate)}/${encodeURIComponent(this.cfg.token)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'LoogSDRHub/1.0',
        },
        signal: controller.signal,
      });
    } catch (err) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `WDAPI2 request failed: ${(err as Error).message}`,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'WDAPI2 rejected the token (401/403).',
      });
    }
    if (res.status === 402) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'WDAPI2: no credits / insufficient balance.',
      });
    }
    if (res.status >= 500) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `WDAPI2 ${res.status}`,
        retryable: true,
      });
    }
    if (res.status === 404) return null;

    let body: Wdapi2Payload;
    try {
      body = (await res.json()) as Wdapi2Payload;
    } catch {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'WDAPI2 returned an unparseable body.',
      });
    }

    const code = body.codigoRetorno;
    if (code !== undefined && (code === 0 || code === '0' || code === -1 || code === '-1')) {
      const msg = String(body.message ?? '').toLowerCase();
      if (msg.includes('credito') || msg.includes('saldo') || msg.includes('balanc')) {
        throw new DomainError({
          code: 'VEHICLE_PROVIDER_UNAVAILABLE',
          message: 'WDAPI2: no credits / insufficient balance.',
        });
      }
      return null;
    }

    const brand = (body.MARCA ?? body.marca ?? '').toString().trim();
    const model = (body.MODELO ?? body.modelo ?? '').toString().trim();
    const modelYear =
      pickNumber(body.anoModelo ?? body.ANO_MODELO) ?? pickNumber(body.ANO ?? body.ano);
    if (!brand || !model || !modelYear) return null;

    const fuel = (body.combustivel ?? body.COMBUSTIVEL ?? '').toString().trim() || undefined;
    return {
      plate,
      brand,
      model,
      modelYear,
      ...(pickNumber(body.ANO ?? body.ano) ? { manufactureYear: pickNumber(body.ANO ?? body.ano)! } : {}),
      ...(fuel ? { fuel } : {}),
      ...(fuel && inferFuelInitial(fuel) ? { fuelInitial: inferFuelInitial(fuel)! } : {}),
      ...(body.COR ? { color: String(body.COR).trim() } : {}),
      ...(body.chassi || body.CHASSI ? { chassis: String(body.chassi ?? body.CHASSI).trim() } : {}),
      ...(body.municipio || body.MUNICIPIO
        ? { city: String(body.municipio ?? body.MUNICIPIO).trim() }
        : {}),
      ...(body.uf || body.UF ? { state: String(body.uf ?? body.UF).trim() } : {}),
      provider: 'wdapi2',
      raw: body as unknown as Record<string, unknown>,
    };
  }
}
