"use client";

import { useState } from "react";
import { useInspectionStore } from "@/lib/inspection-store";
import type { InspectionContext } from "@/lib/mock-tokens";
import { Button } from "@/components/ui/button";
import { apiStart } from "@/lib/api-client";

export function Welcome({ ctx }: { ctx: InspectionContext }) {
  const setStep = useInspectionStore((s) => s.setStep);
  const setGps = useInspectionStore((s) => s.setGps);
  const setServerInspectionId = useInspectionStore((s) => s.setServerInspectionId);
  const setError = useInspectionStore((s) => s.setError);
  const [loading, setLoading] = useState(false);
  const t = ctx.template;

  async function start() {
    setLoading(true);
    try {
      // Pede GPS silenciosamente antes de ir pro próximo passo.
      if (t.gpsRequired && "geolocation" in navigator) {
        try {
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setGps(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                resolve();
              },
              () => resolve(),
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
            );
          });
        } catch {
          /* segue sem GPS */
        }
      }
      // Cria/recupera a Inspection no servidor
      const id = await apiStart(ctx.token);
      setServerInspectionId(id);
      setStep(t.usesVideo ? "video_record" : "extra_capture");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar vistoria");
    } finally {
      setLoading(false);
    }
  }

  const includesTop = t.requiredVideoAngles.includes("TOP");
  const captureSummary = [
    t.usesVideo &&
      `1 vídeo de ${t.videoMaxSeconds}s na horizontal${includesTop ? ", mostrando o teto" : ""}`,
    t.requiredExtraCaptures.length > 0 &&
      `${t.requiredExtraCaptures.length} foto${t.requiredExtraCaptures.length > 1 ? "s" : ""}`,
  ].filter(Boolean);

  const estMin = Math.max(
    1,
    Math.round(
      (t.usesVideo ? t.videoMaxSeconds : 0) + t.requiredExtraCaptures.length * 15 + 20,
    ) / 60,
  );

  return (
    <section className="flex-1 flex flex-col px-6 py-10 justify-between">
      <header className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-cobalt grid place-items-center font-display font-bold text-white text-sm">
          ∞
        </span>
        <span className="font-display font-semibold tracking-tight">
          LOOG <span className="text-cobalt">Vistoria</span>
        </span>
      </header>

      <div className="flex-1 flex flex-col justify-center items-center text-center gap-6 py-10">
        <div className="w-16 h-16 rounded-full bg-surface border border-chromeLo grid place-items-center">
          {ctx.vehicleType === "moto" ? (
            <MotoIcon />
          ) : (
            <CarIcon />
          )}
        </div>

        <div>
          <p className="text-chromeMid text-sm mb-1">Olá, {ctx.memberName.split(" ")[0]}</p>
          <h1 className="font-display text-2xl font-bold tracking-tight mb-2">
            Vamos vistoriar seu
            <br />
            <span className="text-cobalt">
              {ctx.vehicleBrand} {ctx.vehicleModel}
            </span>
          </h1>
          <p className="font-mono text-sm text-chromeMid tracking-widest">
            {ctx.vehiclePlate}
          </p>
        </div>

        <div className="w-full max-w-sm bg-surface rounded-2xl p-5 border border-chromeLo">
          <div className="text-xs text-chromeMid uppercase mb-3 tracking-wide font-mono">
            {t.typeLabel}
          </div>
          <div className="space-y-2 text-sm">
            {captureSummary.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-cobalt">✓</span>
                <span>{line}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2 border-t border-chromeLo mt-2">
              <span className="text-chromeMid">⏱</span>
              <span className="text-chromeMid">~{estMin.toFixed(1)} min no total</span>
            </div>
          </div>
        </div>

        {t.usesVideo && (
          <div className="w-full max-w-sm bg-black border border-chromeLo rounded-xl p-4 text-left space-y-2 text-xs">
            <h3 className="font-display font-semibold text-chromeHi text-sm mb-1">
              Como gravar o vídeo
            </h3>
            <RuleRow icon="📱" text="Celular na HORIZONTAL (vai travar sozinho)" />
            <RuleRow icon="📏" text="Fique a 3 passos do carro" />
            {includesTop && <RuleRow icon="🚗" text="Carro INTEIRO no quadro, incluindo o teto" />}
            <RuleRow icon="🚶" text="Caminhe devagar ao redor" />
            <RuleRow icon="💡" text="Local iluminado · sem flash" />
          </div>
        )}
      </div>

      <Button onClick={start} className="pulse-cobalt" disabled={loading}>
        {loading ? "Preparando…" : "Começar agora"}
      </Button>
    </section>
  );
}

function RuleRow({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-2 text-chromeMid">
      <span className="w-5 shrink-0 text-center" aria-hidden>
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}

function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-8 h-8 text-cobalt" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13l2-5a2 2 0 012-1h10a2 2 0 012 1l2 5v5a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1H7v1a1 1 0 01-1 1H4a1 1 0 01-1-1v-5z" />
      <circle cx="7.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="16.5" cy="15.5" r="1" fill="currentColor" />
    </svg>
  );
}

function MotoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-8 h-8 text-cobalt" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="5.5" cy="17" r="3" />
      <circle cx="18.5" cy="17" r="3" />
      <path strokeLinecap="round" d="M8 17h4l3-7h3M15 10l-2-3h-3" />
    </svg>
  );
}
