/**
 * In-memory cache mapping quoteId → the Sivisweb PDF URL, so the Hub can
 * proxy PDF requests without needing to re-derive them from persisted quote
 * data. Replaced by Postgres in PHASE 9.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

export interface QuoteRecord {
  quoteId: string;
  sivisWebPrintUrl: string;
  /** Random 128-bit hex token embedded in the public pdfUrl to prevent enumeration. */
  pdfAccessToken: string;
  createdAt: number;
}

export function generatePdfAccessToken(): string {
  return randomBytes(16).toString('hex');
}

export function verifyPdfAccessToken(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const STORE = new Map<string, QuoteRecord>();

function gc(): void {
  const now = Date.now();
  for (const [k, v] of STORE.entries()) {
    if (now - v.createdAt > TTL_MS) STORE.delete(k);
  }
}

export function storeQuoteRecord(quoteId: string, record: QuoteRecord): void {
  gc();
  STORE.set(quoteId, record);
}

export function getQuoteRecord(quoteId: string): QuoteRecord | null {
  gc();
  return STORE.get(quoteId) ?? null;
}

export function clearQuoteStoreForTests(): void {
  STORE.clear();
}
