"use client";

import { useEffect, useRef, useState } from "react";
import { useInspectionStore } from "@/lib/inspection-store";
import type { InspectionContext } from "@/lib/mock-tokens";

export function VideoRecord({ ctx }: { ctx: InspectionContext }) {
  const t = ctx.template;
  const setStep = useInspectionStore((s) => s.setStep);
  const setVideo = useInspectionStore((s) => s.setVideo);
  const setError = useInspectionStore((s) => s.setError);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef<number>(0);

  const [phase, setPhase] = useState<"preview" | "recording" | "stopped">("preview");
  const [elapsed, setElapsed] = useState(0);
  const [isPortrait, setIsPortrait] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const hints = buildHints(t.videoMaxSeconds, t.requiredVideoAngles);
  const hint =
    hints.find((h) => elapsed >= h.from && elapsed < h.to)?.text ?? "Mantenha o carro inteiro visível";

  // Detect orientation using multiple signals (robust across iOS/Android)
  useEffect(() => {
    const detect = () => {
      // 1. screen.orientation (Chrome Android, modern browsers)
      const soType = (screen as { orientation?: ScreenOrientation }).orientation?.type;
      if (soType) {
        setIsPortrait(soType.startsWith("portrait"));
        return;
      }
      // 2. matchMedia (iOS Safari + others)
      if (window.matchMedia) {
        const mm = window.matchMedia("(orientation: portrait)");
        setIsPortrait(mm.matches);
        return;
      }
      // 3. fallback: dimensions
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    detect();

    const mm = window.matchMedia?.("(orientation: portrait)");
    const handler = () => detect();

    mm?.addEventListener?.("change", handler);
    window.addEventListener("orientationchange", handler);
    window.addEventListener("resize", handler);

    return () => {
      mm?.removeEventListener?.("change", handler);
      window.removeEventListener("orientationchange", handler);
      window.removeEventListener("resize", handler);
    };
  }, []);

  // Open camera on mount — never gated by orientation
  useEffect(() => {
    let cancelled = false;
    async function initCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError("Seu navegador não suporta câmera. Use Chrome ou Safari atualizado.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          el.onloadedmetadata = () => {
            el.play()
              .then(() => setCameraReady(true))
              .catch((err) => {
                console.error("video.play failed", err);
                setCameraError("Toque na tela para iniciar a câmera.");
              });
          };
        }
      } catch (err) {
        console.error("getUserMedia", err);
        const msg =
          err instanceof Error ? err.message : "Falha ao abrir câmera";
        if (/NotAllowed|Permission/i.test(msg)) {
          setCameraError("Permissão de câmera negada. Habilite nas configurações do navegador.");
        } else if (/NotFound/i.test(msg)) {
          setCameraError("Nenhuma câmera encontrada neste dispositivo.");
        } else {
          setCameraError(msg);
        }
      }
    }
    initCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      recorderRef.current?.stop();
    };
  }, []);

  // Timer during recording
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const sec = (Date.now() - startTsRef.current) / 1000;
      setElapsed(sec);
      if (sec >= t.videoMaxSeconds) stopRecording();
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, t.videoMaxSeconds]);

  function startRecording() {
    if (!streamRef.current || !cameraReady) return;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    try {
      const recorder = new MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType } : undefined,
      );
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
        const durationMs = Date.now() - startTsRef.current;
        setVideo(blob, durationMs);
        setStep("video_review");
      };
      recorder.start(500);
      recorderRef.current = recorder;
      startTsRef.current = Date.now();
      setElapsed(0);
      setPhase("recording");
    } catch (err) {
      console.error("MediaRecorder", err);
      setError("Falha ao gravar. Seu dispositivo não suporta este formato.");
    }
  }

  function stopRecording() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      setPhase("stopped");
      r.stop();
    }
  }

  function cancelRecording() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    setStep("welcome");
  }

  function manualPlay() {
    videoRef.current
      ?.play()
      .then(() => {
        setCameraReady(true);
        setCameraError(null);
      })
      .catch(() => {});
  }

  const minReached = elapsed >= t.videoMinSeconds;
  const includesTop = t.requiredVideoAngles.includes("TOP");
  const canRecord = cameraReady && !isPortrait && !cameraError;

  return (
    <section className="fixed inset-0 bg-black" onClick={manualPlay}>
      {/* Camera fullscreen — SEMPRE renderizada */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Erro de câmera (acima da câmera) */}
      {cameraError && (
        <div className="absolute inset-0 bg-black/80 grid place-items-center p-6 z-20">
          <div className="max-w-sm text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-statusLate/20 border-2 border-statusLate grid place-items-center mb-4">
              <span className="text-statusLate text-2xl">!</span>
            </div>
            <p className="text-chromeHi mb-4">{cameraError}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-cobalt text-white px-5 py-2.5 rounded-xl font-medium"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      )}

      {/* Silhueta de enquadramento (3 passos) */}
      {!cameraError && cameraReady && !isPortrait && (
        <SilhouetteOverlay includesTop={includesTop} />
      )}

      {/* Overlay semitransparente de aviso de rotação — NÃO esconde a câmera */}
      {!cameraError && isPortrait && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm grid place-items-center z-10 pointer-events-none">
          <div className="text-center animate-pulse">
            <RotateIcon />
            <p className="font-display font-bold text-xl mt-4 text-white">Gire o celular</p>
            <p className="text-chromeHi/90 mt-1 px-6 max-w-xs">
              A gravação precisa ser na <strong className="text-cobalt">horizontal</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 p-3 flex justify-between items-start z-30">
        <button
          onClick={(e) => {
            e.stopPropagation();
            cancelRecording();
          }}
          className="w-10 h-10 rounded-full bg-black/60 backdrop-blur grid place-items-center text-chromeHi"
          aria-label="Cancelar"
        >
          ✕
        </button>
        {phase === "recording" && (
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-sm text-white">
              {formatTime(elapsed)} / {formatTime(t.videoMaxSeconds)}
            </span>
          </div>
        )}
      </div>

      {/* Hint central durante gravação */}
      {phase === "recording" && !isPortrait && (
        <div className="absolute inset-x-0 top-16 flex items-center justify-center pointer-events-none px-4 z-30">
          <div className="bg-cobalt/90 backdrop-blur px-4 py-2 rounded-full text-xs font-medium text-white uppercase tracking-wide">
            {hint}
          </div>
        </div>
      )}

      {/* Status de câmera (quando ainda carregando) */}
      {!cameraReady && !cameraError && (
        <div className="absolute inset-x-0 bottom-32 text-center z-30 pointer-events-none">
          <div className="inline-block bg-black/70 backdrop-blur px-4 py-2 rounded-full text-xs text-chromeHi">
            Abrindo câmera…
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-0 inset-x-0 pb-4 px-6 z-30" style={{ paddingTop: "2rem" }}>
        <div className="flex items-center justify-center gap-6">
          {phase === "preview" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                startRecording();
              }}
              disabled={!canRecord}
              className={`w-16 h-16 rounded-full grid place-items-center active:scale-95 transition-all ${
                canRecord ? "bg-white" : "bg-white/30 cursor-not-allowed"
              }`}
              aria-label="Começar a gravar"
            >
              <span className="w-10 h-10 rounded-full bg-red-500" />
            </button>
          )}
          {phase === "recording" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                stopRecording();
              }}
              disabled={!minReached}
              className={`w-16 h-16 rounded-full grid place-items-center active:scale-95 transition-all ${
                minReached ? "bg-white" : "bg-white/30 cursor-not-allowed"
              }`}
              aria-label="Parar"
            >
              <span className="w-6 h-6 rounded-md bg-red-500" />
            </button>
          )}
        </div>
        {phase === "recording" && !minReached && (
          <p className="text-center text-xs text-white/80 mt-2">
            Mínimo {t.videoMinSeconds}s — continue filmando…
          </p>
        )}
        {phase === "preview" && isPortrait && cameraReady && (
          <p className="text-center text-xs text-white/80 mt-2">Gire o celular para habilitar</p>
        )}
      </div>
    </section>
  );
}

