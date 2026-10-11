/**
 * Registry verification against live pages: every locator phrase must match exactly one sentence
 * (or table row); a rule may only claim platforms that both its page (`supported-platforms`) and
 * any platform-specific heading above the sentence ("watchOS", "iOS, iPadOS") cover; and numbers
 * in the rule's `data` must appear in the cited text (for tables, in the right column).
 * Used by `npm run smoke`.
 */

import { docPlatforms, type HIGDoc } from '../hig/doc.js';
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
  }
  const problem = problems.length ? problems.join('; ') : undefined;
  return { id: rule.id, ok: !problem, matches: units.length, problem, quote: unit.text, section };
}
