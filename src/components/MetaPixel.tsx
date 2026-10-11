"use client";

import Script from "next/script";
import { useEffect } from "react";

/**
 * Carrega o Meta Pixel JS no browser. Dispara PageView automaticamente ao mount.
 *
 * Pra disparar eventos custom (dedup com CAPI server-side):
 *   import { trackMetaEvent } from "@/components/MetaPixel";
 *   trackMetaEvent("Lead", { value: 150.90, currency: "BRL" }, eventId);
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

type FbqFn = {
  (cmd: "init", pixelId: string): void;
  (cmd: "track" | "trackCustom", eventName: string, params?: Record<string, unknown>, options?: { eventID?: string }): void;
  callMethod?: unknown;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: unknown;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

export function MetaPixel() {
  useEffect(() => {
    if (typeof window === "undefined" || !PIXEL_ID) return;
    const t = setTimeout(() => {
      try { window.fbq?.("track", "PageView"); } catch { /* silencioso */ }
    }, 300);
    return () => clearTimeout(t);
  }, []);

  if (!PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s){
            if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)
          }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${PIXEL_ID}');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1" width="1" style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

/** Dispara 1 evento no browser. Se eventId for passado, Meta dedupe com CAPI. */
export function trackMetaEvent(
  eventName: string,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  if (typeof window === "undefined") return;
  try {
    window.fbq?.("track", eventName, params ?? {}, eventId ? { eventID: eventId } : undefined);
  } catch { /* silencioso */ }
}

/** Lê cookies _fbp e _fbc do browser (manda no body pra o server dedup CAPI). */
export function getFbCookies(): { fbp: string | null; fbc: string | null } {
  if (typeof document === "undefined") return { fbp: null, fbc: null };
  const read = (name: string) => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  };
  return { fbp: read("_fbp"), fbc: read("_fbc") };
}
