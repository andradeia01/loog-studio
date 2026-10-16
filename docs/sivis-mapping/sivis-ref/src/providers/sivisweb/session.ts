import { DomainError } from '../../lib/errors.js';
import { CookieJar } from './cookies.js';
import { makeSivisWebHttpClient, type SivisWebHttpClient } from './http.js';

export interface SivisWebSessionConfig {
  baseUrl: string;
  storeId: string;
  username: string;
  password: string;
  sessionTtlMinutes: number;
}

interface CachedSession {
  http: SivisWebHttpClient;
  expiresAt: number;
  consultorRapido: boolean;
}

/**
 * Manages a single logged-in Sivisweb session, cached in memory with TTL.
 * On expiry (or 401/redirect) we re-login and re-run criarSessaoConsultor.
 */
export class SivisWebSessionManager {
  private cached: CachedSession | null = null;
  private inFlight: Promise<CachedSession> | null = null;

  constructor(private readonly cfg: SivisWebSessionConfig) {}

  private storePath(sub: string): string {
    return `/loja/${this.cfg.storeId}${sub}`;
  }

  async getConsultorSession(): Promise<SivisWebHttpClient> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now && this.cached.consultorRapido) {
      return this.cached.http;
    }
    if (!this.inFlight) {
      this.inFlight = this.buildSession().finally(() => {
        this.inFlight = null;
      });
    }
    const s = await this.inFlight;
    return s.http;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async buildSession(): Promise<CachedSession> {
    const jar = new CookieJar();
    const http = makeSivisWebHttpClient(this.cfg.baseUrl, jar);

    // 1. Login
    const login = await http.request<boolean | string>(this.storePath('/api/portal/usuario'), {
      method: 'POST',
      ajax: true,
      form: {
        functionPage: 'restrictedArea',
        email: this.cfg.username,
        password: this.cfg.password,
      },
    });
    if (login.body !== true) {
      throw new DomainError({
        code: 'QUOTE_LOGIN_FAILED',
        message: 'Sivisweb login failed. Check SIVISWEB_USERNAME/SIVISWEB_PASSWORD.',
        retryable: false,
      });
    }
    if (jar.size() === 0) {
      throw new DomainError({
        code: 'QUOTE_LOGIN_FAILED',
        message: 'Sivisweb login did not return session cookies.',
        retryable: true,
      });
    }

    // 2. Activate session by hitting the dashboard (server-rendered page)
    await http.request(this.storePath('/dashboard'), {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    // 3. Create the consultant session in "rapido" mode (quick quote)
    const create = await http.request<string[] | string>(
      this.storePath('/api/dashboard/funcionario'),
      {
        method: 'POST',
        ajax: true,
        form: { rapido: 1, functionPage: 'criarSessaoConsultor' },
      },
    );
    const created = Array.isArray(create.body) ? create.body[0] === 'ok' : create.body === 'ok';
    if (!created) {
      throw new DomainError({
        code: 'QUOTE_LOGIN_FAILED',
        message: 'Sivisweb criarSessaoConsultor did not return ["ok"].',
        details: { response: create.raw.slice(0, 200) },
      });
    }

    const cached: CachedSession = {
      http,
      expiresAt: Date.now() + this.cfg.sessionTtlMinutes * 60 * 1000,
      consultorRapido: true,
    };
    this.cached = cached;
    return cached;
  }
}
