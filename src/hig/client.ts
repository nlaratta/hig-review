/**
 * HIGClient: fetches Apple's structured (DocC) JSON for Human Interface Guidelines pages.
 *
 * Apple's HIG site is a JS single-page app, but each page is backed by a public JSON document at
 *   https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<slug>.json
 * which is what the site itself loads. We fetch that, politely: descriptive User-Agent, rate
 * limiting, retry with backoff, and a memory + on-disk cache (outside the repo).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { RateLimiter, ExponentialBackoff } from './RateLimiter.js';
import { logger } from '../utils/logger.js';
import { HIGServerError } from '../types/index.js';
import type { HIGDoc } from './doc.js';

export const SITE_ROOT = 'https://developer.apple.com';
export const HIG_PAGE_BASE = `${SITE_ROOT}/design/human-interface-guidelines`;
export const HIG_DATA_BASE = `${SITE_ROOT}/tutorials/data/design/human-interface-guidelines`;

export class HIGNotFoundError extends HIGServerError {
  constructor(slug: string) {
    super('NOT_FOUND', `No Human Interface Guidelines page found for "${slug}"`);
  }
}

export interface HIGClientOptions {
  userAgent: string;
  ttlMs: number;
  /** Directory for the on-disk cache; null disables it. */
  cacheDir: string | null;
  fetchImpl?: typeof fetch;
  rateLimiter?: RateLimiter;
  /** Retries after a failed request (default 3, with exponential backoff). */
  retries?: number;
}

interface CacheRecord {
  fetchedAt: number;
  doc: HIGDoc;
}

/** A page plus where it came from, so callers can tell live data from a stale fallback. */
export interface DocInfo {
  doc: HIGDoc;
  /** When the copy was fetched from Apple (ms since epoch). */
  fetchedAt: number;
  /** True when Apple could not be reached and an expired cached copy was served instead. */
  stale: boolean;
}

const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;

export class HIGClient {
  private memory = new Map<string, CacheRecord>();
  private inflight = new Map<string, Promise<DocInfo>>();
  private limiter: RateLimiter;
  private backoff = new ExponentialBackoff(1000, 15000, 2);
  private fetchImpl: typeof fetch;
  public requestCount = 0;

  constructor(private opts: HIGClientOptions) {
    this.limiter = opts.rateLimiter ?? RateLimiter.createAppleRateLimiter();
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Fetch a page document. `slug` is the page name ("buttons"); '' is the top-level index. */
  public async getDoc(slug: string): Promise<HIGDoc> {
    return (await this.getDocInfo(slug)).doc;
  }

  /** Like getDoc, but also reports when the copy was fetched and whether it is a stale fallback. */
  public async getDocInfo(slug: string): Promise<DocInfo> {
    if (slug !== '' && !SLUG_RE.test(slug)) {
      throw new HIGNotFoundError(slug);
    }
    const key = slug || '_root';

    const mem = this.memory.get(key);
    if (mem && this.isFresh(mem)) return { doc: mem.doc, fetchedAt: mem.fetchedAt, stale: false };

    const disk = await this.readDisk(key);
    if (disk && this.isFresh(disk)) {
      this.memory.set(key, disk);
      return { doc: disk.doc, fetchedAt: disk.fetchedAt, stale: false };
    }

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = this.fetchRemote(slug, key, disk ?? mem).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  public cacheStats() {
    return { memoryEntries: this.memory.size, requestsMade: this.requestCount };
  }

  private isFresh(rec: CacheRecord): boolean {
    return Date.now() - rec.fetchedAt < this.opts.ttlMs;
  }

  private async fetchRemote(slug: string, key: string, stale?: CacheRecord): Promise<DocInfo> {
    const url = slug ? `${HIG_DATA_BASE}/${slug}.json` : `${HIG_DATA_BASE}.json`;
    try {
      const doc = await this.limiter.execute(() =>
        this.backoff.execute(
          () => this.request(url, slug),
          this.opts.retries ?? 3,
          (err) => !(err instanceof HIGNotFoundError)
        )
      );
      const rec: CacheRecord = { fetchedAt: Date.now(), doc };
      this.memory.set(key, rec);
      await this.writeDisk(key, rec);
      return { doc, fetchedAt: rec.fetchedAt, stale: false };
    } catch (err) {
      if (stale && !(err instanceof HIGNotFoundError)) {
        logger.warn('Fetch failed, serving stale cached copy', { slug, error: String(err) });
        return { doc: stale.doc, fetchedAt: stale.fetchedAt, stale: true };
      }
      throw err;
    }
  }

  private async request(url: string, slug: string): Promise<HIGDoc> {
    this.requestCount++;
    logger.debug('GET', { url });
    const res = await this.fetchImpl(url, {
      headers: { 'User-Agent': this.opts.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 404) throw new HIGNotFoundError(slug);
    if (!res.ok) throw new HIGServerError('FETCH_FAILED', `Apple returned HTTP ${res.status} for ${url}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) {
      // Apple answers unknown paths with its HTML app shell instead of a 404.
      throw new HIGNotFoundError(slug);
    }
    return (await res.json()) as HIGDoc;
  }

  private file(key: string): string | null {
    return this.opts.cacheDir ? path.join(this.opts.cacheDir, `${key}.json`) : null;
  }

  private async readDisk(key: string): Promise<CacheRecord | undefined> {
    const file = this.file(key);
    if (!file) return undefined;
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as CacheRecord;
    } catch {
      return undefined;
    }
  }

  private async writeDisk(key: string, rec: CacheRecord): Promise<void> {
    const file = this.file(key);
    if (!file) return;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(rec));
      await fs.rename(tmp, file);
    } catch (err) {
      logger.warn('Could not write cache file', { file, error: String(err) });
    }
  }
}