/** Silhueta tracejada que força o usuário a enquadrar o carro inteiro a ~3 passos. */
function SilhouetteOverlay({ includesTop }: { includesTop: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <mask id="hole">
            <rect width="100" height="56" fill="white" />
            <rect
              x="6"
              y={includesTop ? "8" : "14"}
              width="88"
              height={includesTop ? "42" : "32"}
              rx="4"
              fill="black"
            />
          </mask>
        </defs>
        <rect width="100" height="56" fill="rgba(0,0,0,0.3)" mask="url(#hole)" />
        <rect
          x="6"
          y={includesTop ? "8" : "14"}
          width="88"
          height={includesTop ? "42" : "32"}
          rx="4"
          fill="none"
          stroke="#0053FF"
          strokeWidth="0.4"
          strokeDasharray="2 1.5"
        />
      </svg>
      <div className="absolute left-4 bottom-20 bg-black/70 backdrop-blur px-2.5 py-1 rounded font-mono text-[10px] text-cobalt tracking-wide">
        3 PASSOS DO CARRO
      </div>
      {includesTop && (
        <div className="absolute right-4 bottom-20 bg-black/70 backdrop-blur px-2.5 py-1 rounded font-mono text-[10px] text-cobalt tracking-wide">
          INCLUIR TETO
        </div>
      )}
    </div>
  );
}

function RotateIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="w-20 h-20 mx-auto text-cobalt"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="4" y="12" width="40" height="24" rx="4" />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
      <path
        d="M38 6l4 4-4 4M42 10h-6a4 4 0 00-4 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function pickMimeType(): string | null {
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4;codecs=h264",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

interface Hint {
  text: string;
  from: number;
  to: number;
}

function buildHints(maxSec: number, angles: string[]): Hint[] {
  const includesTop = angles.includes("TOP");
  const walkAngles = angles.filter((a) => a !== "TOP");
  const topShare = includesTop ? 0.2 : 0;
  const walkDur = maxSec * (1 - topShare);
  const per = walkDur / Math.max(1, walkAngles.length);

  const labels: Record<string, string> = {
    FRONT: "Mostre a frente",
    LEFT: "Agora a lateral esquerda",
    REAR: "Agora a traseira",
    RIGHT: "Agora a lateral direita",
  };

  const hints: Hint[] = walkAngles.map((a, i) => ({
    text: labels[a] ?? `Mostre ${a}`,
    from: i * per,
    to: (i + 1) * per,
  }));

  if (includesTop) {
    hints.push({
      text: "Agora mostre o TETO do carro",
      from: walkDur,
      to: maxSec,
    });
  }
  return hints;
}
