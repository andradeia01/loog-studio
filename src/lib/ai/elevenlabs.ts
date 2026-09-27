import { getApiKeys } from "../admin-settings";

/** Vozes brasileiras curadas (compatíveis com ElevenLabs multilingual v2). */
export const VOICES = [
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (masculino jovem)", accent: "neutro" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (feminino calmo)", accent: "neutro" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie (masculino sereno)", accent: "neutro" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella (feminino vibrante)", accent: "neutro" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam (masculino conversacional)", accent: "neutro" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

/** Preço ElevenLabs por char (Creator plan aprox R$ 0.00015/char em USD ~0.00003). */
export function estimateVoiceCost(chars: number): number {
  return chars * 0.00003; // USD
}

export async function getElevenLabsKey(): Promise<string | null> {
  const keys = await getApiKeys();
  return keys.elevenlabs || null;
}

/** Faz POST /v1/text-to-speech/{voice_id} — retorna Buffer do mp3. */
export async function synthesizeSpeech(
  key: string,
  voiceId: string,
  text: string,
  options?: { stability?: number; similarity_boost?: number; style?: number },
): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: options?.stability ?? 0.5,
        similarity_boost: options?.similarity_boost ?? 0.75,
        style: options?.style ?? 0.35,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${t.slice(0, 300)}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
