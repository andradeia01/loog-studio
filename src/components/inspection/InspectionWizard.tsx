"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { extractFrames } from "@/lib/inspection/frame-extractor";
import { startSpeechRecognition, type SpeechSession } from "@/lib/inspection/speech";
import type { AiResult } from "@/lib/inspection/types";

type Step =
  | "form"            // placa + dados
  | "permissions"     // pedir câmera/mic/localização
  | "selfie"          // foto do operador
  | "record"          // gravação principal
  | "odometer"        // foto extra do odômetro
  | "uploading"       // enviando pro servidor
  | "processing"      // IA analisando
  | "done";           // resultado

interface Props {
  onClose: () => void;
  onFinished: () => void;
}

interface VehicleData {
  placa: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string;
  fipeValor: string;
  fipeCodigo: string;
  nomeAssociado: string;
  telefoneAssociado: string;
}

const RECORD_SECONDS = 60;

export function InspectionWizard({ onClose, onFinished }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleData>({
    placa: "", marca: "", modelo: "", ano: null, cor: "",
    fipeValor: "", fipeCodigo: "",
    nomeAssociado: "", telefoneAssociado: "",
  });
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [transcript, setTranscript] = useState("");
  const [resultado, setResultado] = useState<AiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="relative flex h-full w-full flex-col overflow-y-auto rounded-none border-0 bg-loog-bg shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-3xl sm:border sm:border-loog-border">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-loog-border bg-loog-bg/95 p-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎥</span>
            <span className="font-display text-sm font-black text-white">Nova vistoria</span>
            <span className="text-[10px] text-loog-muted">· {stepLabel(step)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-loog-border bg-loog-panel/60 px-3 py-1 text-xs text-loog-muted hover:text-white"
          >
            ✕ Fechar
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 p-4 sm:p-5"
          >
            {step === "form" && (
              <FormStep
                vehicle={vehicle}
                setVehicle={setVehicle}
                onNext={async () => {
                  setErrorMsg(null);
                  try {
                    const r = await fetch("/api/inspection/create", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify(vehicle),
                    });
                    const j = await r.json();
                    if (!r.ok) throw new Error(j.error ?? "falha ao criar");
                    setInspectionId(j.id as string);
                    setStep("permissions");
                  } catch (err) {
                    setErrorMsg((err as Error).message);
                  }
                }}
                error={errorMsg}
              />
            )}

            {step === "permissions" && (
              <PermissionsStep
                onReady={(gpsData) => { if (gpsData) setGps(gpsData); setStep("selfie"); }}
                onError={(msg) => setErrorMsg(msg)}
                error={errorMsg}
              />
            )}

            {step === "selfie" && inspectionId && (
              <SelfieStep
                inspectionId={inspectionId}
                onNext={() => setStep("record")}
                onError={(msg) => setErrorMsg(msg)}
                error={errorMsg}
              />
            )}

            {step === "record" && inspectionId && (
              <RecordStep
                inspectionId={inspectionId}
                onTranscript={setTranscript}
                onNext={() => setStep("odometer")}
                onError={(msg) => setErrorMsg(msg)}
                error={errorMsg}
              />
            )}

            {step === "odometer" && inspectionId && (
              <OdometerStep
                inspectionId={inspectionId}
                onNext={async () => {
                  setStep("processing");
                  setErrorMsg(null);
                  try {
                    const r = await fetch(`/api/inspection/${inspectionId}/analyze`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ transcript, gps }),
                    });
                    const j = await r.json();
                    if (!r.ok) throw new Error(j.error ?? "análise falhou");
                    setResultado(j.ai as AiResult);
                    setStep("done");
                  } catch (err) {
                    setErrorMsg((err as Error).message);
                    setStep("done");
                  }
                }}
                onError={(msg) => setErrorMsg(msg)}
                error={errorMsg}
              />
            )}

            {step === "processing" && <ProcessingStep />}

            {step === "done" && (
              <DoneStep
                resultado={resultado}
                error={errorMsg}
                onClose={onFinished}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function stepLabel(s: Step): string {
  return {
    form: "1/6 Dados do veículo",
    permissions: "2/6 Permissões",
    selfie: "3/6 Foto do operador",
    record: "4/6 Gravação",
    odometer: "5/6 Odômetro",
    uploading: "Enviando…",
    processing: "6/6 IA analisando",
    done: "Resultado",
  }[s];
}

// ============================================================
// FORM STEP — placa + dados
// ============================================================
function FormStep({ vehicle, setVehicle, onNext, error }: {
  vehicle: VehicleData;
  setVehicle: (v: VehicleData) => void;
  onNext: () => void;
  error: string | null;
}) {
  const [autoFillLoading, setAutoFillLoading] = useState(false);

  const tryAutoFill = async () => {
    if (!vehicle.placa || vehicle.placa.length < 6) return;
    setAutoFillLoading(true);
    try {
      // Reaproveita a resolução FIPE via /api/sivis/cotacao se possível
      const r = await fetch(`/api/sivis/cotacao?placa=${encodeURIComponent(vehicle.placa)}&dryRun=1`);
      if (r.ok) {
        const j = await r.json();
        if (j.vehicle) {
          setVehicle({
            ...vehicle,
            marca: j.vehicle.brand ?? vehicle.marca,
            modelo: j.vehicle.model ?? vehicle.modelo,
            ano: j.vehicle.year ?? vehicle.ano,
            cor: j.vehicle.color ?? vehicle.cor,
            fipeValor: j.vehicle.fipeFormatted ?? vehicle.fipeValor,
            fipeCodigo: j.vehicle.fipeCode ?? vehicle.fipeCodigo,
          });
        }
      }
    } catch { /* silencioso — user preenche manual */ }
    finally { setAutoFillLoading(false); }
  };

  const canProceed = vehicle.placa.length >= 6;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-loog-muted">
          Placa do veículo
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            value={vehicle.placa}
            onChange={(e) => setVehicle({ ...vehicle, placa: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
            placeholder="ABC1D23"
            maxLength={7}
            className="flex-1 rounded-xl border border-loog-border bg-loog-panel/60 px-3 py-2 font-mono text-lg uppercase tracking-wider text-white outline-none focus:border-purple-500/60"
          />
          <button
            type="button"
            onClick={tryAutoFill}
            disabled={!canProceed || autoFillLoading}
            className="rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            {autoFillLoading ? "…" : "🔍 Buscar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca" value={vehicle.marca} onChange={(v) => setVehicle({ ...vehicle, marca: v })} />
        <Field label="Modelo" value={vehicle.modelo} onChange={(v) => setVehicle({ ...vehicle, modelo: v })} />
        <Field label="Ano" value={vehicle.ano?.toString() ?? ""} onChange={(v) => setVehicle({ ...vehicle, ano: v ? parseInt(v, 10) : null })} type="number" />
        <Field label="Cor" value={vehicle.cor} onChange={(v) => setVehicle({ ...vehicle, cor: v })} />
      </div>

      <div className="rounded-xl border border-loog-border bg-loog-panel/30 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
          Dados do associado (opcional)
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome" value={vehicle.nomeAssociado} onChange={(v) => setVehicle({ ...vehicle, nomeAssociado: v })} />
          <Field label="Telefone" value={vehicle.telefoneAssociado} onChange={(v) => setVehicle({ ...vehicle, telefoneAssociado: v })} />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        Continuar →
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-loog-muted">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-loog-border bg-loog-panel/60 px-3 py-2 text-sm text-white outline-none focus:border-purple-500/60"
      />
    </div>
  );
}

// ============================================================
// PERMISSIONS STEP
// ============================================================
function PermissionsStep({ onReady, onError, error }: {
  onReady: (gps: { lat: number; lng: number; accuracy: number } | null) => void;
  onError: (msg: string) => void;
  error: string | null;
}) {
  const [requesting, setRequesting] = useState(false);

  const request = async () => {
    setRequesting(true);
    try {
      // Câmera + mic (apenas requisita e para na hora pra manter permissão)
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((t) => t.stop());
      // Localização (opcional — não bloqueia se o user negar)
      let gps: { lat: number; lng: number; accuracy: number } | null = null;
      try {
        gps = await new Promise<{ lat: number; lng: number; accuracy: number }>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
            (e) => reject(e),
            { enableHighAccuracy: true, timeout: 10000 },
          );
        });
      } catch { /* ignora — user pode ter negado localização */ }
      onReady(gps);
    } catch (err) {
      onError(`permissão negada: ${(err as Error).message}. Habilita câmera e microfone pra prosseguir.`);
    } finally { setRequesting(false); }
  };

  return (
    <div className="space-y-4 text-center">
      <div className="text-5xl">🎬</div>
      <h3 className="font-display text-xl font-black text-white">Permissões necessárias</h3>
      <ul className="mx-auto max-w-sm space-y-2 text-left text-sm text-loog-muted">
        <li>📷 <b className="text-white">Câmera</b> — pra gravar o vídeo</li>
        <li>🎤 <b className="text-white">Microfone</b> — pra captar som do motor + sua narração</li>
        <li>📍 <b className="text-white">Localização</b> (opcional) — pra registrar onde a vistoria foi feita</li>
      </ul>
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={request}
        disabled={requesting}
        className="rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 px-6 py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        {requesting ? "Aguardando…" : "Permitir acesso"}
      </button>
    </div>
  );
}

// ============================================================
// SELFIE STEP
// ============================================================
function SelfieStep({ inspectionId, onNext, onError, error }: {
  inspectionId: string;
  onNext: () => void;
  onError: (msg: string) => void;
  error: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        onError(`câmera frontal: ${(err as Error).message}`);
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onError]);

  const capture = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (blob) setCapturedBlob(blob);
  };

  const confirm = async () => {
    if (!capturedBlob) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("kind", "OPERATOR_SELFIE");
      form.append("file", capturedBlob, "selfie.jpg");
      const r = await fetch(`/api/inspection/${inspectionId}/upload`, { method: "POST", body: form });
      if (!r.ok) throw new Error((await r.json()).error ?? "upload falhou");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onNext();
    } catch (err) {
      onError((err as Error).message);
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h3 className="font-display text-lg font-black text-white">Foto do operador</h3>
        <p className="text-xs text-loog-muted">Tira uma selfie — registra quem está fazendo essa vistoria.</p>
      </div>
      <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-2xl border border-loog-border bg-black">
        {capturedBlob ? (
          <img src={URL.createObjectURL(capturedBlob)} alt="selfie" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} className="h-full w-full scale-x-[-1] object-cover" muted playsInline />
        )}
      </div>
      {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}
      <div className="flex gap-2">
        {capturedBlob ? (
          <>
            <button type="button" onClick={() => setCapturedBlob(null)} className="flex-1 rounded-xl border border-loog-border bg-loog-panel/60 py-3 text-xs text-white">
              Refazer
            </button>
            <button type="button" onClick={confirm} disabled={uploading} className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-xs font-bold text-black disabled:opacity-40">
              {uploading ? "Enviando…" : "✓ Confirmar"}
            </button>
          </>
        ) : (
          <button type="button" onClick={capture} className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 py-3 text-sm font-bold text-white">
            📷 Capturar
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// RECORD STEP — gravação principal com câmera traseira
// ============================================================
function RecordStep({ inspectionId, onTranscript, onNext, onError, error }: {
  inspectionId: string;
  onTranscript: (text: string) => void;
  onNext: () => void;
  onError: (msg: string) => void;
  error: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<SpeechSession | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        onError(`câmera traseira: ${(err as Error).message}`);
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      speechRef.current?.stop();
    };
  }, [onError]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= RECORD_SECONDS) {
          stopRecording();
          return RECORD_SECONDS;
        }
        return e + 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "video/mp4";
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      setRecordedBlob(blob);
      setRecording(false);
    };
    rec.start(1000);
    recorderRef.current = rec;
    setRecording(true);
    setElapsed(0);
    // Speech
    const session = startSpeechRecognition((t) => setLiveTranscript(t));
    speechRef.current = session;
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    const final = speechRef.current?.stop() ?? "";
    setLiveTranscript(final);
    onTranscript(final);
  };

  const confirm = async () => {
    if (!recordedBlob) return;
    setUploading(true);
    try {
      // Upload do vídeo bruto
      setUploadProgress("Enviando vídeo…");
      const videoForm = new FormData();
      videoForm.append("kind", "VIDEO");
      videoForm.append("file", recordedBlob, "video.webm");
      videoForm.append("metadata", JSON.stringify({ duration_s: elapsed }));
      const r1 = await fetch(`/api/inspection/${inspectionId}/upload`, { method: "POST", body: videoForm });
      if (!r1.ok) throw new Error((await r1.json()).error ?? "upload do vídeo falhou");

      // Extrai 10 frames + sobe cada um como FRAME
      setUploadProgress("Extraindo frames do vídeo…");
      const frames = await extractFrames(recordedBlob, 10);
      for (let i = 0; i < frames.length; i++) {
        setUploadProgress(`Enviando frame ${i + 1}/${frames.length}…`);
        const f = new FormData();
        f.append("kind", "FRAME");
        f.append("file", frames[i], `frame-${i}.jpg`);
        f.append("metadata", JSON.stringify({ index: i, total: frames.length }));
        await fetch(`/api/inspection/${inspectionId}/upload`, { method: "POST", body: f });
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onNext();
    } catch (err) {
      onError((err as Error).message);
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h3 className="font-display text-lg font-black text-white">Gravação da vistoria</h3>
        <p className="text-xs text-loog-muted">
          Veículo <b className="text-amber-300">LIGADO</b> · dá uma volta completa · até {RECORD_SECONDS}s
        </p>
      </div>
      <div className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded-2xl border border-loog-border bg-black">
        {recordedBlob ? (
          <video src={URL.createObjectURL(recordedBlob)} className="h-full w-full object-cover" controls playsInline />
        ) : (
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        )}
        {recording && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-1 text-[11px] font-bold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            REC {elapsed}s / {RECORD_SECONDS}s
          </div>
        )}
      </div>
      {liveTranscript && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-2 text-[11px] text-blue-200/80">
          🎤 {liveTranscript.slice(-200)}
        </div>
      )}
      {uploadProgress && <div className="text-center text-[11px] text-amber-300">{uploadProgress}</div>}
      {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}
      <div className="flex gap-2">
        {recordedBlob ? (
          <>
            <button type="button" onClick={() => { setRecordedBlob(null); setElapsed(0); }} className="flex-1 rounded-xl border border-loog-border bg-loog-panel/60 py-3 text-xs text-white">
              Refazer
            </button>
            <button type="button" onClick={confirm} disabled={uploading} className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-xs font-bold text-black disabled:opacity-40">
              {uploading ? "Enviando…" : "✓ Enviar"}
            </button>
          </>
        ) : recording ? (
          <button type="button" onClick={stopRecording} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white">
            ⏹ Parar
          </button>
        ) : (
          <button type="button" onClick={startRecording} className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 py-3 text-sm font-bold text-white">
            🔴 Iniciar gravação
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ODOMETER STEP — foto extra do painel ligado
// ============================================================
function OdometerStep({ inspectionId, onNext, onError, error }: {
  inspectionId: string;
  onNext: () => void;
  onError: (msg: string) => void;
  error: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) { onError((err as Error).message); }
    })();
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [onError]);

  const snap = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const b = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (b) setCaptured(b);
  };

  const confirm = async () => {
    if (!captured) return;
    setUploading(true);
    try {
      const f = new FormData();
      f.append("kind", "ODOMETER_PHOTO");
      f.append("file", captured, "odometer.jpg");
      const r = await fetch(`/api/inspection/${inspectionId}/upload`, { method: "POST", body: f });
      if (!r.ok) throw new Error((await r.json()).error ?? "upload falhou");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onNext();
    } catch (err) { onError((err as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h3 className="font-display text-lg font-black text-white">Foto do odômetro</h3>
        <p className="text-xs text-loog-muted">Painel <b className="text-amber-300">ligado</b> — tira uma foto chapada do km total.</p>
      </div>
      <div className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded-2xl border border-loog-border bg-black">
        {captured ? (
          <img src={URL.createObjectURL(captured)} alt="odômetro" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        )}
      </div>
      {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}
      <div className="flex gap-2">
        {captured ? (
          <>
            <button type="button" onClick={() => setCaptured(null)} className="flex-1 rounded-xl border border-loog-border bg-loog-panel/60 py-3 text-xs text-white">Refazer</button>
            <button type="button" onClick={confirm} disabled={uploading} className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-xs font-bold text-black disabled:opacity-40">
              {uploading ? "Enviando…" : "✓ Enviar e analisar"}
            </button>
          </>
        ) : (
          <button type="button" onClick={snap} className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 py-3 text-sm font-bold text-white">📷 Capturar</button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// PROCESSING + DONE
// ============================================================
function ProcessingStep() {
  return (
    <div className="space-y-4 py-8 text-center">
      <motion.div
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-6xl"
      >
        🤖
      </motion.div>
      <h3 className="font-display text-xl font-black text-white">A IA está analisando…</h3>
      <p className="mx-auto max-w-sm text-sm text-loog-muted">
        Claude Sonnet 4.5 está checando ângulos, placa, odômetro e qualidade. Isso leva uns 15-30 segundos.
      </p>
      <div className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-loog-panel/60">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          style={{ width: "40%" }}
        />
      </div>
    </div>
  );
}

function DoneStep({ resultado, error, onClose }: { resultado: AiResult | null; error: string | null; onClose: () => void }) {
  if (error && !resultado) {
    return (
      <div className="space-y-4 py-6 text-center">
        <div className="text-5xl">⚠️</div>
        <h3 className="font-display text-xl font-black text-white">Deu problema</h3>
        <div className="mx-auto max-w-sm rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>
        <button type="button" onClick={onClose} className="rounded-xl border border-loog-border bg-loog-panel/60 px-6 py-2 text-sm text-white">Fechar</button>
      </div>
    );
  }

  if (!resultado) return null;

  const isApproved = resultado.recommendation === "approve";
  const isReview = resultado.recommendation === "needs_review";

  return (
    <div className="space-y-4 py-4 text-center">
      <div className="text-6xl">{isApproved ? "✅" : isReview ? "⚠️" : "❌"}</div>
      <h3 className="font-display text-xl font-black text-white">
        {isApproved ? "Vistoria aprovada!" : isReview ? "Precisa revisão humana" : "Vistoria reprovada"}
      </h3>
      {resultado.rejectionReason && (
        <div className="mx-auto max-w-sm rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-left text-xs text-rose-200">
          <b>Motivo:</b> {resultado.rejectionReason}
        </div>
      )}
      <div className="mx-auto max-w-sm space-y-1.5 text-left text-xs">
        <Row label="Veículo ligado" ok={resultado.vehicleRunning} />
        <Row label="Placa detectada" ok={!!resultado.detectedPlate} extra={resultado.detectedPlate ?? "—"} />
        <Row label="Placa bate" ok={resultado.plateMatches ?? false} />
        <Row label="Odômetro legível" ok={resultado.odometerReadable} extra={resultado.odometerKm ? `${resultado.odometerKm} km` : undefined} />
        <Row label="Ângulos capturados" ok={resultado.anglesCaptured.length >= 6} extra={`${resultado.anglesCaptured.length}/8`} />
        <Row label="Qualidade geral" ok={["excellent", "good"].includes(resultado.overallQuality)} extra={resultado.overallQuality} />
      </div>
      {resultado.damages.length > 0 && (
        <div className="mx-auto max-w-sm rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-left text-xs text-amber-200">
          <b>Avarias detectadas:</b>
          <ul className="mt-1 list-disc pl-4">
            {resultado.damages.map((d, i) => <li key={i}>{d.description} ({d.severity})</li>)}
          </ul>
        </div>
      )}
      <button type="button" onClick={onClose} className="rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 px-6 py-2 text-sm font-bold text-white">
        OK
      </button>
    </div>
  );
}

function Row({ label, ok, extra }: { label: string; ok: boolean; extra?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-loog-border bg-loog-panel/40 px-3 py-1.5">
      <span className={cn("flex items-center gap-2", ok ? "text-emerald-300" : "text-rose-300")}>
        {ok ? "✓" : "✗"} {label}
      </span>
      {extra && <span className="text-[11px] text-loog-muted">{extra}</span>}
    </div>
  );
}
