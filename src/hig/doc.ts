/**
 * Minimal types for the parts of Apple's DocC JSON we use, plus pure helpers for reading it.
 */

import { HIG_PAGE_BASE } from './client.js';

export interface InlineNode {
  type: string;
  text?: string;
  identifier?: string;
  inlineContent?: InlineNode[];
  overridingTitle?: string;
  overridingTitleInlineContent?: InlineNode[];
  title?: string;
  destination?: string;
  [k: string]: unknown;
}

export interface BlockNode {
  type: string;
  [k: string]: any;
}

export interface RefEntry {
  identifier?: string;
  type?: string;
  title?: string;
  abstract?: InlineNode[];
  url?: string;
  kind?: string;
  role?: string;
  alt?: string;
}

export interface HIGDoc {
  abstract?: InlineNode[];
  identifier?: { url?: string };
  kind?: string;
  metadata?: {
    title?: string;
    role?: string;
    customMetadata?: Record<string, string>;
  };
  hierarchy?: { paths?: string[][] };
  primaryContentSections?: { content?: BlockNode[] }[];
  topicSections?: { title?: string; anchor?: string; identifiers?: string[] }[];
  seeAlsoSections?: { title?: string; identifiers?: string[] }[];
  references?: Record<string, RefEntry>;
}

/** Plain text of inline nodes (no markup). */
export function inlineToText(nodes: InlineNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      if (n.type === 'text' || n.type === 'codeVoice') return n.text ?? '';
      if (n.type === 'reference') {
        return n.overridingTitle ?? n.overridingTitleInlineContent?.map((c) => c.text ?? '').join('') ?? '';
      }
      if (n.type === 'image') return '';
      return inlineToText(n.inlineContent) || (n.text ?? '');
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Page slug from a DocC identifier ("doc://com.apple.HIG/design/Human-Interface-Guidelines/buttons#Anchor")
 * or a site path ("/design/human-interface-guidelines/buttons"). Returns null for anything that
 * is not a HIG page, or for the HIG root.
 */
export function slugFromIdentifier(id: string | undefined): string | null {
  if (!id) return null;
  const m = /\/design\/human-interface-guidelines\/([^/#?]+)/i.exec(id);
  return m ? m[1].toLowerCase() : null;
}

export function pageUrl(slug: string): string {
  return slug ? `${HIG_PAGE_BASE}/${slug}` : `${HIG_PAGE_BASE}/`;
}

export function docTitle(doc: HIGDoc): string {
  return doc.metadata?.title ?? 'Untitled';
}

/** Platforms the page declares (lowercased), or null when the page does not say. */
export function docPlatforms(doc: HIGDoc): string[] | null {
  const raw = doc.metadata?.customMetadata?.['supported-platforms'];
  return raw ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : null;
}

/** Ordered child slugs referenced from a doc's topic sections. */
export function childSlugs(doc: HIGDoc): string[] {
  const out: string[] = [];
  for (const section of doc.topicSections ?? []) {
    for (const id of section.identifiers ?? []) {
      const slug = slugFromIdentifier(id);
      if (slug && !id.includes('#') && !out.includes(slug)) out.push(slug);
    }
  }
  return out;
}

/** Ancestor slugs (root-most first, excluding the HIG root) from the page's first hierarchy path. */
export function ancestorSlugs(doc: HIGDoc): string[] {
  const path = doc.hierarchy?.paths?.[0] ?? [];
  return path.map(slugFromIdentifier).filter((s): s is string => !!s);
}
