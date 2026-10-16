"use client";

import { useInspectionStore } from "@/lib/inspection-store";
import { angleLabels, type InspectionContext } from "@/lib/mock-tokens";
import { Button } from "@/components/ui/button";

export function Success({ ctx }: { ctx: InspectionContext }) {
  const plate = useInspectionStore((s) => s.detectedPlate);
  const odometer = useInspectionStore((s) => s.detectedOdometer);
  const chassis = useInspectionStore((s) => s.detectedChassis);
  const extras = useInspectionStore((s) => s.capturedExtras);
  const videoSec = useInspectionStore((s) =>
    s.videoDurationMs ? Math.round(s.videoDurationMs / 1000) : 0,
  );
  const reset = useInspectionStore((s) => s.reset);

  return (
    <section className="flex-1 flex flex-col px-6 py-10">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-cobalt grid place-items-center">
          <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h1 className="font-display text-2xl font-bold mb-2">Pronto!</h1>
          <p className="text-chromeMid max-w-sm">
            Sua vistoria foi enviada para análise. A LOOG vai te avisar pelo WhatsApp em até 24h.
          </p>
        </div>

        <div className="w-full max-w-sm bg-surface rounded-2xl p-5 border border-chromeLo text-left space-y-2">
          <div className="text-xs text-chromeMid uppercase mb-2 font-mono tracking-wide">
            Resumo da captura
          </div>
          {videoSec > 0 && (
            <Row label="Vídeo gravado" value={`${videoSec}s`} />
          )}
          {ctx.template.requiredVideoAngles.length > 0 && (
            <Row
              label="Ângulos extraídos"
              value={`${ctx.template.requiredVideoAngles.length} (${ctx.template.requiredVideoAngles
                .map((a) => angleLabels[a])
                .join(", ")})`}
            />
          )}
          {plate && <Row label="Placa confirmada" value={plate} mono />}
          {odometer !== null && (
            <Row label="Hodômetro" value={`${odometer.toLocaleString("pt-BR")} km`} mono />
          )}
          {chassis && <Row label="Chassi" value={chassis} mono />}
          <Row label="Fotos extras" value={`${extras.length}`} />
        </div>
      </div>

      <Button variant="chrome" onClick={reset}>
        Fazer outra vistoria (dev)
      </Button>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start text-sm py-1">
      <span className="text-chromeMid">{label}</span>
      <span className={`text-chromeHi text-right ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
