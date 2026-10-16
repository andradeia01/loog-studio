import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Stage } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_ROOT = path.resolve(__dirname, '..', '..', '..', 'prompts');

interface PromptCache {
  system?: string;
  states: Partial<Record<Stage, string>>;
}
const cache: PromptCache = { states: {} };

function loadFile(rel: string): string {
  const full = path.join(PROMPTS_ROOT, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Prompt file missing: ${rel} (looking in ${PROMPTS_ROOT})`);
  }
  return fs.readFileSync(full, 'utf8');
}

export function getSystemPrompt(): string {
  if (!cache.system) cache.system = loadFile('system.md');
  return cache.system;
}

export function getStagePrompt(stage: Stage): string {
  const existing = cache.states[stage];
  if (existing) return existing;
  const contents = loadFile(`states/${stage}.md`);
  cache.states[stage] = contents;
  return contents;
}

/** Test-only: force a re-read on next access. */
export function clearPromptCache(): void {
  cache.system = undefined;
  for (const k of Object.keys(cache.states) as Stage[]) delete cache.states[k];
}
