import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENTS, RULES, SEVERITIES, appliesTo, ruleFor } from '../src/rules/registry.js';
import { Citer, citeFromDoc, findUnits, flattenDoc, normalize, splitSentences } from '../src/rules/citation.js';
import { buildChecklist, resolveComponent, selectRules } from '../src/rules/checklist.js';
import { checkContrast, composite, contrastRatio, parseColor } from '../src/rules/contrast.js';
import { checkRule, headingPlatforms } from '../src/rules/verify.js';
import { PLATFORMS } from '../src/types/index.js';
import { HEURISTICS } from '../src/swift/heuristics.js';
import { SERVER_VERSION } from '../src/utils/config.js';
import pkg from '../package.json' with { type: 'json' };
import { syntheticPage } from './fixtures/pages.js';

describe('rule registry integrity', () => {
  it('has unique ids', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(RULES.map((r) => [r.id, r] as const))('%s is well formed', (_id, r) => {
    expect(r.source.slug).toMatch(/^[a-z0-9-]+$/);
    expect(r.source.phrase.length).toBeGreaterThanOrEqual(5);
    expect(r.source.phrase.length).toBeLessThanOrEqual(120); // locator, not a copy of Apple's text
    expect(SEVERITIES).toContain(r.severity);
    expect(r.components.length).toBeGreaterThan(0);
    for (const c of r.components) expect(Object.keys(COMPONENTS)).toContain(c);
    if (r.platforms !== 'all') {
      expect(r.platforms.length).toBeGreaterThan(0);
      for (const p of r.platforms) expect(PLATFORMS).toContain(p);
    }
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.check.length).toBeGreaterThan(10);
  });

  it('every component has at least one rule', () => {
    for (const c of Object.keys(COMPONENTS)) expect(RULES.some((r) => r.components.includes(c)), c).toBe(true);
  });

  it('has per-platform variants for control and text sizes', () => {
    for (const p of PLATFORMS) {
      expect(ruleFor('controls.size', p)?.data?.minimumPt, p).toBeGreaterThan(0);
      expect(ruleFor('type.size', p)?.data?.minimumPt, p).toBeGreaterThan(0);
    }
  });

  it('docs/RULES.md lists every rule and heuristic', () => {
    const doc = fs.readFileSync(new URL('../docs/RULES.md', import.meta.url), 'utf8');
    for (const r of RULES) expect(doc, r.id).toContain(`| \`${r.id}\` |`);
    for (const h of HEURISTICS) expect(doc, h.id).toContain(`| \`${h.id}\` |`);
  });

  it('filters by platform', () => {
    const watch = RULES.find((r) => r.id === 'actionsheet.max-buttons.watchos')!;
    expect(appliesTo(watch, 'watchos')).toBe(true);
    expect(appliesTo(watch, 'ios')).toBe(false);
    expect(appliesTo(watch, undefined)).toBe(true);
  });
});

describe('citations', () => {
  const page = syntheticPage();

  it('normalizes quotes, dashes and spacing', () => {
    expect(normalize('That’s it —  done')).toBe("that's it - done");
  });

  it('splits sentences, including ones that start with a platform name', () => {
    expect(splitSentences('Use 4.5:1 here, e.g. for text. iOS does this. Next one!')).toEqual([
      'Use 4.5:1 here, e.g. for text.',
      'iOS does this.',
      'Next one!',
    ]);
  });

  it('flattens paragraphs, lists, asides, tables and tabs with their headings', () => {
    const units = flattenDoc(page);
    const texts = units.map((u) => u.text);
    expect(texts).toContain('Prefer round corners.');
    expect(texts).toContain('Tabs hide sentences too.');
    expect(texts).toContain('watchOS | 20x20 pt');
    expect(texts).toContain('Use the tidy() helper, see Shelves.');
    const row = units.find((u) => u.kind === 'table-row')!;
    expect(row.tableHeader).toBe('Platform | Size');
    expect(row.headingPath).toEqual(['Platform considerations', 'watchOS']);
    expect(findUnits(units, "widget that's tidy")[0].heading?.anchor).toBe('Best-practices');
  });

  it('builds a verified citation with a section anchor and the full sentence', () => {
    const c = citeFromDoc('widgets', page, "A widget that's tidy is easy");
    expect(c).toMatchObject({
      verified: true,
      page: 'Widgets',
      url: 'https://developer.apple.com/design/human-interface-guidelines/widgets#Best-practices',
      section: 'Best practices',
      quote: 'A widget that’s tidy is easy to scan — even at a glance.',
    });
  });

  it('returns verified:false (no quote) when the phrase is gone', () => {
    const c = citeFromDoc('widgets', page, 'this sentence was removed');
    expect(c.verified).toBe(false);
    expect(c.quote).toBeUndefined();
    expect(c.note).toMatch(/Not verified against the current HIG/);
    expect(c.url).toBe('https://developer.apple.com/design/human-interface-guidelines/widgets');
  });

  it('returns verified:false when the page cannot be fetched', async () => {
    const citer = new Citer(async () => {
      throw new Error('offline');
    });
    const c = await citer.cite('widgets', 'anything');
    expect(c.verified).toBe(false);
    expect(c.note).toMatch(/could not fetch the page \(offline\)/);
  });

  it('detects platform-scoped headings and mis-scoped rules', () => {
    expect(headingPlatforms('iOS, iPadOS')).toEqual(['ios', 'ipados']);
    expect(headingPlatforms('Best practices')).toBeNull();
    const base = { id: 'x', title: 'x', components: ['button'], severity: 'low' as const, check: 'xxxxxxxxxxx' };
    const phrase = 'Avoid more than two widgets on a watch';
    expect(checkRule({ ...base, platforms: ['watchos'], source: { slug: 'w', phrase } }, page).ok).toBe(true);
    expect(checkRule({ ...base, platforms: 'all', source: { slug: 'w', phrase } }, page).problem).toMatch(/also claims/);
    expect(checkRule({ ...base, platforms: 'all', source: { slug: 'w', phrase: 'nope nope' } }, page).ok).toBe(false);
  });
});

