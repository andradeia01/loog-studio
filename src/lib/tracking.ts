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

/** Devolve só os campos relevantes pro backend (omite captured_at). */
export function trackingForBackend(): Omit<TrackingInfo, "captured_at"> | null {
  const info = captureTracking();
  if (!info) return null;
  const { captured_at: _ca, ...rest } = info;
  void _ca;
  return rest;
}
