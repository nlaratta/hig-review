/**
 * Citations: locate a rule's source sentence on a live HIG page.
 *
 * The registry stores only a short locator phrase per rule. At call time the page JSON is fetched
 * (through HIGClient, so it is cached and rate limited), flattened into text units (sentences of
 * paragraphs, list items and asides; rows of tables), and the unit containing the phrase becomes
 * the quote. If the phrase is gone, the citation is returned unverified instead of quoting stale
 * text from memory.
 */

import type { BlockNode, HIGDoc, InlineNode } from '../hig/doc.js';
import type { DocInfo } from '../hig/client.js';
import { docTitle, pageUrl } from '../hig/doc.js';

export interface TextUnit {
  /** Text as it appears on the page (whitespace collapsed). */
  text: string;
  kind: 'sentence' | 'table-row';
  /** Nearest preceding heading (any level), or null before the first heading. */
  heading: { text: string; anchor?: string; level: number } | null;
  /** Headings from level 2 down to the nearest one, e.g. ["Platform considerations", "watchOS"]. */
  headingPath: string[];
  /** For table rows: the table's header row, cells joined with " | ". */
  tableHeader?: string;
}

export interface Citation {
  /** True only when the phrase matched exactly one sentence on a current (non-stale) copy. */
  verified: boolean;
  page: string;
  url: string;
  section?: string;
  /** Full sentence (or table row) from the live page that contains the locator phrase. */
  quote?: string;
  tableHeader?: string;
  /** When the page copy used for this citation was fetched from Apple (ISO 8601). */
  retrievedAt?: string;
  /** 'live' (fetched within the cache lifetime) or 'stale-cache' (Apple unreachable; expired copy). */
  source?: 'live' | 'stale-cache';
  note?: string;
}

/** Normalize typography so locator phrases survive curly quotes, dashes and odd spaces. */
export function normalize(s: string): string {
  return s
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[     ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Split a paragraph into sentences without breaking "4.5:1", "e.g. a" or "Settings > Display". */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(\[]|i(?:OS|PadOS)\b|(?:mac|tv|vision|watch)OS\b)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function inlineText(nodes: InlineNode[] | undefined, doc: HIGDoc): string {
  if (!nodes) return '';
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return n.text ?? '';
        case 'codeVoice':
          return String((n as { code?: string }).code ?? n.text ?? '');
        case 'reference': {
          const ref = n.identifier ? doc.references?.[n.identifier] : undefined;
          return n.overridingTitle ?? ref?.title ?? '';
        }
        case 'link':
          return n.title ?? n.destination ?? '';
        case 'image':
          return '';
        default:
          return n.inlineContent ? inlineText(n.inlineContent, doc) : (n.text ?? '');
      }
    })
    .join('');
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Flatten a page into sentences and table rows, each tagged with its section. */
export function flattenDoc(doc: HIGDoc): TextUnit[] {
  const units: TextUnit[] = [];
  const stack: { text: string; anchor?: string; level: number }[] = [];

  const ctx = () => ({
    heading: stack.length ? stack[stack.length - 1] : null,
    headingPath: stack.map((h) => h.text),
  });

  const pushText = (raw: string) => {
    for (const s of splitSentences(collapse(raw))) units.push({ text: s, kind: 'sentence', ...ctx() });
  };

  const cellText = (cell: BlockNode[]) => collapse(cell.map((b) => blockText(b)).join(' '));

  // Plain text of a block, used for table cells.
  const blockText = (b: BlockNode): string => {
    if (b.type === 'paragraph') return inlineText(b.inlineContent, doc);
    if (Array.isArray(b.content)) return b.content.map(blockText).join(' ');
    if (Array.isArray(b.items)) return b.items.map((i: { content?: BlockNode[] }) => (i.content ?? []).map(blockText).join(' ')).join(' ');
    return '';
  };

  const walk = (blocks: BlockNode[] | undefined) => {
    for (const b of blocks ?? []) {
      switch (b.type) {
        case 'heading': {
          const level = b.level ?? 2;
          while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
          stack.push({ text: String(b.text ?? ''), anchor: b.anchor, level });
          break;
        }
        case 'paragraph':
          pushText(inlineText(b.inlineContent, doc));
          break;
        case 'unorderedList':
        case 'orderedList':
          for (const item of b.items ?? []) walk(item.content);
          break;
        case 'aside':
          walk(b.content);
          break;
        case 'table': {
          const rows: BlockNode[][][] = b.rows ?? [];
          const hasHeader = b.header === 'row' || b.header === 'both';
          const header = hasHeader && rows[0] ? rows[0].map(cellText).join(' | ') : undefined;
          for (const row of hasHeader ? rows.slice(1) : rows) {
            units.push({ text: row.map(cellText).join(' | '), kind: 'table-row', tableHeader: header, ...ctx() });
          }
          break;
        }
        case 'row':
          for (const col of b.columns ?? []) walk(col.content);
          break;
        case 'tabNavigator':
          for (const tab of b.tabs ?? []) walk(tab.content);
          break;
        default:
          if (Array.isArray(b.content)) walk(b.content);
      }
    }
  };

  for (const section of doc.primaryContentSections ?? []) walk(section.content);
  return units;
}

