/**
 * Extrai N frames de um Blob de vídeo usando apenas <video> + <canvas>.
 * Zero deps externas. Roda 100% client-side.
 */
export async function extractFrames(videoBlob: Blob, numFrames = 10): Promise<Blob[]> {
  const url = URL.createObjectURL(videoBlob);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Falha ao carregar vídeo"));
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Duração do vídeo inválida");
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth || 1280, 1280);
    canvas.height = Math.min(video.videoHeight || 720, 720);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context indisponível");

    const frames: Blob[] = [];
    // Pula o 1º frame (fica preto às vezes) e o último (idem)
    for (let i = 0; i < numFrames; i++) {
      const t = (duration * (i + 0.5)) / numFrames;
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85),
      );
      if (blob) frames.push(blob);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("error", onError);
      reject(new Error("Falha ao buscar frame"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

/** Blob → base64 (sem o prefixo data:) */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Falha ao ler blob"));
    reader.readAsDataURL(blob);
  });
}
