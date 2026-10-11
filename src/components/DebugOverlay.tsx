"use client";

import { useEffect, useState } from "react";

/**
 * Painel de debug temporário pra PWA. Ativa com ?debug=1 ou localStorage.loogDebug=1.
 *
 * Mostra no canto inferior esquerdo:
 *  - viewport (incl. visualViewport e orientation)
 *  - standalone status (iOS + Android)
 *  - último evento (click/touchstart/orientationchange/resize)
 *  - elemento no ponto (0,0) e no centro — pra detectar overlay fantasma
 *  - overlays fixed/absolute no DOM com z-index > 10
 *
 * Toque no painel pra minimizar/expandir. Toque longo pra fechar.
 */
export function DebugOverlay() {
  const [show, setShow] = useState(false);
  const [mini, setMini] = useState(false);
  const [tick, setTick] = useState(0);
  const [lastEvt, setLastEvt] = useState<string>("—");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const enabled =
      sp.get("debug") === "1" ||
      (() => { try { return localStorage.getItem("loogDebug") === "1"; } catch { return false; } })();
    setShow(enabled);
    if (!enabled) return;

    const bump = (name: string) => () => { setLastEvt(`${name} @ ${new Date().toLocaleTimeString()}`); setTick((n) => n + 1); };
    const handlers: Array<[string, () => void, EventTarget]> = [
      ["click",             bump("click"),             window],
      ["touchstart",        bump("touchstart"),        window],
      ["orientationchange", bump("orientationchange"), window],
      ["resize",            bump("resize"),            window],
      ["visibilitychange",  bump("visibility"),        document],
    ];
    handlers.forEach(([ev, h, t]) => t.addEventListener(ev, h));
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      clearInterval(i);
      handlers.forEach(([ev, h, t]) => t.removeEventListener(ev, h));
    };
  }, []);

  if (!show) return null;

  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const nav = typeof window !== "undefined" ? window.navigator : null;
  const isStandalone =
    (typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)")?.matches ||
        (nav as (Navigator & { standalone?: boolean }) | null)?.standalone === true)) ||
    false;

  // Elementos no centro + nos 4 cantos → detecta overlay fantasma
  const probe = (x: number, y: number) => {
    const el = typeof document !== "undefined" ? document.elementFromPoint(x, y) : null;
    if (!el) return "—";
    return `<${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}>${(el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : "").slice(0, 40)}`;
  };

  const w = typeof window !== "undefined" ? window.innerWidth : 0;
  const h = typeof window !== "undefined" ? window.innerHeight : 0;

  // Lista overlays fixos com z-index alto
  const overlays: string[] = [];
  if (typeof document !== "undefined") {
    document.querySelectorAll("*").forEach((el) => {
      const s = getComputedStyle(el);
      const z = parseInt(s.zIndex, 10);
      if ((s.position === "fixed" || s.position === "absolute") && z >= 10) {
        const r = el.getBoundingClientRect();
        if (r.width > 100 && r.height > 100) {
          overlays.push(`z${z} ${el.tagName.toLowerCase()}.${(typeof el.className === "string" ? el.className : "").split(" ")[0]} (${Math.round(r.width)}x${Math.round(r.height)}) pe:${s.pointerEvents}`);
        }
      }
    });
  }

  const close = () => {
    try { localStorage.removeItem("loogDebug"); } catch { /* ignore */ }
    const url = new URL(window.location.href);
    url.searchParams.delete("debug");
    window.history.replaceState(null, "", url.toString());
    setShow(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "env(safe-area-inset-bottom, 0)",
        left: "env(safe-area-inset-left, 0)",
        zIndex: 999999,
        fontFamily: "ui-monospace, monospace",
        fontSize: 10,
        lineHeight: 1.3,
        color: "#0f0",
        background: "rgba(0,0,0,0.85)",
        padding: 6,
        maxWidth: mini ? 60 : 320,
        maxHeight: mini ? 20 : 360,
        overflow: "auto",
        border: "1px solid #0f0",
        borderRadius: 4,
        pointerEvents: "auto",
      }}
      onClick={() => setMini((m) => !m)}
      onDoubleClick={close}
      title="click = toggle, double-click = fechar"
    >
      {mini ? "🐛" : (
        <>
          <div style={{ color: "#0ff" }}>🐛 LOOG DEBUG [{tick}]</div>
          <div>vp: {w}×{h} | orient: {w > h ? "LAND" : "PORT"}</div>
          {vv && <div>vv: {Math.round(vv.width)}×{Math.round(vv.height)} offset:{Math.round(vv.offsetTop)}</div>}
          <div>standalone: {isStandalone ? "SIM" : "não"} | iOS: {/iPad|iPhone|iPod/.test(nav?.userAgent ?? "") ? "sim" : "não"}</div>
          <div>last: {lastEvt}</div>
          <div style={{ color: "#ff0", marginTop: 4 }}>elementFromPoint:</div>
          <div>⇧L: {probe(0, 0)}</div>
          <div>⇧R: {probe(w - 1, 0)}</div>
          <div>⇕C: {probe(w / 2, h / 2)}</div>
          <div>⇩L: {probe(0, h - 1)}</div>
          <div>⇩R: {probe(w - 1, h - 1)}</div>
          <div style={{ color: "#ff0", marginTop: 4 }}>overlays grandes z≥10:</div>
          {overlays.length === 0 ? <div>— nenhum</div> : overlays.slice(0, 8).map((o, i) => <div key={i}>{o}</div>)}
          <div style={{ color: "#888", marginTop: 4 }}>tap: min | 2x: close</div>
        </>
      )}
    </div>
  );
}
