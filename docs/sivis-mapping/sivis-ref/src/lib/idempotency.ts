/**
 * In-memory idempotency store. Suitable for a single-instance dev run.
 * PHASE 9 will replace this with a Postgres-backed store.
 */
type StoredEntry = {
  status: 'in_flight' | 'done';
  createdAt: number;
  result?: unknown;
  error?: { code: string; message: string };
};

const STORE = new Map<string, StoredEntry>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function gc(): void {
  const now = Date.now();
  for (const [k, v] of STORE.entries()) {
    if (now - v.createdAt > TTL_MS) STORE.delete(k);
  }
}

export interface IdempotentRunOptions<T> {
  key: string;
  scope: string; // e.g. "quote.quick"
  run: () => Promise<T>;
}

export async function runIdempotent<T>({
  key,
  scope,
  run,
}: IdempotentRunOptions<T>): Promise<{ result: T; replayed: boolean }> {
  gc();
  const composite = `${scope}:${key}`;
  const existing = STORE.get(composite);
  if (existing) {
    if (existing.status === 'done' && existing.result !== undefined) {
      return { result: existing.result as T, replayed: true };
    }
    if (existing.status === 'in_flight') {
      throw new Error(`Idempotent operation ${composite} is already in flight.`);
    }
    if (existing.error) {
      const err = new Error(existing.error.message);
      (err as { code?: string }).code = existing.error.code;
      throw err;
    }
  }
  STORE.set(composite, { status: 'in_flight', createdAt: Date.now() });
  try {
    const result = await run();
    STORE.set(composite, { status: 'done', createdAt: Date.now(), result });
    return { result, replayed: false };
  } catch (err) {
    STORE.set(composite, {
      status: 'done',
      createdAt: Date.now(),
      error: {
        code: (err as { code?: string }).code ?? 'INTERNAL_ERROR',
        message: (err as Error).message,
      },
    });
    throw err;
  }
}

export function clearIdempotencyStoreForTests(): void {
  STORE.clear();
}
