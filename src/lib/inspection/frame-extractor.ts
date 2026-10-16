"use client";

export interface ExtractedFrame {
  index: number;
  timestampMs: number;
  dataUrl: string;      // base64 jpeg
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Extrai N frames espaçados uniformemente de um vídeo blob.
 * Usa um <video> + <canvas> em memória — zero deps externas, roda em qualquer browser moderno.
 */
export async function extractFrames(
  videoBlob: Blob,
  count = 6,
  maxWidth = 1280,
  quality = 0.85,
): Promise<ExtractedFrame[]> {
  const url = URL.createObjectURL(videoBlob);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Falha ao carregar o vídeo para extração"));
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0.1) {
      throw new Error("Vídeo com duração inválida (menos de 100ms)");
    }

    // 6 timestamps distribuídos: evita exatamente 0 e exatamente duration
    const timestamps = Array.from({ length: count }, (_, i) => {
      const ratio = (i + 0.5) / count; // 0.08, 0.25, 0.42, 0.58, 0.75, 0.92 para count=6
      return ratio * duration;
    });

    const frames: ExtractedFrame[] = [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D não disponível");

    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i]!;
      await seekTo(video, t);

      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const scale = vw > maxWidth ? maxWidth / vw : 1;
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", quality),
      );

      frames.push({
        index: i,
        timestampMs: Math.round(t * 1000),
        dataUrl,
        blob,
        width: canvas.width,
        height: canvas.height,
      });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("Falha no seek"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = Math.max(0, Math.min(video.duration - 0.001, timeSec));
  });
}
