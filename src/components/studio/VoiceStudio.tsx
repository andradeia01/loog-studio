"use client";

import { useEffect, useRef, useState } from "react";
import { cn, slugify, timestamp } from "@/lib/utils";

interface Voice {
  id: string;
  name: string;
  accent: string;
}

export function VoiceStudio() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState<string>("");
  const [text, setText] = useState("");
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);
  const [style, setStyle] = useState(0.35);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch("/api/ai/voice")
      .then((r) => r.json())
      .then((d) => {
        setVoices(d.voices ?? []);
        if (d.voices?.[0]) setVoiceId(d.voices[0].id);
      })
      .catch(() => setError("Falha ao carregar vozes."));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    try {
      const res = await fetch("/api/ai/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: voiceId,
          stability,
          similarity_boost: similarity,
          style,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const cost = parseFloat(res.headers.get("X-Cost-USD") ?? "0");
      setLastCost(cost);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setTimeout(() => audioRef.current?.play().catch(() => {}), 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  }

  async function download() {
    if (!audioUrl) return;
    try {
      const r = await fetch(audioUrl);
      const blob = await r.blob();
      const filename = `LOOG-VOZ-${slugify(voices.find((v) => v.id === voiceId)?.name ?? "voz")}-${timestamp()}.mp3`;
      const file = new File([blob], filename, { type: "audio/mpeg" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try { await nav.share({ files: [file], title: filename }); return; } catch {}
      }
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch (err) { console.error(err); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="card p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Vozes disponíveis</h3>
        <ul className="space-y-1">
          {voices.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setVoiceId(v.id)}
                className={cn(
                  "flex w-full flex-col rounded-lg px-3 py-2 text-left transition",
                  voiceId === v.id ? "bg-loog-brand text-white" : "hover:bg-white/5",
                )}
              >
                <span className="text-sm font-semibold">{v.name}</span>
                <span className={cn("text-[11px]", voiceId === v.id ? "text-white/80" : "text-loog-muted")}>{v.accent}</span>
              </button>
            </li>
          ))}
          {voices.length === 0 && (
            <li className="rounded-lg border border-dashed border-loog-border p-3 text-xs text-loog-muted">
              Nenhuma voz disponível. Peça pro admin adicionar a API key da ElevenLabs em /admin/config.
            </li>
          )}
        </ul>
      </aside>

      <div className="space-y-4">
        <form onSubmit={submit} className="card space-y-4 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Narração IA (ElevenLabs)</h2>
          <div>
            <label className="label mb-1.5">Texto a narrar</label>
            <textarea
              className="input min-h-[160px] resize-y"
              placeholder="Cole aqui o roteiro que você quer transformar em voz. Máximo 3000 caracteres."
              maxLength={3000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
            <p className="mt-1 text-[10px] text-loog-muted">
              {text.length}/3000 caracteres · custo estimado ~US$ {(text.length * 0.00003).toFixed(4)}
            </p>
          </div>

          <details className="rounded-lg border border-loog-border p-3">
            <summary className="cursor-pointer text-xs font-semibold text-loog-muted">Ajustes finos (opcional)</summary>
            <div className="mt-3 space-y-3">
              <RangeInput label="Estabilidade" value={stability} onChange={setStability} help="Baixo = mais expressivo; Alto = mais consistente." />
              <RangeInput label="Similaridade" value={similarity} onChange={setSimilarity} help="Fidelidade à voz original." />
              <RangeInput label="Estilo" value={style} onChange={setStyle} help="Quanto o modelo exagera na entonação." />
            </div>
          </details>

          <button type="submit" className="btn-primary w-full !py-2" disabled={loading || !voiceId}>
            {loading ? "Gerando narração…" : "🎙️ Gerar voz"}
          </button>
          {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </form>

        {audioUrl && (
          <div className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Preview</h3>
              {lastCost !== null && <span className="text-[10px] text-loog-muted">custo: US$ {lastCost.toFixed(4)}</span>}
            </div>
            <audio ref={audioRef} src={audioUrl} controls className="w-full" />
            <button type="button" className="btn-primary w-full !py-2 !text-xs" onClick={download}>
              📥 Baixar / Compartilhar MP3
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RangeInput({ label, value, onChange, help }: { label: string; value: number; onChange: (n: number) => void; help: string }) {
  return (
    <label className="block text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-loog-muted">{value.toFixed(2)}</span>
      </div>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full" />
      <p className="mt-0.5 text-[10px] text-loog-muted">{help}</p>
    </label>
  );
}
