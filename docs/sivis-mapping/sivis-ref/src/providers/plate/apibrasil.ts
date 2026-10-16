import { DomainError } from '../../lib/errors.js';
import type { PlateLookupProvider, PlateLookupResult } from './types.js';

/**
 * APIBrasil vehicle plate adapter.
 *
 * Docs: https://apibrasil.com.br  (endpoint /v2/vehicles/dados)
 *
 * Auth uses two tokens:
 *  - "DeviceToken" (per API/device slug — you get one when you subscribe to
 *    the vehicles product on the APIBrasil dashboard)
 *  - "Authorization: Bearer <userToken>" (per user session)
 *
 * The response shape has changed across APIBrasil versions. This adapter
 * tolerates several common shapes and falls back gracefully. If the shape
 * changes again, edit `parseResponse`.
 */
export interface ApiBrasilConfig {
  baseUrl?: string; // default https://app.apibrasil.io/api/v2
  /** Optional in v2 — some APIBrasil products only require the Bearer. */
  deviceToken?: string;
  bearerToken: string;
  timeoutMs?: number;
}

interface DadosNested {
  MARCA?: string;
  MODELO?: string;
  ANO?: string | number;
  ANO_MODELO?: string | number;
  ANOMODELO?: string | number;
  COR?: string;
  CHASSI?: string;
  COMBUSTIVEL?: string;
  MUNICIPIO?: string;
  UF?: string;
  brand?: string;
  model?: string;
  year?: string | number;
  yearModel?: string | number;
  fuel?: string;
  color?: string;
  chassis?: string;
  city?: string;
  state?: string;
}

interface ApiBrasilPayload {
  error?: boolean | string;
  message?: string;
  response?: DadosNested | { vehicle?: DadosNested; dados?: DadosNested };
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
  if (f.includes('FLEX')) return 'F';
  if (f.includes('GASOLINA') || f === 'GAS') return 'G';
  if (f.includes('DIESEL')) return 'D';
  if (f.includes('ALCOOL') || f.includes('ETANOL')) return 'A';
  if (f.includes('HIBRID')) return 'H';
  if (f.includes('ELETR')) return 'E';
  return undefined;
}

export class ApiBrasilPlateLookupProvider implements PlateLookupProvider {
  readonly name = 'apibrasil';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: ApiBrasilConfig) {
    // Gateway is where APIBrasil's actual product endpoints live.
    // app.apibrasil.io hosts only the dashboard (Next.js site).
    this.baseUrl = cfg.baseUrl ?? 'https://gateway.apibrasil.io/api/v2';
    this.timeoutMs = cfg.timeoutMs ?? 15_000;
  }

  async lookupByPlate(plate: string): Promise<PlateLookupResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.cfg.bearerToken}`,
      'User-Agent': 'LoogSDRHub/1.0',
    };
    if (this.cfg.deviceToken) headers['DeviceToken'] = this.cfg.deviceToken;
    try {
      res = await fetch(`${this.baseUrl}/vehicles/dados`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ placa: plate }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `APIBrasil request failed: ${(err as Error).message}`,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'APIBrasil rejected the credentials (401/403).',
      });
    }
    if (res.status >= 500) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `APIBrasil ${res.status}`,
        retryable: true,
      });
    }

    // Some APIBrasil errors come back as 4xx with a JSON explanation
    // (e.g. "Plano ativo não encontrado" = subscription not active).
    let body: ApiBrasilPayload | null = null;
    try {
      body = (await res.json()) as ApiBrasilPayload;
    } catch {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'APIBrasil returned an unparseable body.',
      });
    }
    if (res.status === 404 || res.status === 400) {
      const msg = String(body?.message ?? '').toLowerCase();
      if (msg.includes('plano') || msg.includes('subscription') || msg.includes('subscri')) {
        throw new DomainError({
          code: 'VEHICLE_PROVIDER_UNAVAILABLE',
          message:
            'APIBrasil: plano de Consulta Veicular não está ativo nesta conta. Ative o produto "Veículos" no painel APIBrasil.',
        });
      }
      // Plate not found in DENATRAN mirror → treat as null (not an error).
      return null;
    }
    if (body.error === true || (typeof body.error === 'string' && body.error !== 'false')) {
      // Message says not found / plate invalid → return null
      const msg = String(body.message ?? '').toLowerCase();
      if (msg.includes('não') || msg.includes('nao') || msg.includes('not found') || msg.includes('inválid')) {
        return null;
      }
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `APIBrasil error: ${body.message ?? 'unknown'}`,
      });
    }
    return this.parseResponse(plate, body);
  }

  private parseResponse(plate: string, body: ApiBrasilPayload): PlateLookupResult | null {
    let d: DadosNested | undefined;
    if (body.response) {
      const r = body.response as DadosNested & { vehicle?: DadosNested; dados?: DadosNested };
      d = r.vehicle ?? r.dados ?? r;
    }
    if (!d) return null;

    const brand = (d.MARCA ?? d.brand ?? '').toString().trim();
    const model = (d.MODELO ?? d.model ?? '').toString().trim();
    const modelYear =
      pickNumber(d.ANO_MODELO ?? d.ANOMODELO ?? d.yearModel) ?? pickNumber(d.ANO ?? d.year);
    if (!brand || !model || !modelYear) return null;

    const fuel = (d.COMBUSTIVEL ?? d.fuel ?? '').toString().trim() || undefined;
    return {
      plate,
      brand,
      model,
      modelYear,
      ...(pickNumber(d.ANO ?? d.year) ? { manufactureYear: pickNumber(d.ANO ?? d.year)! } : {}),
      ...(fuel ? { fuel } : {}),
      ...(fuel && inferFuelInitial(fuel) ? { fuelInitial: inferFuelInitial(fuel)! } : {}),
      ...(d.COR || d.color ? { color: String(d.COR ?? d.color).trim() } : {}),
      ...(d.CHASSI || d.chassis ? { chassis: String(d.CHASSI ?? d.chassis).trim() } : {}),
      ...(d.MUNICIPIO || d.city ? { city: String(d.MUNICIPIO ?? d.city).trim() } : {}),
      ...(d.UF || d.state ? { state: String(d.UF ?? d.state).trim() } : {}),
      provider: 'apibrasil',
      raw: d as unknown as Record<string, unknown>,
    };
  }
}
