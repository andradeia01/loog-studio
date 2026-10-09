import Anthropic from "@anthropic-ai/sdk";
import type { AiResult } from "./types";

/**
 * Analisa frames extraídos de uma gravação de vistoria.
 * Usa Claude Sonnet 4.5 (independente de custo — user pediu modelo inteligente).
 * Fallback Opus 4.7 se confidence baixa (futuramente).
 *
 * @param framesBase64 Array de JPEGs em base64 (sem o prefixo data:) do vídeo
 * @param placa Placa cadastrada (pra validar que bate)
 * @param audioTranscript Transcript do áudio (Web Speech ou Whisper)
 * @param veiculo Dados do veículo pra contexto
 */
export async function analyzeInspection(opts: {
  framesBase64: string[];
  odometerBase64?: string;
  chassisBase64?: string;
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  audioTranscript?: string | null;
}): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente");

  const client = new Anthropic({
    apiKey,
    defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
      ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
      : undefined,
  });

  const systemPrompt = `Você é um inspetor veicular rigoroso. Analisa fotos extraídas de um vídeo de vistoria de proteção veicular LOOG. Sua missão é confirmar que a vistoria foi feita corretamente e aprovar ou reprovar.

CRITÉRIOS DE APROVAÇÃO (todos obrigatórios):
1. **Veículo claramente visível** em todos os frames
2. **Veículo LIGADO** durante gravação — painel iluminado, luzes acesas, odômetro ativo. Use também o transcript do áudio pra confirmar ruído do motor
3. **Pelo menos 6 dos 8 ângulos cobertos**: FRONT, FRONT_LEFT, LEFT, REAR_LEFT, REAR, REAR_RIGHT, RIGHT, FRONT_RIGHT
4. **Placa visível e legível** em pelo menos 1 frame (idealmente frente E trás, pra evitar fraude de placa trocada)
5. **Placa bate** com a cadastrada
6. **Odômetro legível** (foto extra ou visível no vídeo)
7. **Qualidade de imagem decente** — sem borrões excessivos, sem iluminação crítica

MOTIVOS COMUNS DE REPROVAÇÃO:
- "painel apagado" — veículo não estava ligado
- "placa não bate" ou "placa ilegível" — suspeita de fraude
- "faltam ângulos" — vistoria incompleta
- "qualidade ruim" — vídeo tremido ou escuro demais
- "veículo não identificado" — frames mostram algo diferente

Responda SOMENTE um JSON válido no schema abaixo. Nada de prosa fora do JSON. Nada de markdown.

Schema:
{
  "vehicleDetected": boolean,
  "vehicleRunning": boolean,
  "vehicleRunningEvidence": string[],
  "anglesCaptured": ["FRONT"|"FRONT_LEFT"|"LEFT"|"REAR_LEFT"|"REAR"|"REAR_RIGHT"|"RIGHT"|"FRONT_RIGHT"],
  "anglesMissing": string[],
  "detectedPlate": string | null,
  "plateMatches": boolean | null,
  "odometerKm": number | null,
  "odometerReadable": boolean,
  "chassisVisible": boolean,
  "damages": [{"description": "...", "severity": "minor"|"moderate"|"severe", "location": "...", "frameMs": number | null}],
  "overallQuality": "excellent"|"good"|"poor"|"unusable",
  "reasons": ["lista de observações, pros e contras"],
  "recommendation": "approve"|"reject"|"needs_review",
  "rejectionReason": "frase curta se recomendar reject"
}`;

  const userBlocks: Anthropic.Messages.ContentBlockParam[] = [
    {
      type: "text",
      text: `Dados cadastrados:
- Placa: ${opts.placa}
- Marca/Modelo: ${opts.marca ?? "?"} ${opts.modelo ?? ""}
- Transcript do áudio: ${opts.audioTranscript ? `"${opts.audioTranscript.slice(0, 2000)}"` : "(sem áudio captado)"}

Analise os ${opts.framesBase64.length} frames do vídeo${opts.odometerBase64 ? " + foto do odômetro" : ""}${opts.chassisBase64 ? " + foto do chassi" : ""} e responda em JSON.`,
    },
    ...opts.framesBase64.map((b64, i): Anthropic.Messages.ContentBlockParam => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: b64 },
      cache_control: i === 0 ? { type: "ephemeral" } : undefined,
    })),
  ];
  if (opts.odometerBase64) {
    userBlocks.push({ type: "text", text: "Foto EXTRA do odômetro (painel ligado):" });
    userBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: opts.odometerBase64 } });
  }
  if (opts.chassisBase64) {
    userBlocks.push({ type: "text", text: "Foto EXTRA do chassi:" });
    userBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: opts.chassisBase64 } });
  }

  const response = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userBlocks }],
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Extrai JSON (às vezes vem com ```json fence)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Resposta sem JSON: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(jsonMatch[0]) as AiResult;
  return parsed;
}
