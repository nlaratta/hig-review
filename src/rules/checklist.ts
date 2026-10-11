/**
 * hig_checklist: resolve component names to canonical components, select the rules that apply,
 * and attach live citations.
 */

import Fuse from 'fuse.js';
import type { ApplePlatform } from '../types/index.js';
import { COMPONENTS, RULES, Rule, Severity, appliesTo } from './registry.js';
import type { Citation, Citer } from './citation.js';

export interface Resolution {
  requested: string;
  component: string | null;
  suggestions: string[];
}

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim();

const ALIAS_INDEX: { alias: string; component: string }[] = Object.entries(COMPONENTS).flatMap(([id, c]) =>
  [id, id.replace(/-/g, ' '), c.name, ...c.aliases].map((a) => ({ alias: key(a), component: id }))
);

const fuse = new Fuse(ALIAS_INDEX, { keys: ['alias'], threshold: 0.4, includeScore: true });

export function resolveComponent(input: string): Resolution {
  const k = key(input);
  const exact = ALIAS_INDEX.find((a) => a.alias === k);
  if (exact) return { requested: input, component: exact.component, suggestions: [] };
  // "settings list", "primary button": try each word as a fallback, longest alias first.
  const words = k.split(' ');
  const partial = ALIAS_INDEX.filter((a) => words.length > 1 && (k.includes(a.alias) || words.includes(a.alias))).sort(
    (a, b) => b.alias.length - a.alias.length
  )[0];
  if (partial) return { requested: input, component: partial.component, suggestions: [] };
  const suggestions = [...new Set(fuse.search(k).map((r) => r.item.component))].slice(0, 4);
  return { requested: input, component: null, suggestions };
}

export interface ChecklistRule {
  id: string;
  title: string;
  severity: Severity;
  check: string;
  platforms: string;
  components: string[];
  citation: Citation;
}

export interface Checklist {
  platform: ApplePlatform | 'all';
  components: { requested: string; component: string; name: string }[];
  unknown: { requested: string; suggestions: string[] }[];
  rules: ChecklistRule[];
  verified: number;
  unverified: number;
  howToUse: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function selectRules(components: string[], platform?: ApplePlatform): Rule[] {
  const wanted = new Set(components);
  return RULES.filter((r) => r.components.some((c) => wanted.has(c)) && appliesTo(r, platform)).sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

export async function buildChecklist(names: string[], platform: ApplePlatform | undefined, citer: Citer): Promise<Checklist> {
  const resolved = names.map(resolveComponent);
  const known = resolved.filter((r): r is Resolution & { component: string } => r.component !== null);
  const components = [...new Set(known.map((r) => r.component))];
  const rules = selectRules(components, platform);

  // Fetch one page at a time through the shared client (rate limited and cached).
  const out: ChecklistRule[] = [];
  for (const r of rules) {
    out.push({
      id: r.id,
      title: r.title,
      severity: r.severity,
      check: r.check,
      platforms: r.platforms === 'all' ? 'all' : r.platforms.join(', '),
      components: r.components.filter((c) => components.includes(c)),
      citation: await citer.cite(r.source.slug, r.source.phrase),
    });
  }

  return {
    platform: platform ?? 'all',
    components: known.map((r) => ({ requested: r.requested, component: r.component, name: COMPONENTS[r.component].name })),
    unknown: resolved.filter((r) => r.component === null).map((r) => ({ requested: r.requested, suggestions: r.suggestions })),
    rules: out,
    verified: out.filter((r) => r.citation.verified).length,
    unverified: out.filter((r) => !r.citation.verified).length,
    howToUse:
      'Judge each rule against what you can actually see (or read in code). Report a finding only with its rule id and citation url; mark anything you infer beyond the cited text as a judgment call. Rules with citation.verified=false could not be matched on the live page: read the page before relying on them.' +
      (platform ? '' : ' No platform was given, so platform-specific variants for every platform are included; pass platform to narrow them.'),
  };
}

export function knownComponents(): { id: string; name: string; aliases: string[] }[] {
  return Object.entries(COMPONENTS).map(([id, c]) => ({ id, name: c.name, aliases: c.aliases }));
}
