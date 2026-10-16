import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface VideoProbe {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  orientation: "landscape" | "portrait" | "square";
  codec: string;
}

/** Lê metadata do vídeo com ffprobe (vem com ffmpeg). */
export async function probeVideo(filePath: string): Promise<VideoProbe> {
  const args = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate,codec_name:format=duration",
    "-of",
    "json",
    filePath,
  ];
  const out = await runCmd("ffprobe", args);
  const parsed = JSON.parse(out) as {
    streams?: Array<{
      width?: number;
      height?: number;
      r_frame_rate?: string;
      codec_name?: string;
    }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0] ?? {};
  const width = stream.width ?? 0;
  const height = stream.height ?? 0;
  const [num, den] = (stream.r_frame_rate ?? "0/1").split("/").map(Number);
  const fps = den && den !== 0 ? (num ?? 0) / den : 0;
  const durationSec = parsed.format?.duration ? Number(parsed.format.duration) : 0;
  return {
    durationSec,
    width,
    height,
    fps,
    orientation: width > height ? "landscape" : width < height ? "portrait" : "square",
    codec: stream.codec_name ?? "unknown",
  };
}

/**
 * Extrai N frames espaçados uniformemente do vídeo.
 * Grava JPEGs em `outDir` com nome frame-00.jpg, frame-01.jpg, ...
 * Retorna lista com {index, timestampMs, filePath}.
 */
export async function extractFrames(
  videoPath: string,
  outDir: string,
  options: {
    maxFrames?: number;
    intervalSec?: number;
    maxWidth?: number;
    quality?: number;
  } = {},
): Promise<Array<{ index: number; timestampMs: number; filePath: string }>> {
  await fs.mkdir(outDir, { recursive: true });
  const probe = await probeVideo(videoPath);
  const maxFrames = options.maxFrames ?? 40;
  const quality = options.quality ?? 3; // qscale 2-5 (2=higher quality)
  const maxWidth = options.maxWidth ?? 960;

  // Determine timestamps: either interval-based or uniform count
  const interval = options.intervalSec ?? Math.max(1, probe.durationSec / maxFrames);
  const effectiveCount = Math.min(maxFrames, Math.floor(probe.durationSec / interval));
  const timestamps: number[] = [];
  for (let i = 0; i < effectiveCount; i++) {
    timestamps.push((i + 0.5) * interval);
  }
  if (timestamps.length === 0) timestamps.push(probe.durationSec / 2);

  const results: Array<{ index: number; timestampMs: number; filePath: string }> = [];

  // Extract each frame via -ss + -frames:v 1 (fast seek)
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i]!;
    const outFile = path.join(outDir, `frame-${String(i).padStart(2, "0")}.jpg`);
    const args = [
      "-ss",
      t.toFixed(2),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      `scale='min(${maxWidth},iw)':-2`,
      "-q:v",
      String(quality),
      "-y",
      outFile,
    ];
    await runCmd("ffmpeg", args);
    results.push({ index: i, timestampMs: Math.round(t * 1000), filePath: outFile });
  }

  return results;
}

function runCmd(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: false });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}\n${stderr.slice(0, 2000)}`));
    });
  });
}
