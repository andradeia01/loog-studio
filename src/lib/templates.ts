import { Template, TemplateSchema } from "./types";
import { createSupabaseServer, createSupabaseAdmin, supabaseConfigured } from "./supabase/server";

/**
 * Store de templates baseado em Supabase.
 *
 * - Tabela `public.templates` armazena metadados + layers (jsonb).
 * - Bucket `templates` armazena background/foreground/thumbnail.
 * - RLS: consultores aprovados leem os ativos; admin faz tudo.
 *
 * Layers guardam URLs públicas (não paths de filesystem).
 */

const TEMPLATES_BUCKET = "templates";

// ─────────────────────────────────────────────────────────────────────────────
// Serialização row ⇄ Template
// ─────────────────────────────────────────────────────────────────────────────

interface DbTemplate {
  id: string;
  slug: string;
  name: string;
  category: string;
  format: string;
  width: number;
  height: number;
  thumbnail_url: string;
  active: boolean;
  layers: unknown;
  created_at: string | null;
  updated_at: string | null;
}

function rowToTemplate(row: DbTemplate): Template | null {
  const candidate = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    format: row.format,
    width: row.width,
    height: row.height,
    thumbnail: row.thumbnail_url,
    active: row.active,
    layers: row.layers ?? [],
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
  const parsed = TemplateSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function templateToRow(t: Template): Omit<DbTemplate, "created_at" | "updated_at"> {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    category: t.category,
    format: t.format,
    width: t.width,
    height: t.height,
    thumbnail_url: t.thumbnail,
    active: t.active !== false,
    layers: t.layers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD público
// ─────────────────────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<Template[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[templates.list] erro", error);
    return [];
  }
  return (data ?? [])
    .map(rowToTemplate)
    .filter((t): t is Template => t !== null);
}

export async function getTemplate(slug: string): Promise<Template | null> {
  if (!supabaseConfigured()) return null;
  // Usa admin client aqui pra o /api/generate poder ler sem depender de sessão SSR.
  // O gate de autorização já é feito na rota (requireApproved).
  const supabase = createSupabaseAdmin() ?? (await createSupabaseServer());
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return rowToTemplate(data);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveTemplate(template: Template): Promise<Template> {
  const supabase = createSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado (service role missing)");
  const row = templateToRow(template);
  // Se o id do cliente não é UUID válido (ex: 't-1234567890'), deixa o Postgres
  // gerar via default gen_random_uuid(). O slug é o que identifica em upsert.
  const rowForDb: Partial<typeof row> = { ...row };
  if (!UUID_RE.test(row.id)) {
    delete (rowForDb as Record<string, unknown>).id;
  }
  const { data, error } = await supabase
    .from("templates")
    .upsert(rowForDb, { onConflict: "slug" })
    .select()
    .single();
  if (error || !data) throw new Error(`upsert falhou: ${error?.message}`);
  const parsed = rowToTemplate(data);
  if (!parsed) throw new Error("template salvo mas resposta inválida");
  return parsed;
}

export async function deleteTemplate(slug: string): Promise<void> {
  const supabase = createSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado (service role missing)");
  // apaga assets do storage (pasta com o slug)
  const { data: files } = await supabase.storage.from(TEMPLATES_BUCKET).list(slug);
  if (files && files.length > 0) {
    const paths = files.map((f) => `${slug}/${f.name}`);
    await supabase.storage.from(TEMPLATES_BUCKET).remove(paths);
  }
  const { error } = await supabase.from("templates").delete().eq("slug", slug);
  if (error) throw new Error(`delete falhou: ${error.message}`);
}

/**
 * Faz upload de um asset (background/foreground/thumbnail) para o bucket
 * `templates` na pasta `<slug>/`. Retorna a URL pública.
 */
export async function writeTemplateAsset(
  slug: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const supabase = createSupabaseAdmin();
  if (!supabase) throw new Error("Supabase não configurado (service role missing)");
  const path = `${slug}/${filename}`;
  const contentType = filename.endsWith(".jpg") || filename.endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";
  const { error } = await supabase.storage
    .from(TEMPLATES_BUCKET)
    .upload(path, buffer, { contentType, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(`upload falhou: ${error.message}`);
  const { data } = supabase.storage.from(TEMPLATES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Mantida para compat: se o `publicPath` for URL absoluta, devolve-a inalterada
 * (o generator agora faz fetch). Se for path legado `/templates/...`, converte
 * pra URL pública do bucket.
 */
export function resolvePublicPath(publicPath: string): string {
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  // legado: /templates/<slug>/<file> → bucket
  const clean = publicPath.replace(/^\/+/, "").replace(/^templates\//, "");
  const supabase = createSupabaseAdmin();
  if (!supabase) return publicPath;
  const { data } = supabase.storage.from(TEMPLATES_BUCKET).getPublicUrl(clean);
  return data.publicUrl;
}
