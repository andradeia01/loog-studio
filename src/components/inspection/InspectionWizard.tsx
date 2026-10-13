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
  | "record"          // gravação de vídeo com narração (fluxo principal, estilo migração)
  | "odometer"        // foto extra do odômetro
  | "chassis"         // foto do número do chassi (VIN)
  | "engine"          // foto do cofre do motor (capô aberto)
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
  tipoVistoria: "NOVA" | "MIGRACAO";
  migracaoOrigem: string;
}

const RECORD_SECONDS = 60;

export function InspectionWizard({ onClose, onFinished }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleData>({
    placa: "", marca: "", modelo: "", ano: null, cor: "",
    fipeValor: "", fipeCodigo: "",
    nomeAssociado: "", telefoneAssociado: "",
    tipoVistoria: "NOVA", migracaoOrigem: "",
  });
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [transcript, setTranscript] = useState("");
  const [resultado, setResultado] = useState<AiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm"
      style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
    >
      <div className="flex min-h-full w-full sm:items-center sm:justify-center sm:p-4">
        <div className="relative flex min-h-[100dvh] w-full flex-col bg-loog-bg shadow-2xl sm:min-h-0 sm:w-auto sm:max-w-xl sm:rounded-3xl sm:border sm:border-loog-border">
          <div
            className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-loog-border bg-loog-bg/95 p-3 backdrop-blur sm:p-4"
            style={{
              paddingTop: "max(0.75rem, env(safe-area-inset-top))",
              paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right))",
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xl">🎥</span>
              <span className="truncate font-display text-sm font-black text-white">Nova vistoria</span>
              <span className="hidden text-[10px] text-loog-muted sm:inline">· {stepLabel(step)}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-loog-border bg-loog-panel/60 px-3 py-1 text-xs text-loog-muted hover:text-white"
            >
              ✕ Fechar
            </button>
          </div>
          <div className="border-b border-loog-border/50 bg-loog-panel/30 px-3 py-1.5 text-[10px] text-loog-muted sm:hidden">
            {stepLabel(step)}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 p-4 sm:p-5"
              style={{
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                paddingLeft: "max(1rem, env(safe-area-inset-left))",
                paddingRight: "max(1rem, env(safe-area-inset-right))",
              }}
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
              <PhotoCaptureStep
                key="odometer"
                inspectionId={inspectionId}
                kind="ODOMETER_PHOTO"
                title="Foto do odômetro"
                subtitle={<>Painel <b className="text-amber-300">ligado</b> — tira uma foto chapada do km total.</>}
                ctaLabel="Enviar e seguir"
                onNext={() => setStep("chassis")}
                onError={(msg) => setErrorMsg(msg)}
                error={errorMsg}
              />
            )}

            {step === "chassis" && inspectionId && (
              <PhotoCaptureStep
                key="chassis"
                inspectionId={inspectionId}
                kind="CHASSIS_PHOTO"
                title="Foto do chassi (VIN)"
                subtitle={<>Número de <b className="text-amber-300">17 caracteres</b>, gravado na soleira da porta do motorista, parede corta-fogo do motor, longarina ou vidro. Chega bem perto pra ficar legível.</>}
                ctaLabel="Enviar e seguir"
                onNext={() => setStep("engine")}
                onError={(msg) => setErrorMsg(msg)}
                error={errorMsg}
              />
            )}

            {step === "engine" && inspectionId && (
              <PhotoCaptureStep
                key="engine"
                inspectionId={inspectionId}
                kind="ENGINE_PHOTO"
                title="Foto do cofre do motor"
                subtitle={<><b className="text-amber-300">Capô aberto</b> — foto do motor inteiro. A IA vai checar adulterações, soldagem recente e etiqueta de identificação.</>}
                ctaLabel="Enviar e analisar"
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
    </div>
  );
}

