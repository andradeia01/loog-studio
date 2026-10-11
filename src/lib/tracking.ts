"use client";

/**
 * Captura parâmetros de tracking da URL + localStorage.
 * Guarda em localStorage pra manter atribuição mesmo após refresh/navegação.
 */

const STORAGE_KEY = "loog-tracking-v1";
const EXPIRY_DAYS = 30;

export interface TrackingInfo {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  referrer: string | null;
  landing_url: string | null;
  captured_at: string;
}

/** Lê UTM params da URL atual + referrer e persiste no localStorage. */
export function captureTracking(): TrackingInfo | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const q = url.searchParams;

  const info: TrackingInfo = {
    utm_source:   q.get("utm_source"),
    utm_medium:   q.get("utm_medium"),
    utm_campaign: q.get("utm_campaign"),
    utm_content:  q.get("utm_content"),
    utm_term:     q.get("utm_term"),
    fbclid:       q.get("fbclid"),
    gclid:        q.get("gclid"),
    referrer:     document.referrer || null,
    landing_url:  window.location.href,
    captured_at:  new Date().toISOString(),
  };

  const hasAnything = info.utm_source || info.utm_campaign || info.fbclid || info.gclid;
  if (!hasAnything) return getStoredTracking(); // sem params → usa o anterior se existir

  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(info)); } catch { /* ignore */ }
  return info;
}

/** Lê tracking persistido no localStorage (se não expirou). */
export function getStoredTracking(): TrackingInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const info = JSON.parse(raw) as TrackingInfo;
    const captured = new Date(info.captured_at).getTime();
    const expired = Date.now() - captured > EXPIRY_DAYS * 24 * 3600 * 1000;
    if (expired) { localStorage.removeItem(STORAGE_KEY); return null; }
    return info;
  } catch { return null; }
}

/** Devolve só os campos relevantes pro backend (omite captured_at), inclui fbp/fbc + event_id. */
export function trackingForBackend(eventId?: string): (Omit<TrackingInfo, "captured_at"> & { fbp?: string | null; fbc?: string | null; event_id?: string }) | null {
  const info = captureTracking();
  const fb = readFbCookies();
  // Se não tem UTM nem cookie FB, retorna null
  if (!info && !fb.fbp && !fb.fbc && !eventId) return null;
  const base = info ? (() => { const { captured_at: _ca, ...rest } = info; void _ca; return rest; })() : { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, fbclid: null, gclid: null, referrer: null, landing_url: typeof window !== "undefined" ? window.location.href : null };
  return { ...base, fbp: fb.fbp, fbc: fb.fbc, event_id: eventId };
}

function readFbCookies(): { fbp: string | null; fbc: string | null } {
  if (typeof document === "undefined") return { fbp: null, fbc: null };
  const read = (name: string) => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  };
  return { fbp: read("_fbp"), fbc: read("_fbc") };
}
