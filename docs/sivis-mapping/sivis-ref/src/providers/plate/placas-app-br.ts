import { DomainError } from '../../lib/errors.js';
import type { PlateLookupProvider, PlateLookupResult } from './types.js';

/**
 * placas.app.br adapter.
 *
 * Auth model: POST /api/v1/authenticate {email, password} → { token: JWT }
 * Plate: POST /api/v1/placas/numero {placa} with Bearer token.
 *
 * The token is a JWT; we decode its `exp` claim to know when to refresh.
 * You can either provide email + password (adapter logs in automatically
 * and refreshes) or a pre-obtained token (no auto-refresh; you rotate manually).
 */
export interface PlacasAppBrConfig {
  baseUrl?: string; // default https://placas.app.br/api/v1
  email?: string;
  password?: string;
  token?: string;
  timeoutMs?: number;
}

interface PlacasResponse {
  placa?: string;
  marca?: string;
  MARCA?: string;
  modelo?: string;
  MODELO?: string;
  ano?: string | number;
  ANO?: string | number;
  anoModelo?: string | number;
  ANO_MODELO?: string | number;
  cor?: string;
  COR?: string;
  chassi?: string;
  CHASSI?: string;
  combustivel?: string;
  COMBUSTIVEL?: string;
  municipio?: string;
  MUNICIPIO?: string;
  uf?: string;
  UF?: string;
  // some APIs wrap it: { data: {...}, error: false }
  data?: PlacasResponse;
  error?: boolean | string;
  message?: string;
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
  if (f.includes('GASOL')) return 'G';
  if (f.includes('DIESEL')) return 'D';
  if (f.includes('ALCOOL') || f.includes('ETANOL')) return 'A';
  if (f.includes('HIBRID')) return 'H';
  if (f.includes('ELETR')) return 'E';
  return undefined;
}

function decodeJwtExp(jwt: string): number | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export class PlacasAppBrPlateLookupProvider implements PlateLookupProvider {
  readonly name = 'placas-app-br';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private cachedToken: string | null;
  private tokenExpiresAt: number;

  constructor(private readonly cfg: PlacasAppBrConfig) {
    this.baseUrl = (cfg.baseUrl ?? 'https://placas.app.br/api/v1').replace(/\/$/, '');
    this.timeoutMs = cfg.timeoutMs ?? 15_000;
    this.cachedToken = cfg.token ?? null;
    this.tokenExpiresAt = cfg.token ? decodeJwtExp(cfg.token) ?? Number.MAX_SAFE_INTEGER : 0;
    if (!cfg.token && !(cfg.email && cfg.password)) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message:
          'placas.app.br requires either PLACAS_APP_BR_TOKEN or PLACAS_APP_BR_EMAIL + PLACAS_APP_BR_PASSWORD.',
      });
    }
  }

  private async login(): Promise<string> {
    if (!this.cfg.email || !this.cfg.password) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'placas.app.br token expired and no email/password to refresh.',
      });
    }
    const res = await fetch(`${this.baseUrl}/authenticate`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'LoogSDRHub/1.0',
      },
      body: JSON.stringify({ email: this.cfg.email, password: this.cfg.password }),
    });
    if (!res.ok) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: `placas.app.br login failed (${res.status}). Check credentials.`,
      });
    }
    const body = (await res.json()) as { token?: string; access_token?: string; jwt?: string; data?: { token?: string } };
    const token = body.token ?? body.access_token ?? body.jwt ?? body.data?.token;
    if (!token) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'placas.app.br login did not return a token.',
      });
    }
    this.cachedToken = token;
    this.tokenExpiresAt = decodeJwtExp(token) ?? Date.now() + 8 * 60 * 60 * 1000;
    return token;
  }

  private async getToken(): Promise<string> {
    if (this.cachedToken && this.tokenExpiresAt > Date.now() + 60_000) return this.cachedToken;
    return this.login();
  }

  async lookupByPlate(plate: string): Promise<PlateLookupResult | null> {
    let token = await this.getToken();
    let attempts = 0;

    while (attempts < 2) {
      attempts += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/placas/numero`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'LoogSDRHub/1.0',
          },
          body: JSON.stringify({ placa: plate }),
          signal: controller.signal,
        });
      } catch (err) {
        throw new DomainError({
          code: 'VEHICLE_PROVIDER_UNAVAILABLE',
          message: `placas.app.br request failed: ${(err as Error).message}`,
          retryable: true,
        });
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 401 || res.status === 403) {
        if (attempts === 1 && this.cfg.email && this.cfg.password) {
          this.cachedToken = null;
          token = await this.login();
          continue;
        }
        throw new DomainError({
          code: 'VEHICLE_PROVIDER_UNAVAILABLE',
          message: 'placas.app.br rejected the credentials.',
        });
      }
      if (res.status === 402) {
        throw new DomainError({
          code: 'VEHICLE_PROVIDER_UNAVAILABLE',
          message: 'placas.app.br: no credits / insufficient balance.',
        });
      }
      if (res.status === 404) return null;
      if (res.status >= 500) {
        throw new DomainError({
          code: 'VEHICLE_PROVIDER_UNAVAILABLE',
          message: `placas.app.br ${res.status}`,
          retryable: true,
        });
      }

      let body: PlacasResponse;
      try {
        body = (await res.json()) as PlacasResponse;
      } catch {
        throw new DomainError({
          code: 'VEHICLE_PROVIDER_UNAVAILABLE',
          message: 'placas.app.br returned an unparseable body.',
        });
      }
      const d = body.data ?? body;
      const brand = (d.marca ?? d.MARCA ?? '').toString().trim();
      const model = (d.modelo ?? d.MODELO ?? '').toString().trim();
      const modelYear =
        pickNumber(d.anoModelo ?? d.ANO_MODELO) ?? pickNumber(d.ano ?? d.ANO);
      if (!brand || !model || !modelYear) return null;
      const fuel = (d.combustivel ?? d.COMBUSTIVEL ?? '').toString().trim() || undefined;
      return {
        plate,
        brand,
        model,
        modelYear,
        ...(pickNumber(d.ano ?? d.ANO) ? { manufactureYear: pickNumber(d.ano ?? d.ANO)! } : {}),
        ...(fuel ? { fuel } : {}),
        ...(fuel && inferFuelInitial(fuel) ? { fuelInitial: inferFuelInitial(fuel)! } : {}),
        ...(d.cor || d.COR ? { color: String(d.cor ?? d.COR).trim() } : {}),
        ...(d.chassi || d.CHASSI ? { chassis: String(d.chassi ?? d.CHASSI).trim() } : {}),
        ...(d.municipio || d.MUNICIPIO
          ? { city: String(d.municipio ?? d.MUNICIPIO).trim() }
          : {}),
        ...(d.uf || d.UF ? { state: String(d.uf ?? d.UF).trim() } : {}),
        provider: 'placas-app-br',
        raw: d as unknown as Record<string, unknown>,
      };
    }
    return null;
  }
}