function stepLabel(s: Step): string {
  return {
    form: "1/8 Dados do veículo",
    permissions: "2/8 Permissões",
    selfie: "3/8 Foto do operador",
    record: "4/8 Vídeo da vistoria",
    odometer: "5/8 Odômetro",
    chassis: "6/8 Chassi",
    engine: "7/8 Cofre do motor",
    uploading: "Enviando…",
    processing: "8/8 IA analisando",
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
  const [autoFillMsg, setAutoFillMsg] = useState<string | null>(null);

  const tryAutoFill = async () => {
    if (!vehicle.placa || vehicle.placa.length < 6) {
      setAutoFillMsg("Digita a placa completa (7 caracteres).");
      return;
    }
    setAutoFillLoading(true);
    setAutoFillMsg(null);
    try {
      const r = await fetch(`/api/vehicle/lookup?placa=${encodeURIComponent(vehicle.placa)}`);
      const j = await r.json();
      if (!r.ok) {
        setAutoFillMsg(j.message ?? j.error ?? "não achamos essa placa — preencha manualmente");
        return;
      }
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
        setAutoFillMsg(`✓ ${j.vehicle.brand} ${j.vehicle.model} ${j.vehicle.year ?? ""}`);
      }
    } catch (err) {
      setAutoFillMsg(`erro: ${(err as Error).message}`);
    }
    finally { setAutoFillLoading(false); }
  };

  const telDigits = vehicle.telefoneAssociado.replace(/\D/g, "");
  const canProceed =
    vehicle.placa.length >= 6
    && vehicle.nomeAssociado.trim().length >= 2
    && telDigits.length >= 10
    && (vehicle.tipoVistoria === "NOVA" || vehicle.migracaoOrigem.trim().length >= 2);

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
        {autoFillMsg && (
          <div className={cn(
            "mt-2 rounded-lg border px-3 py-1.5 text-[11px]",
            autoFillMsg.startsWith("✓")
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200",
          )}>
            {autoFillMsg}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca" value={vehicle.marca} onChange={(v) => setVehicle({ ...vehicle, marca: v })} />
        <Field label="Modelo" value={vehicle.modelo} onChange={(v) => setVehicle({ ...vehicle, modelo: v })} />
        <Field label="Ano" value={vehicle.ano?.toString() ?? ""} onChange={(v) => setVehicle({ ...vehicle, ano: v ? parseInt(v, 10) : null })} type="number" />
        <Field label="Cor" value={vehicle.cor} onChange={(v) => setVehicle({ ...vehicle, cor: v })} />
      </div>

      <div className="rounded-xl border border-loog-border bg-loog-panel/30 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
          Dados do associado <span className="text-rose-400">*</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome *" value={vehicle.nomeAssociado} onChange={(v) => setVehicle({ ...vehicle, nomeAssociado: v })} />
          <Field label="Telefone *" value={vehicle.telefoneAssociado} onChange={(v) => setVehicle({ ...vehicle, telefoneAssociado: v })} />
        </div>
      </div>

      <div className="rounded-xl border border-loog-border bg-loog-panel/30 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-loog-muted">
          Tipo da vistoria <span className="text-rose-400">*</span>
        </div>
        <select
          value={vehicle.tipoVistoria}
          onChange={(e) => setVehicle({ ...vehicle, tipoVistoria: e.target.value as "NOVA" | "MIGRACAO" })}
          className="w-full rounded-xl border border-loog-border bg-loog-panel/60 px-3 py-2 text-sm text-white outline-none focus:border-purple-500/60"
        >
          <option value="NOVA">🆕 Nova vistoria (primeira adesão)</option>
          <option value="MIGRACAO">🔄 Migração (vem de outra proteção/seguradora)</option>
        </select>
        {vehicle.tipoVistoria === "MIGRACAO" && (
          <div className="mt-3">
            <Field
              label="De onde está migrando *"
              value={vehicle.migracaoOrigem}
              onChange={(v) => setVehicle({ ...vehicle, migracaoOrigem: v })}
            />
            <p className="mt-1 text-[10px] text-loog-muted">
              Nome da seguradora ou associação de origem (ex: Porto Seguro, APVS, Nexus, CMP, Imperium...)
            </p>
          </div>
        )}
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
// RECORD STEP — gravação FULLSCREEN imersiva com câmera traseira
// 6 fases de 10s cada (frontal → lateral esq → traseira → lateral dir → teto → motor)
// Guia visual com HUD por cima do vídeo + progress bar + instruções animadas
// ============================================================

interface Fase { emoji: string; label: string; instrucao: string; inicio: number; fim: number }
const FASES: Fase[] = [
  { emoji: "🚗⬆️", label: "FRONTAL",         instrucao: "Fique de FRENTE pro carro. Enquadre o parachoque, faróis e placa.", inicio: 0,  fim: 10 },
  { emoji: "🚗⬅️", label: "LATERAL ESQUERDA", instrucao: "Vá pra lateral ESQUERDA. Capture do farol até a lanterna traseira.", inicio: 10, fim: 20 },
  { emoji: "🚗⬇️", label: "TRASEIRA",        instrucao: "Fique ATRÁS do carro. Enquadre o parachoque, lanternas e placa.",   inicio: 20, fim: 30 },
  { emoji: "🚗➡️", label: "LATERAL DIREITA",  instrucao: "Vá pra lateral DIREITA. Capture do farol até a lanterna traseira.", inicio: 30, fim: 40 },
  { emoji: "🚗",   label: "TETO",             instrucao: "Suba a câmera e capture o TETO do veículo (dê um passo pra trás).", inicio: 40, fim: 50 },
  { emoji: "🔧",   label: "MOTOR",            instrucao: "Abra o CAPÔ. Enquadre o motor inteiro e narre o que ver.",          inicio: 50, fim: 60 },
];

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
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [isLandscape, setIsLandscape] = useState<boolean | null>(null);
  const [fullscreenMode, setFullscreenMode] = useState(false); // TRUE = modal fullscreen aberto

  // Detecta orientação
  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // Para o stream se usuário desrotacionar (evita travar o browser)
  useEffect(() => {
    if (isLandscape === false && cameraOn && !recording && !recordedBlob) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraOn(false);
      setFullscreenMode(false);
    }
  }, [isLandscape, cameraOn, recording, recordedBlob]);

  // Cleanup geral ao desmontar
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      speechRef.current?.stop();
    };
  }, []);

  // Attach stream ao video element quando ambos estiverem prontos (fix tela preta)
  // Esse padrão evita race condition: às vezes srcObject é setado antes do <video>
  // existir no DOM, ou play() é chamado antes do stream ter frames.
  useEffect(() => {
    const vid = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOn || !vid || !stream) return;

    // Reset limpo
    vid.srcObject = null;
    vid.srcObject = stream;
    vid.muted = true;
    vid.playsInline = true;
    // @ts-expect-error webkit property pra iOS
    vid.webkitPlaysInline = true;

    const tryPlay = async () => {
      try { await vid.play(); } catch (e) {
        console.warn("[vistoria] vid.play falhou:", (e as Error).message);
      }
    };

    // Tenta play em múltiplos eventos pra garantir
    const onLoadedMeta = () => void tryPlay();
    const onCanPlay = () => void tryPlay();
    vid.addEventListener("loadedmetadata", onLoadedMeta);
    vid.addEventListener("canplay", onCanPlay);
    void tryPlay(); // tenta já de cara também

    return () => {
      vid.removeEventListener("loadedmetadata", onLoadedMeta);
      vid.removeEventListener("canplay", onCanPlay);
    };
  }, [cameraOn, fullscreenMode]);

  // Ativa câmera (APÓS user tap em landscape — satisfaz user gesture iOS)
  const activateCamera = async () => {
    if (cameraOn || cameraLoading) return;
    setCameraLoading(true);
    onError("");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      }
      streamRef.current = stream;
      setCameraOn(true);
      setFullscreenMode(true); // abre modal fullscreen imediatamente
    } catch (err) {
      const msg = (err as Error).message || String(err);
      const user = /abort/i.test(msg)
        ? "Câmera não respondeu. Toque de novo em 'Ativar câmera' (iOS às vezes cancela a 1ª tentativa)."
        : /notallowed|permission/i.test(msg)
        ? "Permissão da câmera negada. Vá nas configurações do site e permita câmera + microfone."
        : /notfound|device/i.test(msg)
        ? "Nenhuma câmera encontrada neste aparelho."
        : `Câmera: ${msg}`;
      onError(user);
    } finally {
      setCameraLoading(false);
    }
  };

  // Fase atual baseada no tempo decorrido
  const faseAtual = FASES.find((f) => elapsed >= f.inicio && elapsed < f.fim) ?? FASES[FASES.length - 1];
  const faseIndex = FASES.indexOf(faseAtual);

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

  // Portrait + sem câmera ativa + sem vídeo pronto: bloqueia a tela
  if (!recordedBlob && !recording && !cameraOn && isLandscape === false) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-10 text-center">
        <motion.div
          className="text-7xl"
          animate={{ rotate: [0, 90, 90, 0], scale: [1, 0.9, 0.9, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, times: [0, 0.3, 0.7, 1] }}
        >📱</motion.div>
        <div>
          <h3 className="font-display text-xl font-black text-amber-100">Gire o celular</h3>
          <p className="mt-2 text-sm text-amber-200/90">A vistoria exige o celular na HORIZONTAL<br />pra captar o veículo inteiro.</p>
        </div>
        <p className="text-xs text-amber-200/70">Assim que girar, aperta pra ativar a câmera</p>
      </div>
    );
  }

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ MODO FULLSCREEN: câmera on OU gravando OU vídeo pronto     ║
  // ║ Ocupa tela inteira com HUD por cima — imersivo             ║
  // ╚═══════════════════════════════════════════════════════════╝
  if (fullscreenMode || recordedBlob) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="fixed inset-0 z-[70] flex flex-col bg-black"
        style={{ height: "100dvh" }}
      >
        {/* VÍDEO FULLSCREEN (preview da câmera OU preview gravado) */}
        <div className="relative flex-1 overflow-hidden bg-black">
          {recordedBlob ? (
            <video src={URL.createObjectURL(recordedBlob)} className="h-full w-full object-contain" controls playsInline />
          ) : (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
              autoPlay
            />
          )}

          {/* HUD TOPO: progress + fase atual + fechar */}
          {recording && (
            <div
              className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/90 to-transparent px-4 pb-6 pt-3"
              style={{
                paddingTop: "max(0.75rem, env(safe-area-inset-top))",
                paddingLeft: "max(1rem, env(safe-area-inset-left))",
                paddingRight: "max(1rem, env(safe-area-inset-right))",
              }}
            >
              <div className="flex items-center gap-2 rounded-full bg-red-500/90 px-3 py-1.5 text-xs font-black text-white shadow-lg">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                REC {elapsed}s / {RECORD_SECONDS}s
              </div>
              <div className="flex-1 rounded-full bg-white/15 backdrop-blur">
                <motion.div
                  className="h-2 rounded-full bg-emerald-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${(elapsed / RECORD_SECONDS) * 100}%` }}
                  transition={{ ease: "linear", duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {/* HUD CENTRO: instrução da fase atual (gigante, animada) */}
          {recording && (
            <AnimatePresence mode="wait">
              <motion.div
                key={faseIndex}
                initial={{ opacity: 0, scale: 1.15, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.35 }}
                className="pointer-events-none absolute inset-x-0 top-1/4 flex flex-col items-center gap-2 px-4 text-center"
              >
                <div className="text-6xl drop-shadow-[0_0_20px_rgba(0,0,0,0.8)] sm:text-7xl">{faseAtual.emoji}</div>
                <div className="rounded-xl bg-black/70 px-4 py-2 backdrop-blur-sm">
                  <div className="text-xs font-black uppercase tracking-widest text-emerald-300 sm:text-sm">
                    Fase {faseIndex + 1}/{FASES.length} · {faseAtual.label}
                  </div>
                  <div className="mt-1 max-w-md text-sm font-bold text-white sm:text-base">
                    {faseAtual.instrucao}
                  </div>
                </div>
                {/* Mini-grid das fases com check */}
                <div className="mt-3 flex gap-1">
                  {FASES.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 w-8 rounded-full transition",
                        i < faseIndex ? "bg-emerald-400"
                          : i === faseIndex ? "bg-emerald-400 animate-pulse"
                          : "bg-white/30",
                      )}
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Instrução antes de começar (câmera aberta mas não gravando ainda) */}
          {cameraOn && !recording && !recordedBlob && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm p-6 text-center">
              <div className="rounded-2xl border-2 border-amber-500/60 bg-black/80 p-6">
                <div className="text-5xl">⚠️</div>
                <h3 className="mt-3 font-display text-xl font-black text-amber-200">Antes de começar</h3>
                <ul className="mt-3 space-y-1 text-left text-sm text-white">
                  <li>✓ Veículo <b className="text-amber-300">LIGADO</b> (painel aceso)</li>
                  <li>✓ Narre em voz alta o que mostra</li>
                  <li>✓ 60 segundos no total, 10s por ângulo</li>
                  <li>✓ Siga as instruções que aparecem na tela</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* BARRA INFERIOR: transcript (durante gravação) + botão principal (sempre visível) */}
        <div
          className="shrink-0 bg-gradient-to-t from-black via-black/95 to-black/50 px-4 pb-4 pt-6"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
        >
          {liveTranscript && recording && (
            <div className="mb-3 line-clamp-2 text-center text-xs text-blue-200/90">
              🎤 {liveTranscript.slice(-180)}
            </div>
          )}
          {uploadProgress && <div className="mb-2 text-center text-xs text-amber-300">{uploadProgress}</div>}
          {error && <div className="mb-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-center text-xs text-rose-200">{error}</div>}

          {recordedBlob ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setRecordedBlob(null); setElapsed(0); setFullscreenMode(true); }}
                className="flex-1 rounded-xl border-2 border-white/30 bg-white/10 py-4 text-sm font-bold text-white active:scale-95"
              >↻ Refazer</button>
              <button
                type="button"
                onClick={confirm}
                disabled={uploading}
                className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-4 text-sm font-black text-white shadow-glow disabled:opacity-40 active:scale-95"
              >{uploading ? "Enviando…" : "✓ Enviar vídeo"}</button>
            </div>
          ) : recording ? (
            <button
              type="button"
              onClick={stopRecording}
              className="w-full rounded-xl bg-red-500 py-5 text-base font-black text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] active:scale-95"
            >⏹ Parar gravação</button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 py-5 text-base font-black text-white shadow-[0_0_30px_rgba(168,85,247,0.5)] active:scale-95"
            >🔴 Iniciar gravação ({RECORD_SECONDS}s)</button>
          )}
        </div>
      </motion.div>
    );
  }

  // ─────────────────── MODO INICIAL (antes de ativar câmera) ───────────────────
  return (
    <div
      className="flex flex-col items-center gap-5 py-8 text-center"
      style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
    >
      <motion.div className="text-7xl" animate={{ y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity }}>🎥</motion.div>
      <div>
        <h3 className="font-display text-2xl font-black text-white">Vídeo da vistoria</h3>
        <p className="mt-2 text-sm text-loog-muted">
          Veículo <b className="text-amber-300">LIGADO</b> · dá uma volta completa<br />
          <span className="text-[11px]">6 fases guiadas de 10s cada = {RECORD_SECONDS}s total</span>
        </p>
      </div>
      <ul className="w-full max-w-sm space-y-1 rounded-xl border border-loog-border bg-loog-panel/40 p-3 text-left text-xs text-loog-muted">
        {FASES.map((f, i) => (
          <li key={f.label} className="flex items-center gap-2">
            <span className="w-6 text-center">{f.emoji}</span>
            <span className="font-bold text-white">{f.label}</span>
            <span className="ml-auto text-[10px]">{f.inicio}-{f.fim}s</span>
          </li>
        ))}
      </ul>
      {error && <div className="w-full max-w-sm rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}
      <button
        type="button"
        onClick={activateCamera}
        disabled={cameraLoading}
        className="w-full max-w-sm rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 py-5 text-base font-black text-white shadow-glow disabled:opacity-40 active:scale-95"
      >
        {cameraLoading ? "Ativando câmera..." : "📷 Ativar câmera e começar"}
      </button>
      <p className="text-[11px] text-loog-muted">
        A câmera só liga depois que você tocar no botão (segurança do iOS).
      </p>
    </div>
  );
}

