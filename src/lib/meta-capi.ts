import crypto from "crypto";

/**
 * Meta Conversions API (CAPI) — eventos de conversão SERVER-SIDE.
 *
 * Complementa o pixel browser: envia eventos autenticados direto pro Meta,
 * funciona mesmo com ad-blockers/Safari ITP e tem melhor atribuição.
 *
 * Deduplicação com o pixel browser: ambos disparam o MESMO evento com o
 * MESMO event_id → Meta deduplica. Logo:
 *   - Server dispara CAPI com event_id = X
 *   - Browser dispara fbq('track', 'Lead', {...}, {eventID: X})
 *   - Meta recebe os 2 e conta como 1
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const CAPI_TOKEN = process.env.META_CAPI_TOKEN;
const META_API_VERSION = "v23.0";

export type MetaEventName =
  | "PageView" | "Lead" | "CompleteRegistration" | "SubmitApplication"
  | "InitiateCheckout" | "Purchase" | "ViewContent" | "Contact";

export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null; // ex: "br"
  externalId?: string | null;
  fbp?: string | null;    // cookie _fbp
  fbc?: string | null;    // cookie _fbc
  clientIp?: string | null;
  userAgent?: string | null;
}

export interface MetaCustomData {
  value?: number;
  currency?: string; // ex: "BRL"
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
}

/** SHA-256 hex do valor normalizado (lowercase, trim). Meta exige PII hasheada. */
function sha256(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** Normaliza telefone BR pra E.164 digits-only (ex: "55 24 99864-9392" → "5524998649392") */
function normPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export interface SendCAPIEventInput {
  eventName: MetaEventName;
  eventId: string;                 // ID único pra dedup com pixel browser
  eventSourceUrl?: string | null;  // URL da página onde o evento aconteceu
  user: MetaUserData;
  custom?: MetaCustomData;
  testEventCode?: string;          // só pra debug (ver em Meta Events Manager → Test)
}

/**
 * Envia 1 evento pro Meta CAPI. Retorna { ok, events_received?, error? }.
 * Nunca throws — devolve ok:false em qualquer falha pra NÃO derrubar a cotação principal.
 */
export async function sendCAPIEvent(input: SendCAPIEventInput): Promise<{ ok: boolean; message?: string; detail?: unknown }> {
  if (!PIXEL_ID || !CAPI_TOKEN) {
    return { ok: false, message: "pixel não configurado (env NEXT_PUBLIC_META_PIXEL_ID + META_CAPI_TOKEN)" };
  }

  const eventTime = Math.floor(Date.now() / 1000);

  const user_data: Record<string, string | string[]> = {};
  const emailHash = sha256(input.user.email ?? null);
  const phoneHash = sha256(normPhone(input.user.phone));
  const fnHash = sha256(input.user.firstName ?? null);
  const lnHash = sha256(input.user.lastName ?? null);
  const ctHash = sha256(input.user.city ?? null);
  const stHash = sha256(input.user.state ?? null);
  const countryHash = sha256(input.user.country ?? "br");

  if (emailHash) user_data.em = [emailHash];
  if (phoneHash) user_data.ph = [phoneHash];
  if (fnHash) user_data.fn = [fnHash];
  if (lnHash) user_data.ln = [lnHash];
  if (ctHash) user_data.ct = [ctHash];
  if (stHash) user_data.st = [stHash];
  if (countryHash) user_data.country = [countryHash];
  if (input.user.externalId) user_data.external_id = [sha256(input.user.externalId) ?? input.user.externalId];
  if (input.user.fbp) user_data.fbp = input.user.fbp;
  if (input.user.fbc) user_data.fbc = input.user.fbc;
  if (input.user.clientIp) user_data.client_ip_address = input.user.clientIp;
  if (input.user.userAgent) user_data.client_user_agent = input.user.userAgent;

  const custom_data: Record<string, unknown> = {};
  if (input.custom?.value != null) custom_data.value = input.custom.value;
  if (input.custom?.currency) custom_data.currency = input.custom.currency;
  if (input.custom?.content_name) custom_data.content_name = input.custom.content_name;
  if (input.custom?.content_category) custom_data.content_category = input.custom.content_category;
  if (input.custom?.content_ids) custom_data.content_ids = input.custom.content_ids;

  const payload = {
    data: [{
      event_name: input.eventName,
      event_time: eventTime,
      event_id: input.eventId,
      action_source: "website" as const,
      event_source_url: input.eventSourceUrl ?? undefined,
      user_data,
      custom_data,
    }],
    ...(input.testEventCode ? { test_event_code: input.testEventCode } : {}),
  };

  try {
    const r = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${PIXEL_ID}/events?access_token=${CAPI_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      console.warn("[meta-capi] HTTP", r.status, json);
      return { ok: false, message: `meta ${r.status}`, detail: json };
    }
    return { ok: true, detail: json };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[meta-capi] erro:", msg);
    return { ok: false, message: msg };
  }
}

/** Gera event_id único (crypto random) — usar o MESMO no server e no browser pra dedup. */
export function newEventId(): string {
  return crypto.randomUUID();
}
