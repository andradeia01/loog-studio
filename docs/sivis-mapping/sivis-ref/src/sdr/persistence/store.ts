import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import type { Conversation, Stage } from '../types.js';

/**
 * File-backed conversation store — one JSON per phone number.
 * MVP-only; PHASE 9 will replace this with Prisma+Postgres.
 */
export class ConversationStore {
  private readonly root: string;
  private locks: Map<string, Promise<unknown>> = new Map();

  constructor(root?: string) {
    this.root = root ?? path.resolve(env.SDR_DATA_DIR, 'leads');
    fs.mkdirSync(this.root, { recursive: true });
  }

  private pathFor(phone: string): string {
    const sanitized = phone.replace(/[^0-9]/g, '');
    return path.join(this.root, `${sanitized}.json`);
  }

  async get(phone: string): Promise<Conversation | null> {
    const p = this.pathFor(phone);
    if (!fs.existsSync(p)) return null;
    const raw = await fsp.readFile(p, 'utf8');
    return JSON.parse(raw) as Conversation;
  }

  async getOrCreate(phone: string, displayName?: string): Promise<Conversation> {
    const existing = await this.get(phone);
    if (existing) return existing;
    const now = new Date().toISOString();
    const fresh: Conversation = {
      leadId: `lead_${phone.replace(/[^0-9]/g, '')}`,
      phone,
      ...(displayName ? { displayName } : {}),
      stage: 'NEW_LEAD',
      vehicle: { confirmed: false },
      customer: { phone },
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.save(fresh);
    return fresh;
  }

  async save(conv: Conversation): Promise<void> {
    const p = this.pathFor(conv.phone);
    const serialized = JSON.stringify(conv, null, 2);
    await fsp.writeFile(p, serialized, 'utf8');
  }

  /** Serialize concurrent writes per phone number so callbacks stay safe. */
  async withLock<T>(phone: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(phone) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    this.locks.set(phone, prev.then(() => next));
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(phone) === prev.then(() => next)) this.locks.delete(phone);
    }
  }

  async list(): Promise<Array<{ phone: string; stage: Stage; updatedAt: string }>> {
    if (!fs.existsSync(this.root)) return [];
    const files = await fsp.readdir(this.root);
    const out: Array<{ phone: string; stage: Stage; updatedAt: string }> = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const raw = await fsp.readFile(path.join(this.root, f), 'utf8');
      const c = JSON.parse(raw) as Conversation;
      out.push({ phone: c.phone, stage: c.stage, updatedAt: c.updatedAt });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
