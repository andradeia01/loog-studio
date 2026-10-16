import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";

/**
 * Slots SIVIS canônicos (alinhados ao `vistoriaSave` do portal.sivisweb.com.br/Modulos/Seguro/Api/AmdApi.php).
 * Mapeia para o que o SIVIS valida como "slot preenchido" na aba Dados Principais / Perfil do Veículo.
 */
export type PhotoSlot =
  // Ângulos externos
  | "FRONTAL"
  | "TRASEIRA"
  | "LATERAL_ESQ"
  | "LATERAL_DIR"
  | "TETO"
  | "FRONT_LEFT"
  | "FRONT_RIGHT"
  | "REAR_LEFT"
  | "REAR_RIGHT"
  // Identificação
  | "PLACA_FRONT"
  | "PLACA_REAR"
  | "CHASSI"
  | "CRLV"
  // Painel/Mecânica
  | "HODOMETRO"
  | "INTERIOR"
  | "MOTOR"
  // Rodas
  | "PNEU_DE"
  | "PNEU_DD"
  | "PNEU_TE"
  | "PNEU_TD"
  | "ESTEPE"
  // Vidros/Luzes
  | "PARA_BRISA"
  | "VIDROS"
  | "FAROIS"
  | "LANTERNAS"
  // Diversos
  | "CHAVE"
  | "RETROVISOR"
  | "EXTINTOR"
  // Especiais moto
  | "GUIDOM"
  | "CARENAGEM"
  // Flags
  | "AVARIA"           // frame mostra dano/arranhão em close (vai pra avariasSave)
  | "OUTRO"
  | "BLURRY"
  | "DARK"
  | "NAO_VEICULAR";

/** Acessórios SIVIS (`acessoriosSave`, grupo 31-37). IA detecta visualmente. */
export type AccessoryTag =
  | "FREIO_DISCO_DIANTEIRO"
  | "FREIO_DISCO_TRASEIRO"
  | "RODAS_LIGA"
  | "ALARME_PISCA_PISCA"
  | "ANTI_FURTO"
  | "PARTIDA_ELETRICA"
  | "VIDRO_ELETRICO"
  | "TRAVA_ELETRICA"
  | "AR_CONDICIONADO"
  | "DIRECAO_HIDRAULICA"
  | "AIR_BAG"
  | "SOM_MULTIMIDIA"
  | "CAMERA_RE"
  | "SENSOR_ESTACIONAMENTO"
  | "VIDRO_FUME";

export interface FrameClassification {
  frameIndex: number;
  timestampMs: number;

  // Dimensão 1: Qual slot SIVIS este frame cobre
  primarySlot: PhotoSlot;
  secondarySlots: PhotoSlot[];

  // Dimensão 2: Avaria visível?
  hasDamage: boolean;
  damageDescription?: string;

  // Dimensão 3: Acessórios visíveis
  accessoriesVisible: AccessoryTag[];

  // Metadados
  confidence: number;
  description: string;
  ocrText?: string;
  qualityScore: number;
  // Dados estruturados específicos (quando aplicável)
  detectedPlate?: string;
  detectedOdometerKm?: number;
  detectedChassis?: string;
  detectedBrand?: string;
  detectedModel?: string;
}

export interface ClassifyBatchResult {
  frames: FrameClassification[];
  modelUsed: string;
  // Agregados — "desenrolo" do vídeo em plano de vistoria SIVIS
  summary: {
    coveredSlots: PhotoSlot[];
    missingSlots: PhotoSlot[];
    damageFramesCount: number;
    accessoriesDetected: AccessoryTag[];
    bestOCR: {
      plate?: string;
      odometerKm?: number;
      chassis?: string;
      brand?: string;
      model?: string;
    };
    vehicleType: "carro" | "moto" | "indeterminado";
  };
}

