/**
 * Geração de imagens de "cenários de perda" via OpenAI pra PDF LOOG.
 *
 * Fluxo:
 *   1. Checa cache no Supabase storage (bucket `cenarios-perda`) pela chave
 *      brand_model_year_cenario (ex: honda_wrv_2021_incendio.png)
 *   2. Se existe, baixa e devolve o buffer. Zero custo, latência ~200ms.
 *   3. Se não, chama OpenAI gpt-image-1 em paralelo (os 4 cenários)
 *   4. Faz upload de cada imagem no cache pra próximas cotações do mesmo modelo
 *   5. Devolve os 4 buffers prontos pra embutir no PDF (pdf-lib)
 *
 * Custo típico (DALL-E 3 standard 1024×1024): $0.04 × 4 = $0.16 por modelo NOVO.
 * Modelos já cacheados: ~$0.00 (só download do Supabase).
 */

import OpenAI from "openai";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export type CenarioPerda = "incendio" | "enchente" | "batida" | "roubo";

export const CENARIOS: CenarioPerda[] = ["incendio", "enchente", "batida", "roubo"];

const CENARIO_LABELS: Record<CenarioPerda, string> = {
  incendio: "Incêndio",
  enchente: "Enchente",
  batida: "Colisão",
  roubo: "Roubo",
};

const CENARIO_EMOJI: Record<CenarioPerda, string> = {
  incendio: "🔥",
  enchente: "💧",
  batida: "💥",
  roubo: "🚨",
};

/** Fator sobre o FIPE pra estimar a perda — alinhado com sinistros reais BR */
const CENARIO_PERDA_PCT: Record<CenarioPerda, number> = {
  incendio: 1.0,  // perda total
  enchente: 0.75, // dano estrutural (motor, eletrônica)
  batida: 0.45,   // dano médio (média de reparos)
  roubo: 1.0,     // perda total
};

export interface CenariosResult {
  cenario: CenarioPerda;
  label: string;
  emoji: string;
  perdaPct: number;
  buffer: Uint8Array;
  fromCache: boolean;
}

const BUCKET = "cenarios-perda";

/** Normaliza nome do arquivo pro cache. Lowercase + só a-z/0-9/_. */
function cacheKey(brand: string, model: string, year: number, cenario: CenarioPerda): string {
  const norm = (s: string) => s.toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `${norm(brand)}_${norm(model)}_${year}_${cenario}.png`;
}

/** Monta o prompt pra cada cenário. Estilo: fotorealista, cinematográfico, impactante. */
function buildPrompt(brand: string, model: string, year: number, color: string | null, cenario: CenarioPerda): string {
  const cor = color?.toLowerCase() ?? "silver";
  const veic = `${year} ${brand} ${model}`;
  const estilo = "cinematic, dramatic lighting, photorealistic, high detail, 35mm film look, professional insurance brochure aesthetic";
  switch (cenario) {
    case "incendio":
      return `A ${cor} ${veic} car completely engulfed in flames and thick black smoke, parked on a street at dusk, firefighters silhouettes in the background with hoses. Total loss scenario. ${estilo}.`;
    case "enchente":
      return `A ${cor} ${veic} car half-submerged in brown flood water on a Brazilian urban street during heavy rain, water up to the windows, damaged houses in the background. ${estilo}.`;
    case "batida":
      return `A ${cor} ${veic} car with heavy frontal collision damage, crumpled hood and broken windshield, parked on the side of a road with debris around, caution tape visible. Daylight. ${estilo}.`;
    case "roubo":
      return `An empty parking spot with scattered glass shards on the asphalt where a ${cor} ${veic} car used to be, a nearby security camera visible, dim night lighting, police tape in the background. ${estilo}.`;
  }
}

/** Tenta baixar do cache. Retorna null se não encontrou. */
async function loadFromCache(key: string): Promise<Uint8Array | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.storage.from(BUCKET).download(key);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return new Uint8Array(buffer);
}

/** Faz upload da imagem no cache. Falha silenciosa (não quebra o PDF). */
async function saveToCache(key: string, bytes: Uint8Array): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.storage.from(BUCKET).upload(key, Buffer.from(bytes), {
      contentType: "image/png",
      upsert: true,
    });
  } catch (e) {
    console.warn("[openai-images] cache upload falhou:", e instanceof Error ? e.message : e);
  }
}

/** Gera UMA imagem via OpenAI DALL-E 3. */
async function generateOne(prompt: string, apiKey: string): Promise<Uint8Array> {
  const client = new OpenAI({ apiKey });
  const resp = await client.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "b64_json",
  });
  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI não retornou imagem (b64_json ausente)");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Gera (ou carrega do cache) os 4 cenários pra um veículo.
 * Executa em paralelo (Promise.all) pra reduzir latência total.
 */
export async function gerarCenariosPerda(input: {
  brand: string;
  model: string;
  modelYear: number;
  color?: string | null;
}): Promise<CenariosResult[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

  const tasks = CENARIOS.map(async (cenario): Promise<CenariosResult> => {
    const key = cacheKey(input.brand, input.model, input.modelYear, cenario);
    // 1. Tenta cache
    const cached = await loadFromCache(key);
    if (cached) {
      return {
        cenario,
        label: CENARIO_LABELS[cenario],
        emoji: CENARIO_EMOJI[cenario],
        perdaPct: CENARIO_PERDA_PCT[cenario],
        buffer: cached,
        fromCache: true,
      };
    }
    // 2. Gera via OpenAI
    const prompt = buildPrompt(input.brand, input.model, input.modelYear, input.color ?? null, cenario);
    const buffer = await generateOne(prompt, apiKey);
    // 3. Salva no cache (não espera — fire and forget pra não bloquear o PDF)
    void saveToCache(key, buffer);
    return {
      cenario,
      label: CENARIO_LABELS[cenario],
      emoji: CENARIO_EMOJI[cenario],
      perdaPct: CENARIO_PERDA_PCT[cenario],
      buffer,
      fromCache: false,
    };
  });

  return Promise.all(tasks);
}
