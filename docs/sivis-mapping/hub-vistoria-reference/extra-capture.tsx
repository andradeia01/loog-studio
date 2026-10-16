"use client";

import { useEffect, useRef, useState } from "react";
import { useInspectionStore } from "@/lib/inspection-store";
import { extraCaptureLabels, type InspectionContext } from "@/lib/mock-tokens";
import { Button } from "@/components/ui/button";
import { ProgressDots } from "@/components/ui/progress-dots";
import { apiUpload } from "@/lib/api-client";

export function ExtraCapture({ ctx }: { ctx: InspectionContext }) {
  const extras = ctx.template.requiredExtraCaptures;
  const idx = useInspectionStore((s) => s.currentExtraIndex);
  const addExtra = useInspectionStore((s) => s.addExtra);
  const advance = useInspectionStore((s) => s.advanceExtra);
  const setStep = useInspectionStore((s) => s.setStep);
  const serverInspectionId = useInspectionStore((s) => s.serverInspectionId);
  const gpsLat = useInspectionStore((s) => s.gpsLat);
  const gpsLng = useInspectionStore((s) => s.gpsLng);
  const setErrorStore = useInspectionStore((s) => s.setError);
  const [uploading, setUploading] = useState(false);

  const current = extras[idx];
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!current) {
      setStep("processing");
      return;
    }
    let cancelled = false;
    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError("Não foi possível acessar sua câmera.");
      }
    }
    init();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [current, setStep, idx]);

  async function takePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    ctx2d.drawImage(video, 0, 0);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    setSnapshotBlob(blob);
    setSnapshot(URL.createObjectURL(blob));
  }

  function retake() {
    if (snapshot) URL.revokeObjectURL(snapshot);
    setSnapshot(null);
    setSnapshotBlob(null);
  }

  async function confirm() {
    if (!snapshot || !snapshotBlob || !current) return;
    setUploading(true);
    try {
      if (serverInspectionId) {
        await apiUpload(serverInspectionId, snapshotBlob, {
          kind: "PHOTO",
          angleOrExtra: current,
          gpsLat,
          gpsLng,
        });
      }
      addExtra({
        type: current,
        blobUrl: snapshot,
        blob: snapshotBlob,
        capturedAt: Date.now(),
      });
      const isLast = idx + 1 >= extras.length;
      advance();
      if (isLast) {
        setStep("processing");
      } else {
        setSnapshot(null);
        setSnapshotBlob(null);
      }
    } catch (err) {
      setErrorStore(err instanceof Error ? err.message : "Falha ao enviar foto");
    } finally {
      setUploading(false);
    }
  }

  if (!current) return null;

  return (
    <section className="fixed inset-0 bg-black flex flex-col">
      {/* Top bar */}
      <div className="pt-[max(env(safe-area-inset-top),1rem)] px-4 pb-3 flex items-center justify-between bg-black/80 backdrop-blur z-10">
        <span className="font-display font-semibold">
          Foto {idx + 1}/{extras.length}
        </span>
        <ProgressDots total={extras.length} current={idx + (snapshot ? 1 : 0)} />
      </div>

      <div className="px-4 pb-3 bg-black/80 backdrop-blur">
        <h2 className="font-display font-semibold text-lg">
          {extraCaptureLabels[current]}
        </h2>
        <p className="text-sm text-chromeMid">{helperText(current)}</p>
      </div>

      {/* Camera */}
      <div className="flex-1 relative overflow-hidden">
        {!snapshot ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Guide overlay */}
            <GuideOverlay type={current} />
          </>
        ) : (
          <img src={snapshot} alt="Captura" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {error && (
          <div className="absolute inset-0 bg-black/80 grid place-items-center p-6">
            <p className="text-center text-chromeMid">{error}</p>
          </div>
        )}
      </div>

      {/* Bottom control */}
      <div className="bg-black/80 backdrop-blur px-6 py-6 pb-[max(env(safe-area-inset-bottom),2rem)]">
        {!snapshot ? (
          <div className="flex justify-center">
            <button
              onClick={takePhoto}
              className="w-20 h-20 rounded-full bg-white grid place-items-center active:scale-95 transition-transform"
              aria-label="Tirar foto"
            >
              <span className="w-16 h-16 rounded-full border-4 border-black" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button variant="cobalt" onClick={confirm} disabled={uploading}>
              {uploading ? "Enviando…" : idx + 1 < extras.length ? "Próxima foto →" : "Finalizar"}
            </Button>
            <Button variant="ghost" onClick={retake} disabled={uploading}>
              Tirar de novo
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function helperText(type: string): string {
  switch (type) {
    case "CHASSIS":
      return "Localização comum: coluna do motor, coluna da porta ou plaqueta sob o cofre.";
    case "ODOMETER":
      return "Enquadre o display do painel com o Km atual.";
    case "CRLV":
      return "Documento do veículo (CRLV digital ou físico).";
    case "DAMAGE_1":
    case "DAMAGE_2":
    case "DAMAGE_3":
      return "Mostre o dano com boa luz e enquadramento claro.";
    case "POLICE_REPORT":
      return "Foto do B.O. com número de registro visível.";
    case "INVOICE":
      return "Nota fiscal do serviço de reparo.";
    case "GLASS_DAMAGE":
      return "Mostre o vidro danificado em detalhe.";
    case "NEW_PLATE_FRONT":
      return "Nova placa dianteira do veículo.";
    case "NEW_PLATE_REAR":
      return "Nova placa traseira do veículo.";
    default:
      return "Capture a foto com boa iluminação.";
  }
}

function GuideOverlay({ type }: { type: string }) {
  if (type === "ODOMETER") {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[60%] h-[22%] border-2 border-cobalt rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
      </div>
    );
  }
  if (type === "CHASSIS") {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[70%] h-[20%] border-2 border-cobalt rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-[85%] h-[70%] border-2 border-chromeHi/40 rounded-2xl" />
    </div>
  );
}
