"use client";

import { useEffect, useState } from "react";
import { useInspectionStore } from "@/lib/inspection-store";
import type { InspectionContext } from "@/lib/mock-tokens";
import { Button } from "@/components/ui/button";
import { apiUpload } from "@/lib/api-client";
import { extractFrames, type ExtractedFrame } from "@/lib/frame-extractor";

interface AnalysisResult {
  skipped?: boolean;
  reason?: string;
  vehicleDetected?: boolean;
  vehicleDescription?: string;
  matchesExpected?: boolean;
  anglesCaptured?: string[];
  anglesMissing?: string[];
  detectedPlate?: string | null;
  plateMatches?: boolean | null;
  overallQuality?: "excellent" | "good" | "poor" | "unusable";
  qualityIssues?: string[];
  topVisible?: boolean;
  framesAnalyzed?: number;
  modelUsed?: string;
  reasoning?: string;
  error?: string;
}

export function VideoReview({ ctx }: { ctx: InspectionContext }) {
  const videoUrl = useInspectionStore((s) => s.videoBlobUrl);
  const durationMs = useInspectionStore((s) => s.videoDurationMs);
  const videoBlob = useInspectionStore((s) => s.videoBlob);
  const serverInspectionId = useInspectionStore((s) => s.serverInspectionId);
  const gpsLat = useInspectionStore((s) => s.gpsLat);
  const gpsLng = useInspectionStore((s) => s.gpsLng);
  const setStep = useInspectionStore((s) => s.setStep);
  const clearVideo = useInspectionStore((s) => s.clearVideo);
  const setError = useInspectionStore((s) => s.setError);

  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [extracting, setExtracting] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const sizeMb = videoBlob ? (videoBlob.size / 1024 / 1024).toFixed(1) : "?";
  const seconds = durationMs ? Math.round(durationMs / 1000) : 0;
  const hasExtras = ctx.template.requiredExtraCaptures.length > 0;

  // Extrai frames assim que o vídeo chega
  useEffect(() => {
    if (!videoBlob) return;
    setExtracting(true);
    extractFrames(videoBlob, 6)
      .then(setFrames)
      .catch((err) => {
        console.error("extract failed", err);
      })
      .finally(() => setExtracting(false));
  }, [videoBlob]);

  async function runAnalysis() {
    if (!videoBlob || !serverInspectionId || frames.length === 0) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const r = await fetch(`/api/inspection/${serverInspectionId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames: frames.map((f) => ({
            index: f.index,
            timestampMs: f.timestampMs,
            dataUrl: f.dataUrl,
          })),
          context: {
            brand: ctx.vehicleBrand,
            model: ctx.vehicleModel,
            plate: ctx.vehiclePlate,
            vehicleType: ctx.vehicleType,
            requiredAngles: ctx.template.requiredVideoAngles,
          },
        }),
      });
      const data = (await r.json()) as AnalysisResult;
      setAnalysis(data);
    } catch (err) {
      setAnalysis({ error: err instanceof Error ? err.message : "Falha na análise" });
    } finally {
      setAnalyzing(false);
    }
  }

  function retake() {
    clearVideo();
    setStep("video_record");
  }

  async function next() {
    if (!videoBlob || !serverInspectionId) {
      setStep(hasExtras ? "extra_capture" : "processing");
      return;
    }
    setUploading(true);
    try {
      await apiUpload(serverInspectionId, videoBlob, {
        kind: "VIDEO",
        angleOrExtra: "VIDEO_360",
        durationMs: durationMs ?? undefined,
        gpsLat,
        gpsLng,
      });
      setStep(hasExtras ? "extra_capture" : "processing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar vídeo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="flex-1 flex flex-col px-6 py-8">
      <header className="flex items-center justify-between mb-5">
        <h1 className="font-display text-xl font-semibold">Verificação do vídeo</h1>
        <span className="font-mono text-xs text-chromeMid">
          {seconds}s · {sizeMb} MB
        </span>
      </header>

      <div className="bg-surface rounded-2xl overflow-hidden border border-chromeLo mb-5">
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            playsInline
            className="w-full max-h-[36dvh] object-contain bg-black"
          />
        ) : (
          <div className="text-chromeMid p-8 text-center">Sem vídeo</div>
        )}
      </div>

      {/* Frames extraídos */}
      <section className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-semibold">
            Frames extraídos ({frames.length}/6)
          </h2>
          {extracting && <span className="text-xs text-chromeMid">extraindo…</span>}
        </div>
        {extracting ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="shimmer aspect-video rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {frames.map((f) => (
              <figure key={f.index} className="relative">
                <img
                  src={f.dataUrl}
                  alt={`Frame ${f.index}`}
                  className="w-full aspect-video object-cover rounded-lg border border-chromeLo"
                />
                <figcaption className="absolute bottom-1 left-1 bg-black/70 backdrop-blur px-1.5 py-0.5 rounded text-[9px] font-mono text-white">
                  {(f.timestampMs / 1000).toFixed(1)}s
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* Análise com IA */}
      {!analysis && !extracting && (
        <Button
          variant="chrome"
          onClick={runAnalysis}
          disabled={analyzing || frames.length === 0}
          className="mb-5"
        >
          {analyzing ? "Analisando com IA…" : "🔍 Analisar com IA (teste)"}
        </Button>
      )}

      {analysis && <AnalysisCard analysis={analysis} />}

      <div className="mt-auto space-y-3 pt-4">
        <Button variant="cobalt" onClick={next} disabled={uploading || extracting}>
          {uploading ? "Enviando vídeo…" : "Continuar →"}
        </Button>
        <Button variant="ghost" onClick={retake} disabled={uploading}>
          Gravar de novo
        </Button>
      </div>
    </section>
  );
}

function AnalysisCard({ analysis }: { analysis: AnalysisResult }) {
  if (analysis.error) {
    return (
      <div className="bg-statusLate/10 border border-statusLate/40 rounded-xl p-4 mb-5">
        <p className="text-statusLate font-semibold mb-1">Erro na análise</p>
        <p className="text-xs text-chromeMid">{analysis.error}</p>
      </div>
    );
  }

  if (analysis.skipped) {
    return (
      <div className="bg-statusPending/10 border border-statusPending/40 rounded-xl p-4 mb-5">
        <p className="text-statusPending font-semibold mb-1">⚠ IA não configurada</p>
        <p className="text-xs text-chromeMid">
          {analysis.reason ?? "ANTHROPIC_API_KEY não setada no servidor."}
        </p>
        <p className="text-xs text-chromeMid mt-2">
          Os frames foram salvos no servidor para análise manual pelo admin.
        </p>
      </div>
    );
  }

  const qualityColor =
    analysis.overallQuality === "excellent"
      ? "text-statusPaid"
      : analysis.overallQuality === "good"
      ? "text-cobalt"
      : analysis.overallQuality === "poor"
      ? "text-statusPending"
      : "text-statusLate";

  return (
    <div className="bg-surface border border-chromeLo rounded-xl p-4 mb-5 space-y-3 text-sm">
      <div className="flex items-center justify-between pb-2 border-b border-chromeLo">
        <span className="font-display font-semibold">Análise IA</span>
        <span className={`uppercase text-xs font-mono tracking-wider ${qualityColor}`}>
          {analysis.overallQuality}
        </span>
      </div>

      <KV label="Veículo detectado" value={analysis.vehicleDetected ? "Sim" : "Não"} />
      {analysis.vehicleDescription && (
        <KV label="Descrição" value={analysis.vehicleDescription} />
      )}
      <KV
        label="Corresponde ao esperado"
        value={analysis.matchesExpected ? "Sim" : "Não"}
        valueClass={analysis.matchesExpected ? "text-statusPaid" : "text-statusLate"}
      />
      {analysis.detectedPlate && (
        <KV
          label="Placa detectada"
          value={analysis.detectedPlate}
          mono
          valueClass={analysis.plateMatches ? "text-statusPaid" : "text-statusPending"}
        />
      )}
      <KV
        label="Ângulos capturados"
        value={analysis.anglesCaptured?.join(", ") || "—"}
        mono
      />
      {analysis.anglesMissing && analysis.anglesMissing.length > 0 && (
        <KV
          label="Faltam"
          value={analysis.anglesMissing.join(", ")}
          mono
          valueClass="text-statusLate"
        />
      )}
      <KV label="Teto visível" value={analysis.topVisible ? "Sim" : "Não"} />

      {analysis.qualityIssues && analysis.qualityIssues.length > 0 && (
        <div>
          <p className="text-chromeMid text-xs uppercase font-mono mb-1">Problemas</p>
          <ul className="text-xs space-y-1">
            {analysis.qualityIssues.map((q, i) => (
              <li key={i} className="text-statusPending">
                • {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.reasoning && (
        <p className="text-xs text-chromeMid italic pt-2 border-t border-chromeLo">
          {analysis.reasoning}
        </p>
      )}
      {analysis.modelUsed && (
        <p className="text-[10px] text-chromeLo font-mono pt-1">
          {analysis.modelUsed} · {analysis.framesAnalyzed} frames
        </p>
      )}
    </div>
  );
}

function KV({
  label,
  value,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-start gap-3 text-sm">
      <span className="text-chromeMid shrink-0">{label}</span>
      <span className={`text-right ${mono ? "font-mono text-xs" : ""} ${valueClass ?? "text-chromeHi"}`}>
        {value}
      </span>
    </div>
  );
}