/** Slots obrigatórios por tipo de vistoria (alinhado com SIVIS defaults). */
export const SLOTS_REQUIRED: Record<string, PhotoSlot[]> = {
  previa_carro: [
    "FRONTAL",
    "TRASEIRA",
    "LATERAL_ESQ",
    "LATERAL_DIR",
    "TETO",
    "HODOMETRO",
    "CHASSI",
    "PLACA_FRONT",
    "PLACA_REAR",
  ],
  previa_moto: [
    "FRONTAL",
    "TRASEIRA",
    "LATERAL_ESQ",
    "LATERAL_DIR",
    "HODOMETRO",
    "CHASSI",
    "PLACA_REAR",
    "GUIDOM",
  ],
  evento_abertura: [
    "FRONTAL",
    "TRASEIRA",
    "LATERAL_ESQ",
    "LATERAL_DIR",
    "AVARIA",
    "HODOMETRO",
    "PLACA_FRONT",
  ],
};

async function classifyBatch(
  anthropic: Anthropic,
  modelId: string,
  frames: Array<{ index: number; timestampMs: number; filePath: string }>,
): Promise<FrameClassification[]> {
  const images = await Promise.all(
    frames.map(async (f) => {
      const buf = await fs.readFile(f.filePath);
      return {
        index: f.index,
        timestampMs: f.timestampMs,
        base64: buf.toString("base64"),
      };
    }),
  );

  const prompt = `Você é um analista de vistoria veicular LOOG. Analise os ${images.length} frames extraídos de um vídeo de vistoria veicular (migração do SIVIS).

Para CADA frame, identifique **3 dimensões em paralelo**:

**DIMENSÃO 1 — Slot SIVIS coberto** (campo \`primarySlot\`). Escolha UM:

Ângulos externos: FRONTAL · TRASEIRA · LATERAL_ESQ · LATERAL_DIR · TETO · FRONT_LEFT · FRONT_RIGHT · REAR_LEFT · REAR_RIGHT
Identificação: PLACA_FRONT · PLACA_REAR · CHASSI · CRLV
Painel/Mecânica: HODOMETRO · INTERIOR · MOTOR
Rodas: PNEU_DE · PNEU_DD · PNEU_TE · PNEU_TD · ESTEPE
Vidros/Luzes: PARA_BRISA · VIDROS · FAROIS · LANTERNAS
Diversos: CHAVE · RETROVISOR · EXTINTOR · GUIDOM (moto) · CARENAGEM (moto)
Flags: AVARIA (close em dano) · OUTRO · BLURRY · DARK · NAO_VEICULAR

**DIMENSÃO 2 — Avaria visível** (\`hasDamage\` + \`damageDescription\`):
Se o frame mostra arranhão, amassado, trinca, pintura falhando, pneu careca, lâmpada quebrada, etc. → \`hasDamage: true\` + descrição curta.

**DIMENSÃO 3 — Acessórios visíveis** (\`accessoriesVisible\`, array):
FREIO_DISCO_DIANTEIRO · FREIO_DISCO_TRASEIRO · RODAS_LIGA · ALARME_PISCA_PISCA · ANTI_FURTO · PARTIDA_ELETRICA · VIDRO_ELETRICO · TRAVA_ELETRICA · AR_CONDICIONADO · DIRECAO_HIDRAULICA · AIR_BAG · SOM_MULTIMIDIA · CAMERA_RE · SENSOR_ESTACIONAMENTO · VIDRO_FUME

**OCR dedicado** (quando aplicável):
- \`detectedPlate\`: placa visível (formato ABC-1D23 ou ABC-1234)
- \`detectedOdometerKm\`: número no odômetro (só o Km, inteiro)
- \`detectedChassis\`: número de chassi (17 chars alfanuméricos)
- \`detectedBrand\` / \`detectedModel\`: marca/modelo visível na carroceria

Responda **APENAS** com JSON válido:

{
  "frames": [
    {
      "frameIndex": 0,
      "timestampMs": 1500,
      "primarySlot": "HODOMETRO",
      "secondarySlots": ["INTERIOR"],
      "hasDamage": false,
      "accessoriesVisible": ["PARTIDA_ELETRICA"],
      "confidence": 0.95,
      "description": "Painel digital Honda CG 160 mostrando odômetro",
      "ocrText": "3685 km",
      "qualityScore": 0.85,
      "detectedOdometerKm": 3685,
      "detectedBrand": "Honda",
      "detectedModel": "CG 160"
    }
  ]
}

Metadados dos frames: ${images.map((i) => `[idx=${i.index},t=${(i.timestampMs / 1000).toFixed(1)}s]`).join(", ")}

Seja rigoroso: só diga primarySlot específico se tiver certeza; use OUTRO/BLURRY/DARK quando não der.`;

  const message = await anthropic.messages.create({
    model: modelId,
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: "image/jpeg" as const,
              data: img.base64,
            },
          })),
          { type: "text" as const, text: prompt },
        ],
      },
    ],
  });

  const textBlock = message.content.find((c) => c.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Resposta sem JSON: ${rawText.slice(0, 300)}`);

  const parsed = JSON.parse(jsonMatch[0]) as { frames: FrameClassification[] };
  return parsed.frames ?? [];
}

export async function classifyFrames(
  frames: Array<{ index: number; timestampMs: number; filePath: string }>,
  opts?: { batchSize?: number; expectedType?: string },
): Promise<ClassifyBatchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");

  const anthropic = new Anthropic({ apiKey });
  const modelId = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
  const batchSize = opts?.batchSize ?? 5;

  const all: FrameClassification[] = [];
  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    const classified = await classifyBatch(anthropic, modelId, batch);
    all.push(...classified);
  }

  // Agregações
  const coveredSlotsSet = new Set<PhotoSlot>();
  const accessoriesSet = new Set<AccessoryTag>();
  let damageCount = 0;
  const ocrPlateCandidates: string[] = [];
  const ocrOdometerCandidates: number[] = [];
  const ocrChassisCandidates: string[] = [];
  const brandCandidates: string[] = [];
  const modelCandidates: string[] = [];

  for (const f of all) {
    coveredSlotsSet.add(f.primarySlot);
    (f.secondarySlots ?? []).forEach((s) => coveredSlotsSet.add(s));
    (f.accessoriesVisible ?? []).forEach((a) => accessoriesSet.add(a));
    if (f.hasDamage) damageCount++;
    if (f.detectedPlate) ocrPlateCandidates.push(f.detectedPlate);
    if (f.detectedOdometerKm) ocrOdometerCandidates.push(f.detectedOdometerKm);
    if (f.detectedChassis) ocrChassisCandidates.push(f.detectedChassis);
    if (f.detectedBrand) brandCandidates.push(f.detectedBrand);
    if (f.detectedModel) modelCandidates.push(f.detectedModel);
  }

  // Determinar tipo de veículo pela presença de GUIDOM/CARENAGEM
  const isMoto =
    coveredSlotsSet.has("GUIDOM") || coveredSlotsSet.has("CARENAGEM");
  const vehicleType: "carro" | "moto" | "indeterminado" = isMoto
    ? "moto"
    : coveredSlotsSet.has("INTERIOR") || coveredSlotsSet.has("MOTOR")
    ? "carro"
    : "indeterminado";

  // Slots obrigatórios conforme vehicleType
  const requiredSlots =
    vehicleType === "moto"
      ? SLOTS_REQUIRED.previa_moto!
      : vehicleType === "carro"
      ? SLOTS_REQUIRED.previa_carro!
      : [];

  const coveredSlots = Array.from(coveredSlotsSet);
  const missingSlots = requiredSlots.filter((s) => !coveredSlotsSet.has(s));

  return {
    frames: all,
    modelUsed: modelId,
    summary: {
      coveredSlots,
      missingSlots,
      damageFramesCount: damageCount,
      accessoriesDetected: Array.from(accessoriesSet),
      bestOCR: {
        plate: mode(ocrPlateCandidates),
        odometerKm: ocrOdometerCandidates.length > 0 ? Math.max(...ocrOdometerCandidates) : undefined,
        chassis: mode(ocrChassisCandidates),
        brand: mode(brandCandidates),
        model: mode(modelCandidates),
      },
      vehicleType,
    },
  };
}

function mode<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  const counts = new Map<T, number>();
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: T | undefined;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}
