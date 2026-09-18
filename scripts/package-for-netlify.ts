/**
 * Empacota o LOOG Studio pronto para deploy no Netlify.
 *
 * O que entra:
 *   src/**            — código do app
 *   public/**         — assets estáticos, templates, brand
 *   scripts/**        — utilitários (seed, extract-logo)
 *   *.json / *.ts / *.mjs / .env.example / netlify.toml / README / DEPLOY
 *
 * O que NÃO entra:
 *   node_modules, .next, .env, .env.local, .git, tsconfig.tsbuildinfo,
 *   dist/build/out, arquivos gerados de scratchpad.
 *
 * Saída: /dist/loog-studio-netlify-<timestamp>.zip
 */

import AdmZip from "adm-zip";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "dist");

const INCLUDE_ROOTS = ["src", "public", "scripts", "supabase"];
const INCLUDE_FILES = [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "next-env.d.ts",
  "middleware.ts",
  "tsconfig.json",
  "tailwind.config.ts",
  "postcss.config.mjs",
  ".eslintrc.json",
  ".gitignore",
  ".env.example",
  ".nvmrc",
  ".npmrc",
  "netlify.toml",
  "README.md",
  "DEPLOY.md",
  "SUPABASE.md",
];

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "out",
  "build",
  ".turbo",
  ".vercel",
  ".netlify",
]);

const EXCLUDE_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "tsconfig.tsbuildinfo",
]);

async function collect(rel: string, zip: AdmZip): Promise<number> {
  const abs = path.join(ROOT, rel);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) return 0;
  if (stat.isFile()) {
    const buf = await fs.readFile(abs);
    zip.addFile(rel.replace(/\\/g, "/"), buf);
    return 1;
  }
  if (stat.isDirectory()) {
    if (EXCLUDE_DIRS.has(path.basename(abs))) return 0;
    const entries = await fs.readdir(abs, { withFileTypes: true });
    let count = 0;
    for (const e of entries) {
      if (e.isDirectory() && EXCLUDE_DIRS.has(e.name)) continue;
      if (e.isFile() && EXCLUDE_FILES.has(e.name)) continue;
      count += await collect(path.join(rel, e.name), zip);
    }
    return count;
  }
  return 0;
}

async function run() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const zip = new AdmZip();
  let total = 0;

  for (const r of INCLUDE_ROOTS) total += await collect(r, zip);
  for (const f of INCLUDE_FILES) total += await collect(f, zip);

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 15);
  const outPath = path.join(OUT_DIR, `loog-studio-netlify-${ts}.zip`);
  zip.writeZip(outPath);

  const size = (await fs.stat(outPath)).size;
  console.log(`[package] ${total} arquivos → ${outPath}`);
  console.log(`[package] tamanho: ${(size / 1024).toFixed(1)} KB`);
  console.log(`[package] próximo passo: leia DEPLOY.md`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
