/**
 * Registry verification against live pages: every locator phrase must match exactly one sentence
 * (or table row), and a rule whose sentence sits under a platform-specific heading ("watchOS",
 * "iOS, iPadOS") must be scoped to those platforms. Used by `npm run smoke`.
 */

import type { HIGDoc } from '../hig/doc.js';
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

export function checkRule(rule: Rule, doc: HIGDoc): RuleCheck {
  const units = findUnits(flattenDoc(doc), rule.source.phrase);
  if (units.length === 0) return { id: rule.id, ok: false, matches: 0, problem: `phrase not found on "${rule.source.slug}"` };
  const unit = units[0];
  const section = unit.headingPath.join(' > ');
  const scoped = unit.headingPath.map(headingPlatforms).filter((p): p is ApplePlatform[] => !!p).pop();
  let problem: string | undefined;
  if (units.length > 1) {
    problem = `phrase is ambiguous: it matches ${units.length} sentences on "${rule.source.slug}"`;
  } else if (scoped) {
    const rulePlatforms = rule.platforms === 'all' ? [...PLATFORMS] : rule.platforms;
    const extra = rulePlatforms.filter((p) => !scoped.includes(p));
    if (extra.length) problem = `sentence is under "${section}" but the rule also claims ${extra.join(', ')}`;
  }
  return { id: rule.id, ok: !problem, matches: units.length, problem, quote: unit.text, section };
}