describe('hig_checklist', () => {
  it('resolves aliases to components', () => {
    expect(resolveComponent('Tab Bar').component).toBe('tab-bar');
    expect(resolveComponent('TabView').component).toBe('tab-bar');
    expect(resolveComponent('nav bar').component).toBe('toolbar');
    expect(resolveComponent('navigation bar').component).toBe('toolbar');
    expect(resolveComponent('text/typography').component).toBe('typography');
    expect(resolveComponent('layout/safe area').component).toBe('layout');
    expect(resolveComponent('SF Symbols').component).toBe('sf-symbols');
    expect(resolveComponent('dark mode').component).toBe('dark-mode');
    expect(resolveComponent('primary button').component).toBe('button');
    expect(resolveComponent('settings list').component).toBe('list');
  });

  it('suggests alternatives for unknown components', () => {
    const r = resolveComponent('tabbbar');
    expect(r.component).toBeNull();
    expect(r.suggestions).toContain('tab-bar');
    expect(resolveComponent('quantum flux').component).toBeNull();
  });

  it('selects rules by component and platform, high severity first', () => {
    const ios = selectRules(['button'], 'ios').map((r) => r.id);
    expect(ios).toContain('controls.size.ios');
    expect(ios).not.toContain('controls.size.macos');
    expect(ios[0]).toMatch(/^(controls\.size\.ios|buttons\.hit-region|a11y\.labels)$/);
    const all = selectRules(['button']).map((r) => r.id);
    expect(all).toContain('controls.size.macos');
  });

  it('builds a checklist with citations and unknowns', async () => {
    const page = syntheticPage();
    const fetched: string[] = [];
    const citer = new Citer(async (slug) => {
      fetched.push(slug);
      return page;
    });
    const list = await buildChecklist(['alert', 'wibble'], 'ios', citer);
    expect(list.components).toEqual([{ requested: 'alert', component: 'alert', name: 'Alerts' }]);
    expect(list.unknown[0].requested).toBe('wibble');
    expect(list.rules.map((r) => r.id)).toContain('alert.max-buttons');
    expect(list.rules.every((r) => r.citation.verified === false)).toBe(true);
    expect(list.unverified).toBe(list.rules.length);
    expect(new Set(fetched)).toEqual(new Set(list.rules.map((r) => RULES.find((x) => x.id === r.id)!.source.slug)));
  });
});

describe('check_contrast', () => {
  it('parses hex, short hex, alpha hex and rgb()', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor('#FF000080')).toEqual({ r: 255, g: 0, b: 0, a: 128 / 255 });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10,20,30,0.5)').a).toBe(0.5);
    expect(parseColor('rgb(100% 0% 0% / 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(() => parseColor('blue')).toThrow(/Cannot parse/);
  });

  it('matches known WCAG values', () => {
    expect(contrastRatio(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColor('#fff'), parseColor('#fff'))).toBeCloseTo(1, 5);
    expect(contrastRatio(parseColor('#777777'), parseColor('#fff'))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(parseColor('#767676'), parseColor('#fff'))).toBeCloseTo(4.54, 2);
  });

  it('decides pass/fail on the unrounded ratio', () => {
    const fail = checkContrast({ foreground: '#777777', background: '#ffffff', fontSizePt: 17 });
    expect(fail.wcag.aaNormalText).toBe(false);
    expect(fail.hig).toMatchObject({ category: 'regular', requiredRatio: 4.5, pass: false });
    const pass = checkContrast({ foreground: '#767676', background: '#ffffff', fontSizePt: 17 });
    expect(pass.hig.pass).toBe(true);
    expect(pass.ratio).toBe(4.54);
  });

  it('uses the HIG categories: 18 pt and up, or bold, need 3:1', () => {
    expect(checkContrast({ foreground: '#949494', background: '#fff', fontSizePt: 18 }).hig).toMatchObject({ category: 'large', pass: true });
    expect(checkContrast({ foreground: '#949494', background: '#fff', fontSizePt: 12, bold: true }).hig).toMatchObject({ category: 'bold', pass: true });
    expect(checkContrast({ foreground: '#949494', background: '#fff', fontSizePt: 12 }).hig).toMatchObject({ category: 'regular', pass: false });
    expect(checkContrast({ foreground: '#949494', background: '#fff' }).hig).toMatchObject({ category: null, pass: null, largeOrBoldTextPass: true });
  });

  it('composites a translucent foreground over the background', () => {
    expect(composite(parseColor('#00000080'), parseColor('#ffffff'))).toMatchObject({ r: 127, g: 127, b: 127 });
    const r = checkContrast({ foreground: '#00000080', background: '#ffffff' });
    expect(r.effectiveForeground).toBe('#7F7F7F');
    expect(r.notes.join(' ')).toMatch(/composited over the background/);
  });

  it('reports the worse case for a translucent background', () => {
    const r = checkContrast({ foreground: '#ffffff', background: 'rgba(0,0,0,0.5)' });
    expect(r.effectiveBackground).toBe('#808080'); // over white is the worse case for white text
    expect(r.notes.join(' ')).toMatch(/worse ratio/);
  });
});

describe('versioning', () => {
  it('keeps package.json, config and plugin manifest versions in sync', () => {
    const plugin = JSON.parse(fs.readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
    expect(SERVER_VERSION).toBe(pkg.version);
    expect(plugin.version).toBe(pkg.version);
    expect(plugin.name).toBe(pkg.name);
  });
});
