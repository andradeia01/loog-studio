import Anthropic from "@anthropic-ai/sdk";
import type { AiResult } from "./types";
import { getAnthropic } from "@/lib/ai/anthropic";

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
  engineBase64?: string;
  crlvBase64?: string;      // V2: CRLV (foto ou primeira página do PDF)
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  audioTranscript?: string | null;
}): Promise<AiResult> {
  // Prioridade: env ANTHROPIC_API_KEY → fallback admin_settings.api_keys.anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let client: Anthropic | null = null;
  if (apiKey) {
    client = new Anthropic({
      apiKey,
      defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
        ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
        : undefined,
    });
  } else {
    client = await getAnthropic();
  }
  if (!client) throw new Error("Anthropic não configurado (sem ANTHROPIC_API_KEY nem admin_settings.api_keys.anthropic)");

  const systemPrompt = `Você é um inspetor veicular rigoroso trabalhando numa empresa de PROTEÇÃO VEICULAR (LOOG). Essa vistoria é a prova pericial de que o veículo entrou coberto, íntegro, sem fraudes. Sua missão é aprovar ou reprovar com rigor de perito.

FLUXO DA VISTORIA V2 (contexto):
O consultor grava 1 vídeo de 60s em 6 fases de 10s cada, começando pelo ODÔMETRO (painel aceso), depois FRENTE → LAT DIREITA → TRASEIRA → LAT ESQUERDA → TETO+VIDROS. Então tira 3 fotos extras: COFRE DO MOTOR + CHASSI + CRLV. Nos frames do vídeo você já vê o odômetro — a foto extra pode não existir no fluxo V2 (odômetro vem do vídeo).

CRITÉRIOS DE APROVAÇÃO (TODOS obrigatórios):
1. **Veículo claramente visível** em todos os frames
2. **Veículo LIGADO** durante a gravação — painel iluminado, odômetro ativo, luzes acesas. Confirme pelo frame inicial do vídeo (fase 1 = odômetro) + áudio.
3. **Mínimo 6 dos 8 ângulos externos**: FRONT, FRONT_LEFT, LEFT, REAR_LEFT, REAR, REAR_RIGHT, RIGHT, FRONT_RIGHT
4. **Placa visível e legível** em pelo menos 1 frame (idealmente frente E trás). Checa suspeita de troca de placa.
5. **Placa bate** com a cadastrada
6. **Odômetro legível** com KM atual — vem do frame inicial do vídeo (fase 1) OU da foto extra se existir
7. **CHASSI (VIN) visível e legível** — número de 17 caracteres gravado na soleira da porta do motorista, parede corta-fogo do motor, longarina ou vidro. Extrai o VIN da foto do chassi.
8. **COFRE DO MOTOR**: capô aberto, motor visível, sem sinais de troca/soldagem recente de longarina, sem adulteração de etiqueta de identificação do motor. Reporta condição: normal/reparos/irregularidades.
9. **CRLV presente e legível** (V2): se tiver foto/upload do CRLV, extrai placa + chassi + modelo + ano + nome do proprietário. Valida se BATEM com placa cadastrada e com o chassi lido na foto do chassi. Se divergir, flagga.
10. **PARA-BRISA / VIDROS íntegros** — fase 6 do vídeo mostra. Flagga trincas, PX colada estourada, película suspeita.
11. **Qualidade de imagem decente** — sem borrões, sem escuridão crítica

MOTIVOS COMUNS DE REPROVAÇÃO:
- "painel apagado" — veículo não estava ligado durante a gravação
- "placa não bate" ou "placa ilegível" — suspeita de fraude
- "chassi ilegível" ou "chassi ausente" — vistoria incompleta pra proteção veicular
- "CRLV não bate com placa/chassi" — divergência documental grave
- "motor com sinais de adulteração" — reparos suspeitos, soldagem recente, etiqueta rasurada
- "faltam ângulos" — vistoria incompleta
- "para-brisa trincado" — necessita avaliação de recusa
- "qualidade ruim" — vídeo tremido ou escuro demais

Responda SOMENTE um JSON válido no schema abaixo. Nada de prosa fora do JSON. Nada de markdown. Se um campo não puder ser avaliado, use null/false conforme apropriado.

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
  "chassisNumber": string | null,
  "chassisReadable": boolean,
  "engineBayVisible": boolean,
  "engineBayCondition": "normal"|"reparos"|"irregularidades"|"unknown",
  "engineBayObservations": string[],
  "crlvVisible": boolean,
  "crlvPlateExtracted": string | null,
  "crlvChassisExtracted": string | null,
  "crlvMatchesPlate": boolean | null,
  "crlvMatchesChassis": boolean | null,
  "windshieldCondition": "normal"|"trincado"|"filme_suspeito"|"unknown",
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
    userBlocks.push({ type: "text", text: "Foto EXTRA do chassi (VIN de 17 chars — extrai o número):" });
    userBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: opts.chassisBase64 } });
  }
  if (opts.engineBase64) {
    userBlocks.push({ type: "text", text: "Foto EXTRA do cofre do motor (capô aberto — observa adulterações, soldagens recentes, etiqueta de identificação do motor):" });
    userBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: opts.engineBase64 } });
  }
  if (opts.crlvBase64) {
    userBlocks.push({ type: "text", text: "Foto EXTRA do CRLV (V2 — extrai placa + chassi + modelo + ano + proprietário; valida se batem com dados cadastrados):" });
    userBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: opts.crlvBase64 } });
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
