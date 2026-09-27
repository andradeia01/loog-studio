"use client";

import { useEffect, useRef, useState } from "react";
import { cn, slugify, timestamp } from "@/lib/utils";

/**
 * Editor de vídeo MVP — client-only.
 *
 * Fluxo:
 *  1. Consultor sobe 1 vídeo (mp4/webm/mov)
 *  2. Ajusta trim (in/out)
 *  3. Opcional: sobe trilha (mp3/wav) e ajusta volume dela vs original
 *  4. Opcional: texto overlay (topo/bottom, cor, tamanho)
 *  5. Exporta: MediaRecorder grava canvas + audio mixado em .webm
 *
 * Notas:
 *  - Formato de saída: 1080x1920 (9:16 Reel). Escala proporcional.
 *  - Preview: <video> escondido + <audio> escondido + <canvas> visível.
 *  - Áudio: Web Audio API mistura vídeo + trilha; MediaStreamDestination
 *    é o destino que o MediaRecorder captura.
 */
export function VideoEditor() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimIn, setTrimIn] = useState(0);
  const [trimOut, setTrimOut] = useState(0);
  const [videoVol, setVideoVol] = useState(1);
  const [musicVol, setMusicVol] = useState(0.5);
  const [text, setText] = useState("");
  const [textPos, setTextPos] = useState<"top" | "bottom">("top");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [textBg, setTextBg] = useState("rgba(0,0,0,0.55)");
  const [fontSize, setFontSize] = useState(48);
  const [format, setFormat] = useState<"9x16" | "1x1" | "16x9">("9x16");
  const [preview, setPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // dimensões output
  const OUT = format === "9x16" ? { w: 1080, h: 1920 } : format === "1x1" ? { w: 1080, h: 1080 } : { w: 1920, h: 1080 };
  const canvasScale = 0.35; // preview em ~35% do output real
  const previewW = Math.round(OUT.w * canvasScale);
  const previewH = Math.round(OUT.h * canvasScale);

  useEffect(() => {
    if (!videoFile) { setVideoUrl(""); return; }
    const u = URL.createObjectURL(videoFile);
    setVideoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [videoFile]);

  useEffect(() => {
    if (!audioFile) { setAudioUrl(""); return; }
    const u = URL.createObjectURL(audioFile);
    setAudioUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [audioFile]);

  // ao carregar metadata do vídeo, seta duração e trim inicial
  function onVideoMeta() {
    const v = videoRef.current;
    if (!v) return;
    setVideoDuration(v.duration);
    setTrimIn(0);
    setTrimOut(v.duration);
    drawFrame();
  }

  // desenha 1 frame no canvas (preview)
  function drawFrame() {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = OUT.w;
    canvas.height = OUT.h;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, OUT.w, OUT.h);
    if (video.videoWidth) drawVideoCover(ctx, video, OUT.w, OUT.h);
    drawTextOverlay(ctx, OUT.w, OUT.h);
  }

  // preview animation loop
  useEffect(() => {
    function tick() {
      drawFrame();
      rafRef.current = requestAnimationFrame(tick);
    }
    if (preview) rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, text, textPos, textColor, textBg, fontSize, format]);

  function drawVideoCover(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, w: number, h: number) {
    const vr = v.videoWidth / v.videoHeight;
    const cr = w / h;
    let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
    if (vr > cr) {
      sw = v.videoHeight * cr;
      sx = (v.videoWidth - sw) / 2;
    } else {
      sh = v.videoWidth / cr;
      sy = (v.videoHeight - sh) / 2;
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
  }

  function drawTextOverlay(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!text.trim()) return;
    const padding = 40;
    const boxH = fontSize * 2.2;
    const y = textPos === "top" ? padding : h - boxH - padding;
    ctx.fillStyle = textBg;
    ctx.fillRect(padding, y, w - padding * 2, boxH);
    ctx.fillStyle = textColor;
    ctx.font = `700 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // quebra simples
    const maxWidth = w - padding * 3;
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const wd of words) {
      const trial = cur ? cur + " " + wd : wd;
      if (ctx.measureText(trial).width > maxWidth) {
        if (cur) lines.push(cur);
        cur = wd;
      } else cur = trial;
    }
    if (cur) lines.push(cur);
    const totalH = lines.length * fontSize * 1.15;
    let ly = y + (boxH - totalH) / 2 + fontSize * 0.575;
    for (const line of lines) {
      ctx.fillText(line, w / 2, ly);
      ly += fontSize * 1.15;
    }
  }

  async function startPreview() {
    setPreview(true);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = trimIn;
    v.volume = videoVol;
    await v.play().catch(() => {});
    if (audioRef.current && audioUrl) {
      audioRef.current.volume = musicVol;
      audioRef.current.currentTime = 0;
      await audioRef.current.play().catch(() => {});
    }
    // parar em trimOut
    const check = () => {
      if (!videoRef.current) return;
      if (videoRef.current.currentTime >= trimOut) {
        videoRef.current.pause();
        if (audioRef.current) audioRef.current.pause();
        setPreview(false);
      } else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }
  function stopPreview() {
    setPreview(false);
    videoRef.current?.pause();
    audioRef.current?.pause();
  }

  async function exportVideo() {
    const v = videoRef.current;
    const canvas = canvasRef.current;
    if (!v || !canvas) return;
    if (!videoFile) return;

    setExporting(true);
    setExportProgress(0);
    setExportUrl(null);
    setError(null);

    try {
      // 1. setup canvas com dimensões finais
      canvas.width = OUT.w;
      canvas.height = OUT.h;
      const stream = canvas.captureStream(30);

      // 2. audio mixado via WebAudio
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AC();
      const destination = audioCtx.createMediaStreamDestination();

      // audio do vídeo
      const videoSource = audioCtx.createMediaElementSource(v);
      const videoGain = audioCtx.createGain();
      videoGain.gain.value = videoVol;
      videoSource.connect(videoGain).connect(destination);
      // videoGain.connect(audioCtx.destination); // eco enquanto grava? deixa mudo

      // trilha
      if (audioRef.current && audioUrl) {
        const ms = audioCtx.createMediaElementSource(audioRef.current);
        const mg = audioCtx.createGain();
        mg.gain.value = musicVol;
        ms.connect(mg).connect(destination);
      }
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);

      // 3. MediaRecorder — escolhe melhor mime
      const mimes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

      const doneP = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
      });

      // 4. rodar preview + captura frame a frame
      v.currentTime = trimIn;
      v.volume = 0; // muta o element (o áudio vai por audioCtx)
      if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.volume = 0; }

      recorder.start();
      const total = trimOut - trimIn;
      const start = Date.now();

      await v.play();
      if (audioRef.current && audioUrl) await audioRef.current.play().catch(() => {});

      await new Promise<void>((resolve) => {
        const tick = () => {
          drawFrame();
          const elapsed = (Date.now() - start) / 1000;
          setExportProgress(Math.min(100, Math.round((elapsed / total) * 100)));
          if (v.currentTime >= trimOut || elapsed >= total + 0.5) {
            v.pause();
            audioRef.current?.pause();
            recorder.stop();
            resolve();
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      const blob = await doneP;
      audioCtx.close();
      const url = URL.createObjectURL(blob);
      setExportUrl(url);
      setExportProgress(100);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  async function download() {
    if (!exportUrl) return;
    const r = await fetch(exportUrl);
    const blob = await r.blob();
    const filename = `LOOG-EDITOR-${timestamp()}.webm`;
    const file = new File([blob], filename, { type: "video/webm" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try { await nav.share({ files: [file], title: filename }); return; } catch {}
    }
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Sidebar controles */}
      <aside className="space-y-4">
        <div className="card space-y-3 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">1. Arquivos</h3>
          <div>
            <label className="label mb-1.5">Vídeo</label>
            <input type="file" accept="video/*" className="input !py-2" onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label className="label mb-1.5">Trilha sonora (opcional)</label>
            <input type="file" accept="audio/*" className="input !py-2" onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label className="label mb-1.5">Formato de saída</label>
            <select className="input" value={format} onChange={(e) => { setFormat(e.target.value as typeof format); }}>
              <option value="9x16">9:16 (Reel/Story)</option>
              <option value="1x1">1:1 (Feed)</option>
              <option value="16x9">16:9 (Landscape)</option>
            </select>
          </div>
        </div>

        {videoDuration > 0 && (
          <div className="card space-y-3 p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">2. Corte (trim)</h3>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span>Início</span>
                <span className="text-loog-muted">{trimIn.toFixed(2)}s</span>
              </div>
              <input type="range" min={0} max={videoDuration} step={0.1} value={trimIn}
                onChange={(e) => setTrimIn(Math.min(parseFloat(e.target.value), trimOut - 0.5))}
                className="w-full" />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span>Fim</span>
                <span className="text-loog-muted">{trimOut.toFixed(2)}s</span>
              </div>
              <input type="range" min={0} max={videoDuration} step={0.1} value={trimOut}
                onChange={(e) => setTrimOut(Math.max(parseFloat(e.target.value), trimIn + 0.5))}
                className="w-full" />
            </div>
            <p className="text-[10px] text-loog-muted">Duração final: {(trimOut - trimIn).toFixed(2)}s</p>
          </div>
        )}

        <div className="card space-y-3 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">3. Áudio</h3>
          <RangeLabel label="Volume do vídeo" value={videoVol} onChange={setVideoVol} />
          <RangeLabel label="Volume da trilha" value={musicVol} onChange={setMusicVol} disabled={!audioFile} />
        </div>

        <div className="card space-y-3 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">4. Texto overlay</h3>
          <textarea className="input min-h-[60px] resize-y" placeholder="Texto que aparece no vídeo"
            value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
          <div className="grid grid-cols-2 gap-2">
            <select className="input !py-1 !text-xs" value={textPos} onChange={(e) => setTextPos(e.target.value as "top" | "bottom")}>
              <option value="top">Topo</option>
              <option value="bottom">Rodapé</option>
            </select>
            <input type="color" className="input !p-1" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
          </div>
          <RangeLabel label="Tamanho da fonte" value={fontSize / 100} onChange={(v) => setFontSize(Math.round(v * 100))}
            format={() => `${fontSize}px`} />
        </div>

        <div className="card space-y-3 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">5. Exportar</h3>
          {!exporting && !exportUrl && (
            <button type="button" className="btn-primary w-full !py-2 !text-sm"
              disabled={!videoFile}
              onClick={exportVideo}>
              🎬 Renderizar e baixar
            </button>
          )}
          {exporting && (
            <div>
              <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-loog-border">
                <div className="h-full bg-loog-brand" style={{ width: `${exportProgress}%` }} />
              </div>
              <div className="text-xs text-loog-muted">Gravando… {exportProgress}%</div>
            </div>
          )}
          {exportUrl && (
            <>
              <video src={exportUrl} controls className="w-full rounded-lg border border-loog-border" />
              <button type="button" className="btn-primary w-full !py-2 !text-xs" onClick={download}>
                📥 Baixar / Compartilhar (WebM)
              </button>
              <button type="button" className="btn-ghost w-full !py-2 !text-xs" onClick={() => setExportUrl(null)}>
                Editar de novo
              </button>
            </>
          )}
          {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </div>
      </aside>

      {/* Preview */}
      <div className="space-y-4">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Preview</h3>
            {videoFile && !exporting && (
              <div className="flex gap-2">
                {!preview ? (
                  <button type="button" className="btn-primary !py-1.5 !text-xs" onClick={startPreview}>▶ Reproduzir</button>
                ) : (
                  <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={stopPreview}>■ Parar</button>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-center bg-black p-4">
            <canvas ref={canvasRef} style={{ width: previewW, height: previewH, maxWidth: "100%" }}
              className="rounded-lg border border-loog-border/40" />
          </div>
          <p className="mt-3 text-xs text-loog-muted">
            Nota: o export é feito no seu navegador (nada sobe pro servidor). Formato de saída: WebM VP9 com áudio Opus.
            Se seu app final precisar de MP4, converte com <code>ffmpeg</code> ou <code>CloudConvert</code>.
          </p>
        </div>

        {/* Elementos ocultos */}
        <video
          ref={videoRef}
          src={videoUrl}
          onLoadedMetadata={onVideoMeta}
          crossOrigin="anonymous"
          playsInline
          className="hidden"
        />
        {audioUrl && <audio ref={audioRef} src={audioUrl} crossOrigin="anonymous" className="hidden" loop />}
      </div>
    </div>
  );
}

function RangeLabel({
  label, value, onChange, format, disabled,
}: { label: string; value: number; onChange: (v: number) => void; format?: () => string; disabled?: boolean }) {
  return (
    <label className={cn("block text-xs", disabled && "opacity-40")}>
      <div className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-loog-muted">{format ? format() : `${Math.round(value * 100)}%`}</span>
      </div>
      <input type="range" min={0} max={1} step={0.05} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} disabled={disabled} className="w-full" />
    </label>
  );
}
