/**
 * Catalog: the table of contents of the HIG, built by walking the topic sections of the
 * top-level index and of each group page. Titles and abstracts come from the `references`
 * of the group pages, so no leaf page needs to be fetched to build it.
 */

import { HIGDoc, childSlugs, inlineToText, pageUrl, slugFromIdentifier } from './doc.js';
import type { HIGClient } from './client.js';
import { logger } from '../utils/logger.js';

export interface CatalogEntry {
  slug: string;
  title: string;
  abstract: string;
  url: string;
  /** True when the page is a collection of other pages. */
  isGroup: boolean;
  /** Slug of the containing group, or null for top-level entries. */
  parent: string | null;
  /** Slugs of contained pages (groups only). */
  children: string[];
  /** Slugs from the top-level category down to this entry (inclusive). */
  path: string[];
}

export type Catalog = Map<string, CatalogEntry>;

/** Pure: entries for the children of `doc`, taken from its references. */
export function entriesFromGroupDoc(
  doc: HIGDoc,
  parent: string | null,
  parentPath: string[]
): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const slug of childSlugs(doc)) {
    const ref = Object.entries(doc.references ?? {}).find(
      ([id, r]) => slugFromIdentifier(id) === slug && !id.includes('#') && r.title
    )?.[1];
    if (!ref) continue;
    out.push({
      slug,
      title: ref.title ?? slug,
      abstract: inlineToText(ref.abstract),
      url: pageUrl(slug),
      isGroup: ref.role === 'collectionGroup',
      parent,
      children: [],
      path: [...parentPath, slug],
    });
  }
  return out;
}

export async function buildCatalog(client: HIGClient): Promise<Catalog> {
  const catalog: Catalog = new Map();
  const queue: { doc: HIGDoc; parent: string | null; path: string[] }[] = [
    { doc: await client.getDoc(''), parent: null, path: [] },
  ];

  while (queue.length > 0) {
    const { doc, parent, path } = queue.shift()!;
    const entries = entriesFromGroupDoc(doc, parent, path);
    const parentEntry = parent ? catalog.get(parent) : undefined;
    for (const entry of entries) {
      if (parentEntry) parentEntry.children.push(entry.slug);
      if (catalog.has(entry.slug)) continue; // first placement wins
      catalog.set(entry.slug, entry);
      if (entry.isGroup) {
        try {
          queue.push({ doc: await client.getDoc(entry.slug), parent: entry.slug, path: entry.path });
        } catch (err) {
          logger.warn('Could not load group page while building catalog', { slug: entry.slug, error: String(err) });
        }
      }
    }
  }
  logger.info('HIG catalog built', { entries: catalog.size });
  return catalog;
}