/** All units whose normalized text contains the normalized phrase. */
export function findUnits(units: TextUnit[], phrase: string): TextUnit[] {
  const p = normalize(phrase);
  return units.filter((u) => normalize(u.text).includes(p));
}

const MAX_QUOTE = 320;

/** Keep quotes short: trim very long sentences around the phrase. */
export function shortenQuote(text: string, phrase: string): string {
  if (text.length <= MAX_QUOTE) return text;
  const at = normalize(text).indexOf(normalize(phrase));
  // normalize() can shift offsets slightly (collapsed whitespace); good enough for a window.
  const start = Math.max(0, Math.min(at - 120, text.length - MAX_QUOTE));
  const slice = text.slice(start, start + MAX_QUOTE);
  return `${start > 0 ? '…' : ''}${slice.trim()}${start + MAX_QUOTE < text.length ? '…' : ''}`;
}

/** Build a citation for `phrase` on `slug` from an already-fetched doc. Pure. */
export function citeFromDoc(slug: string, doc: HIGDoc, phrase: string): Citation {
  const page = docTitle(doc);
  const base = pageUrl(slug);
  const units = findUnits(flattenDoc(doc), phrase);
  if (units.length !== 1) {
    return {
      verified: false,
      page,
      url: base,
      note:
        units.length === 0
          ? 'Not verified against the current HIG: the source sentence was not found on the live page (Apple may have reworded or removed it). Read the page before relying on this rule.'
          : `Not verified against the current HIG: the locator matches ${units.length} sentences on the page, so the source sentence is ambiguous. Read the page before relying on this rule.`,
    };
  }
  const unit = units[0];
  const anchor = unit.heading?.anchor;
  return {
    verified: true,
    page,
    url: anchor ? `${base}#${anchor}` : base,
    section: unit.headingPath.length ? unit.headingPath.join(' > ') : undefined,
    quote: unit.kind === 'table-row' ? unit.text : shortenQuote(unit.text, phrase),
    ...(unit.tableHeader ? { tableHeader: unit.tableHeader } : {}),
  };
}

/** Add provenance; a match on a stale fallback copy is reported, but not as verified. */
export function citeFromInfo(slug: string, info: DocInfo, phrase: string): Citation {
  const c = citeFromDoc(slug, info.doc, phrase);
  const retrievedAt = new Date(info.fetchedAt).toISOString();
  if (!info.stale) return { ...c, retrievedAt, source: 'live' };
  return {
    ...c,
    verified: false,
    retrievedAt,
    source: 'stale-cache',
    note: c.verified
      ? `Matched against a cached copy from ${retrievedAt}; Apple could not be reached, so this was not verified against the current HIG.`
      : c.note,
  };
}

/**
 * Fetches pages through a getter and builds citations. One instance serves one tool call: it
 * memoizes each page, failures included, so an unreachable page is requested once per call.
 */
export class Citer {
  private docs = new Map<string, Promise<DocInfo>>();

  constructor(private getDocInfo: (slug: string) => Promise<DocInfo>) {}

  async cite(slug: string, phrase: string): Promise<Citation> {
    let p = this.docs.get(slug);
    if (!p) {
      p = this.getDocInfo(slug);
      p.catch(() => {}); // handled below; keep the rejected promise memoized
      this.docs.set(slug, p);
    }
    try {
      return citeFromInfo(slug, await p, phrase);
    } catch (err) {
      return {
        verified: false,
        page: slug,
        url: pageUrl(slug),
        note: `Not verified against the current HIG: could not fetch the page (${err instanceof Error ? err.message : String(err)}).`,
      };
    }
  }
}
