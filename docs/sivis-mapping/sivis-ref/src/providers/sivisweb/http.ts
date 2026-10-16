import { DomainError } from '../../lib/errors.js';
import type { CookieJar } from './cookies.js';

export interface SivisWebHttpOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined>;
  form?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  ajax?: boolean;
  timeoutMs?: number;
  expectStatuses?: number[];
}

/**
 * Sivisweb responds to XHR endpoints with JSON but Content-Type: text/html.
 * We parse regardless of content-type.
 */
export function parseSivisWebBody(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export interface SivisWebHttpClient {
  baseUrl: string;
  jar: CookieJar;
  request<T = unknown>(
    path: string,
    options?: SivisWebHttpOptions,
  ): Promise<{ status: number; body: T; raw: string }>;
}

export function makeSivisWebHttpClient(baseUrl: string, jar: CookieJar): SivisWebHttpClient {
  const call = async <T = unknown>(
    path: string,
    options: SivisWebHttpOptions = {},
  ): Promise<{ status: number; body: T; raw: string }> => {
    const method = options.method ?? 'GET';
    const url = new URL(path, baseUrl);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      // Impersonate a real Chrome browser — Sivisweb enabled Cloudflare bot
      // challenge on sivisweb.com.br FIPE endpoints and blocks unknown UAs.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      // Referer/Origin help Cloudflare accept the request as coming from the operator's portal session.
      Referer: 'https://portal.sivisweb.com.br/loja/028/cliente',
      Origin: 'https://portal.sivisweb.com.br',
      ...options.headers,
    };
    if (options.ajax) headers['X-Requested-With'] = 'XMLHttpRequest';

    let body: string | undefined;
    if (options.form) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(options.form)) {
        if (v === undefined || v === null) continue;
        params.append(k, String(v));
      }
      body = params.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }

    const cookie = jar.header();
    if (cookie) headers['Cookie'] = cookie;

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 15_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers,
        ...(body !== undefined ? { body } : {}),
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err) {
      throw new DomainError({
        code: 'QUOTE_PROVIDER_UNAVAILABLE',
        message: `Sivisweb request failed (${(err as Error).name}: ${(err as Error).message}).`,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }

    jar.ingest(res);
    const raw = await res.text();

    const expected = options.expectStatuses ?? [200];
    if (!expected.includes(res.status)) {
      // 404 on plate lookup is a normal miss; we throw NOT_FOUND-style at caller
      if (res.status === 404) {
        return { status: 404, body: null as T, raw };
      }
      throw new DomainError({
        code: 'QUOTE_PROVIDER_UNAVAILABLE',
        message: `Sivisweb returned unexpected status ${res.status} for ${method} ${path}`,
        retryable: res.status >= 500,
      });
    }

    return { status: res.status, body: parseSivisWebBody(raw) as T, raw };
  };

  return { baseUrl, jar, request: call };
}
