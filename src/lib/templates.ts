import { promises as fs } from "node:fs";
import path from "node:path";
import { Template, TemplateSchema } from "./types";

/**
 * Store de templates baseado em filesystem.
 *
 * Cada template vive em /public/templates/<slug>/ com:
 *   - config.json     → configuração completa (Template)
 *   - background.*    → arte de fundo
 *   - foreground.*    → overlay opcional
 *   - thumbnail.jpg   → miniatura para a galeria
 *
 * Trocar essa camada por Supabase depois é local: ver src/lib/supabase.ts.
 */

const TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");

export async function listTemplates(): Promise<Template[]> {
  await ensureDir(TEMPLATES_DIR);
  const dirs = await safeReadDir(TEMPLATES_DIR);
  const out: Template[] = [];
  for (const dir of dirs) {
    try {
      const t = await getTemplate(dir);
      if (t) out.push(t);
    } catch {
      // ignora templates com config quebrado
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function getTemplate(slug: string): Promise<Template | null> {
  const cfgPath = path.join(TEMPLATES_DIR, slug, "config.json");
  try {
    const raw = await fs.readFile(cfgPath, "utf8");
    const parsed = TemplateSchema.parse(JSON.parse(raw));
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveTemplate(template: Template): Promise<Template> {
  await ensureDir(path.join(TEMPLATES_DIR, template.slug));
  const now = new Date().toISOString();
  const stored: Template = {
    ...template,
    createdAt: template.createdAt ?? now,
    updatedAt: now,
  };
  const cfgPath = path.join(TEMPLATES_DIR, template.slug, "config.json");
  await fs.writeFile(cfgPath, JSON.stringify(stored, null, 2), "utf8");
  return stored;
}

export async function deleteTemplate(slug: string): Promise<void> {
  const dir = path.join(TEMPLATES_DIR, slug);
  await fs.rm(dir, { recursive: true, force: true });
}

export async function writeTemplateAsset(
  slug: string,
  filename: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(TEMPLATES_DIR, slug);
  await ensureDir(dir);
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, buffer);
  return `/templates/${slug}/${filename}`;
}

/** Resolve `/templates/foo/bar.png` → caminho absoluto em disco. */
export function resolvePublicPath(publicPath: string): string {
  const clean = publicPath.startsWith("/") ? publicPath.slice(1) : publicPath;
  return path.join(process.cwd(), "public", clean);
}

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}
