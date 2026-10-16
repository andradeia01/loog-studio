"use client";

import { useEffect } from "react";
import { useInspectionStore } from "@/lib/inspection-store";
import { angleLabels, extraCaptureLabels, type InspectionContext } from "@/lib/mock-tokens";
import { apiFinalize } from "@/lib/api-client";

export function Processing({ ctx }: { ctx: InspectionContext }) {
  const setStep = useInspectionStore((s) => s.setStep);
  const setProcessing = useInspectionStore((s) => s.setProcessing);
  const processingSteps = useInspectionStore((s) => s.processingSteps);
  const processingProgress = useInspectionStore((s) => s.processingProgress);
  const setDetected = useInspectionStore((s) => s.setDetected);
  const serverInspectionId = useInspectionStore((s) => s.serverInspectionId);
  const gpsLat = useInspectionStore((s) => s.gpsLat);
  const gpsLng = useInspectionStore((s) => s.gpsLng);
  const setErrorStore = useInspectionStore((s) => s.setError);

  useEffect(() => {
    const steps: Array<{ label: string; status: "pending" | "done" | "error" }> = [
      { label: "Enviando vídeo…", status: "pending" },
      ...ctx.template.requiredVideoAngles.map((a) => ({
        label: `Analisando ${angleLabels[a].toLowerCase()}…`,
        status: "pending" as const,
      })),
      ...ctx.template.requiredExtraCaptures.map((e) => ({
        label: `Processando ${extraCaptureLabels[e].toLowerCase()}…`,
        status: "pending" as const,
      })),
      { label: "Validando identidade do veículo…", status: "pending" },
    ];
    setProcessing(0, steps);

    let currentStep = 0;
    const totalSteps = steps.length;
    const intervalMs = 500;

    const timer = setInterval(async () => {
      if (currentStep >= totalSteps) {
        clearInterval(timer);
        try {
          if (serverInspectionId) {
            const res = await apiFinalize(serverInspectionId, {
              detectedPlate: ctx.vehiclePlate,
              detectedOdometer: 48273,
              detectedChassis: "9C2PC410***MOCK",
              gpsLat,
              gpsLng,
            });
            setDetected({
              plate: res.detectedPlate ?? ctx.vehiclePlate,
              odometer: res.detectedOdometer ?? 48273,
              chassis: res.detectedChassis ?? "9C2PC410***MOCK",
            });
          } else {
            setDetected({
              plate: ctx.vehiclePlate,
              odometer: 48273,
              chassis: "9C2PC410***MOCK",
            });
          }
          setTimeout(() => setStep("success"), 400);
        } catch (err) {
          setErrorStore(err instanceof Error ? err.message : "Falha ao finalizar");
        }
        return;
      }
      steps[currentStep] = { ...steps[currentStep]!, status: "done" };
      currentStep += 1;
      const progress = Math.round((currentStep / totalSteps) * 100);
      setProcessing(progress, [...steps]);
    }, intervalMs);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="flex-1 flex flex-col px-6 py-10">
      <h1 className="font-display text-xl font-semibold mb-2">
        Analisando sua vistoria…
      </h1>
      <p className="text-sm text-chromeMid mb-6">
        A IA está extraindo os ângulos do vídeo e lendo os dados.
      </p>

      <div className="h-2 bg-chromeLo/40 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-cobalt transition-all duration-500 ease-loog"
          style={{ width: `${processingProgress}%` }}
        />
      </div>

      <ul className="space-y-2.5 flex-1">
        {processingSteps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            {s.status === "done" ? (
              <span className="w-5 h-5 rounded-full bg-cobalt grid place-items-center text-white text-xs">
                ✓
              </span>
            ) : s.status === "error" ? (
              <span className="w-5 h-5 rounded-full bg-statusLate grid place-items-center text-white text-xs">
                !
              </span>
            ) : (
              <span className="w-5 h-5 rounded-full border-2 border-chromeLo border-t-cobalt animate-spin" />
            )}
            <span
              className={
                s.status === "done" ? "text-chromeHi" : "text-chromeMid"
              }
            >
              {s.label}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-chromeMid text-center mt-6">
        Em produção, isso leva ~15–25s via vídeo IA.
      </p>
    </section>
  );
}
