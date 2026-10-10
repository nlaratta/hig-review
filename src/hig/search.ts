/**
 * Ranking over catalog entries. Pure: no I/O.
 *
 * Lexical matches on the title rank first (exact > prefix > whole word > substring), then
 * matches in the slug/abstract, then Fuse.js fuzzy matches for typos and partial words.
 */

import Fuse from 'fuse.js';
import type { CatalogEntry } from './catalog.js';

export interface SearchHit {
  entry: CatalogEntry;
  score: number;
}

export interface SearchOptions {
  category?: string;
  limit?: number;
}

/** Lowercase words, with a trailing plural "s" removed so "buttons" matches "button". */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

export function lexicalScore(entry: CatalogEntry, query: string): number {
  const q = tokenize(query);
  if (q.length === 0) return 0;
  const title = tokenize(entry.title);
  const titleJoined = title.join(' ');
  const qJoined = q.join(' ');
  const abstract = tokenize(entry.abstract);
  const slug = tokenize(entry.slug);

  if (titleJoined === qJoined) return 100;
  if (titleJoined.startsWith(qJoined)) return 85;
  if (q.every((w) => title.includes(w))) return 75;
  if (titleJoined.includes(qJoined)) return 65;
  const titleHits = q.filter((w) => title.some((t) => t.startsWith(w))).length;
  if (titleHits > 0) return 40 + 20 * (titleHits / q.length);
  if (q.every((w) => slug.includes(w))) return 45;
  const abstractHits = q.filter((w) => abstract.includes(w)).length;
  if (abstractHits > 0) return 15 + 20 * (abstractHits / q.length);
  return 0;
}

export function searchEntries(
  entries: CatalogEntry[],
  query: string,
  { category, limit = 10 }: SearchOptions = {}
): SearchHit[] {
  const wanted = category?.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  const pool = wanted ? entries.filter((e) => e.path.includes(wanted)) : entries;

  const scores = new Map<string, number>();
  for (const e of pool) {
    const s = lexicalScore(e, query);
    if (s > 0) scores.set(e.slug, s);
  }

  // Fuzzy pass for typos ("buton") and anything lexical matching missed; always ranks below
  // lexical matches.
  const fuse = new Fuse(pool, {
    keys: [
      { name: 'title', weight: 0.6 },
      { name: 'slug', weight: 0.2 },
      { name: 'abstract', weight: 0.2 },
    ],
    includeScore: true,
    threshold: 0.35,
    ignoreLocation: true,
  });
  for (const r of fuse.search(query)) {
    if (!scores.has(r.item.slug)) scores.set(r.item.slug, 10 * (1 - (r.score ?? 1)));
  }

  return pool
    .filter((e) => scores.has(e.slug))
    .map((entry) => ({ entry, score: scores.get(entry.slug)! }))
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit);
}
