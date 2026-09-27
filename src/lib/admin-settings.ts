import { createSupabaseAdmin } from "./supabase/server";

export interface ApiKeys {
  openai?: string;
  elevenlabs?: string;
  fal?: string;
  replicate?: string;
}

export interface Quotas {
  consultor: { text: number; image: number; voice_chars: number; transcribe_min: number };
  gestor:    { text: number; image: number; voice_chars: number; transcribe_min: number };
  admin:     { text: number; image: number; voice_chars: number; transcribe_min: number };
}

export interface BrandContext {
  company: string;
  product: string;
  tone: string;
  values: string;
  cta_default: string;
}

/**
 * Lê uma setting (via service role — bypassa RLS). NUNCA chamar do cliente.
 */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value as T;
}

export async function getApiKeys(): Promise<ApiKeys> {
  return (await getSetting<ApiKeys>("api_keys")) ?? {};
}

export async function getQuotas(): Promise<Quotas> {
  return (
    (await getSetting<Quotas>("quotas")) ?? {
      consultor: { text: 30, image: 10, voice_chars: 10000, transcribe_min: 20 },
      gestor:    { text: 100, image: 50, voice_chars: 50000, transcribe_min: 60 },
      admin:     { text: -1, image: -1, voice_chars: -1, transcribe_min: -1 },
    }
  );
}

export async function getBrandContext(): Promise<BrandContext> {
  return (
    (await getSetting<BrandContext>("brand_context")) ?? {
      company: "LOOG",
      product: "proteção veicular",
      tone: "confiante, próximo, direto",
      values: "segurança, agilidade, confiança",
      cta_default: "Fale comigo agora",
    }
  );
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedBy: string | null,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado");
  const { error } = await supabase.from("admin_settings").upsert({
    key,
    value: value as never,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`setSetting(${key}) falhou: ${error.message}`);
}

/** Retorna quantas gerações do tipo foram feitas no mês corrente (via view). */
export async function quotaUsedThisMonth(profileId: string, type: string): Promise<number> {
  const supabase = createSupabaseAdmin();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("quota_used_this_month", {
    p_profile_id: profileId,
    p_type: type,
  });
  if (error) {
    console.warn("[quota] rpc falhou", error);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
