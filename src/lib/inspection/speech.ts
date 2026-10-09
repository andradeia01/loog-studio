/**
 * Transcrição de áudio em tempo real via Web Speech API.
 * Funciona em Chrome/Edge/Safari mobile. Fallback: nenhum (transcript fica vazio).
 */
export interface SpeechSession {
  stop: () => string; // retorna o transcript final acumulado
  isActive: () => boolean;
}

export function startSpeechRecognition(onInterim?: (text: string) => void): SpeechSession | null {
  if (typeof window === "undefined") return null;
  const SR =
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    ?? (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition;
  if (!SR) return null;

  const rec = new SR();
  rec.lang = "pt-BR";
  rec.continuous = true;
  rec.interimResults = true;

  let finalText = "";
  let active = true;

  rec.onresult = (ev: SpeechRecognitionEventLike) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    if (onInterim) onInterim(finalText + interim);
  };

  rec.onerror = () => { /* silencioso — Web Speech morre fácil, mas o vídeo continua */ };

  rec.onend = () => {
    // Chrome mobile encerra sozinho a cada ~60s; reinicia enquanto active
    if (active) {
      try { rec.start(); } catch { /* ignore */ }
    }
  };

  try {
    rec.start();
  } catch {
    return null;
  }

  return {
    isActive: () => active,
    stop: () => {
      active = false;
      try { rec.stop(); } catch { /* ignore */ }
      return finalText.trim();
    },
  };
}

// Shim mínimo dos tipos (Web Speech não tem types oficiais)
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (ev: SpeechRecognitionEventLike) => void;
  onerror: (ev: unknown) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number; [idx: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [idx: number]: { transcript: string };
}
