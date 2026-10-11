/**
 * Registry verification against live pages: every locator phrase must match exactly one sentence
 * (or table row); a rule may only claim platforms that both its page (`supported-platforms`) and
 * any platform-specific heading above the sentence ("watchOS", "iOS, iPadOS") cover; and numbers
 * in the rule's `data` must appear in the cited text (for tables, in the right column).
 * Used by `npm run smoke`.
 */

import { docPlatforms, type HIGDoc } from '../hig/doc.js';
import type { DocInfo } from '../hig/client.js';
import { PLATFORMS, type ApplePlatform } from '../types/index.js';
import { findUnits, flattenDoc } from './citation.js';
import type { Rule } from './registry.js';

const NAMES: Record<string, ApplePlatform> = {
  ios: 'ios',
  ipados: 'ipados',
  macos: 'macos',
  tvos: 'tvos',
  visionos: 'visionos',
  watchos: 'watchos',
};

/** Platforms named by a heading like "iOS, iPadOS", or null for a general heading. */
export function headingPlatforms(heading: string): ApplePlatform[] | null {
  const parts = heading.split(/,|\band\b/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0 || !parts.every((p) => p in NAMES)) return null;
  return parts.map((p) => NAMES[p]);
}

export interface RuleCheck {
  id: string;
  ok: boolean;
  matches: number;
  problem?: string;
  quote?: string;
  section?: string;
}

const WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight' };

/** Problems with a rule's numeric `data` given the matched sentence or table row. */
export function dataProblems(rule: Rule, text: string): string[] {
  const out: string[] = [];
  const data = rule.data ?? {};
  if (data.defaultPt !== undefined || data.minimumPt !== undefined) {
    // Table rows: "<platform> | <default> | <minimum>" — compare by column.
    const cells = text.split('|').map((c) => c.trim());
    const num = (c: string | undefined) => (c ? parseFloat(/(\d+(?:\.\d+)?)/.exec(c)?.[1] ?? 'NaN') : NaN);
    if (data.defaultPt !== undefined && num(cells[1]) !== data.defaultPt) out.push(`defaultPt ${data.defaultPt} != "${cells[1]}"`);
    if (data.minimumPt !== undefined && num(cells[2]) !== data.minimumPt) out.push(`minimumPt ${data.minimumPt} != "${cells[2]}"`);
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === 'defaultPt' || key === 'minimumPt') continue;
    const digits = new RegExp(`(^|[^\\d.])${String(value).replace('.', '\\.')}(?![\\d])`);
    const word = WORDS[value] ? new RegExp(`\\b${WORDS[value]}\\b`, 'i') : null;
    if (!digits.test(text) && !(word && word.test(text))) out.push(`${key} ${value} does not appear in the cited text`);
  }
  return out;
}

/** Words that soften a recommendation, in our paraphrases. */
const PARAPHRASE_HEDGE = /\b(consider|prefer|ideally|where possible|in general|aim|strive)\b/i;
/** Words that mark Apple's sentence as a hedged recommendation rather than a direct one. */
const SOURCE_HEDGE = /\b(consider|prefer|ideally|try|possible|in general|generally|aim|strive|can|could|might|may|if necessary|if it makes sense|when it makes sense|works well|recommended|typically|often)\b/i;

/** A paraphrase may only hedge when the cited source sentence hedges too. */
export function hedgeProblem(check: string, sourceText: string): string | null {
  const hedge = PARAPHRASE_HEDGE.exec(check);
  if (!hedge || SOURCE_HEDGE.test(sourceText)) return null;
  return `paraphrase hedges ("${hedge[0]}") but the cited sentence is a direct recommendation`;
}

export function checkRule(rule: Rule, doc: HIGDoc): RuleCheck {
  const units = findUnits(flattenDoc(doc), rule.source.phrase);
  if (units.length === 0) return { id: rule.id, ok: false, matches: 0, problem: `phrase not found on "${rule.source.slug}"` };
  const unit = units[0];
  const section = unit.headingPath.join(' > ');
  const rulePlatforms = rule.platforms === 'all' ? [...PLATFORMS] : rule.platforms;
  const problems: string[] = [];
  if (units.length > 1) {
    problems.push(`phrase is ambiguous: it matches ${units.length} sentences on "${rule.source.slug}"`);
  } else {
    const scoped = unit.headingPath.map(headingPlatforms).filter((p): p is ApplePlatform[] => !!p).pop();
    if (scoped) {
      const extra = rulePlatforms.filter((p) => !scoped.includes(p));
      if (extra.length) problems.push(`sentence is under "${section}" but the rule also claims ${extra.join(', ')}`);
    }
    const page = docPlatforms(doc);
    if (page) {
      const extra = rulePlatforms.filter((p) => !page.includes(p));
      if (extra.length) problems.push(`page "${rule.source.slug}" supports ${page.join(', ')} but the rule also claims ${extra.join(', ')}`);
    }
    problems.push(...dataProblems(rule, unit.text));
    const hedge = hedgeProblem(rule.check, unit.text);
    if (hedge) problems.push(hedge);
  }
  const problem = problems.length ? problems.join('; ') : undefined;
  return { id: rule.id, ok: !problem, matches: units.length, problem, quote: unit.text, section };
}

export interface RegistryVerification {
  checks: RuleCheck[];
  /** One line per failing rule. */
  failures: string[];
  /** Pages fetched for this run. */
  pages: number;
  /** Pages that came from a stale fallback copy (Apple unreachable): their rules fail. */
  stalePages: string[];
}

/**
 * Verify every rule against freshly fetched pages. Each page is fetched once (memoized for the run,
 * failures included); a page served from a stale cached copy fails all its rules, so a run can only
 * pass against the current HIG.
 */
export async function verifyRegistry(rules: Rule[], getDocInfo: (slug: string) => Promise<DocInfo>): Promise<RegistryVerification> {
  const pages = new Map<string, Promise<DocInfo>>();
  const checks: RuleCheck[] = [];
  const failures: string[] = [];
  const stale = new Set<string>();
  for (const rule of rules) {
    const slug = rule.source.slug;
    let page = pages.get(slug);
    if (!page) {
      page = getDocInfo(slug);
      page.catch(() => {});
      pages.set(slug, page);
    }
    let result: RuleCheck;
    try {
      const info = await page;
      if (info.stale) {
        stale.add(slug);
        result = {
          id: rule.id,
          ok: false,
          matches: 0,
          problem: `page "${slug}" came from a stale cached copy (fetched ${new Date(info.fetchedAt).toISOString()}), not from Apple`,
        };
      } else {
        result = checkRule(rule, info.doc);
      }
    } catch (err) {
      result = { id: rule.id, ok: false, matches: 0, problem: `fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    checks.push(result);
    if (!result.ok) failures.push(`${rule.id} (${slug}: "${rule.source.phrase}"): ${result.problem}`);
  }
  return { checks, failures, pages: pages.size, stalePages: [...stale] };
}
