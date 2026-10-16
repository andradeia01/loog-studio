/**
 * Minimal cookie jar for a single origin.
 *
 * Sivisweb only sets session cookies (no path/domain segmentation matters for
 * our use case), so we track a flat name→value map. We reset on login retry.
 */
export class CookieJar {
  private jar: Map<string, string> = new Map();

  ingest(res: Response): void {
    const list = res.headers.getSetCookie();
    for (const raw of list) {
      const first = raw.split(';', 1)[0]!;
      const eq = first.indexOf('=');
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!name) continue;
      if (value === '' || value.toLowerCase() === 'deleted') {
        this.jar.delete(name);
      } else {
        this.jar.set(name, value);
      }
    }
  }

  header(): string | undefined {
    if (this.jar.size === 0) return undefined;
    return Array.from(this.jar.entries())
      .map(([n, v]) => `${n}=${v}`)
      .join('; ');
  }

  clear(): void {
    this.jar.clear();
  }

  size(): number {
    return this.jar.size;
  }
}