// ============================================================
// PHOTO CAPTURE STEP — reutilizável (odômetro, chassi, cofre do motor)
// ============================================================
function PhotoCaptureStep({ inspectionId, kind, title, subtitle, ctaLabel, onNext, onError, error }: {
  inspectionId: string;
  kind: "ODOMETER_PHOTO" | "CHASSIS_PHOTO" | "ENGINE_PHOTO";
  title: string;
  subtitle: React.ReactNode;
  ctaLabel: string;
  onNext: () => void | Promise<void>;
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
      f.append("kind", kind);
      f.append("file", captured, `${kind.toLowerCase()}.jpg`);
      const r = await fetch(`/api/inspection/${inspectionId}/upload`, { method: "POST", body: f });
      if (!r.ok) throw new Error((await r.json()).error ?? "upload falhou");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      await onNext();
    } catch (err) { onError((err as Error).message); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h3 className="font-display text-lg font-black text-white">{title}</h3>
        <p className="text-xs text-loog-muted">{subtitle}</p>
      </div>
      <div className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded-2xl border border-loog-border bg-black">
        {captured ? (
          <img src={URL.createObjectURL(captured)} alt={title} className="h-full w-full object-cover" />
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
              {uploading ? "Enviando…" : `✓ ${ctaLabel}`}
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
        <Row label="Chassi legível" ok={resultado.chassisReadable} extra={resultado.chassisNumber ?? "—"} />
        <Row label="Cofre do motor" ok={resultado.engineBayVisible && resultado.engineBayCondition !== "irregularidades"} extra={resultado.engineBayCondition} />
        <Row label="Ângulos capturados" ok={resultado.anglesCaptured.length >= 6} extra={`${resultado.anglesCaptured.length}/8`} />
        <Row label="Qualidade geral" ok={["excellent", "good"].includes(resultado.overallQuality)} extra={resultado.overallQuality} />
      </div>
      {resultado.engineBayObservations.length > 0 && (
        <div className="mx-auto max-w-sm rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-left text-[11px] text-blue-200/80">
          <b>Observações do motor:</b>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {resultado.engineBayObservations.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </div>
      )}
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
