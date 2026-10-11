import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { COMPONENTS, RULES, SEVERITIES, appliesTo, ruleFor } from '../src/rules/registry.js';
import { Citer, citeFromDoc, findUnits, flattenDoc, normalize, splitSentences } from '../src/rules/citation.js';
import { buildChecklist, resolveComponent, selectRules } from '../src/rules/checklist.js';
import { checkContrast, composite, contrastRatio, parseColor } from '../src/rules/contrast.js';
import { checkRule, dataProblems, hedgeProblem, headingPlatforms, verifyRegistry } from '../src/rules/verify.js';
import { HIGClient } from '../src/hig/client.js';
import { RateLimiter } from '../src/hig/RateLimiter.js';
import { PLATFORMS, type ApplePlatform } from '../src/types/index.js';
import { HEURISTICS } from '../src/swift/heuristics.js';
import { renderRulesDoc } from '../src/rules/doc.js';
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
    expect(r.source.phrase.length).toBeLessThanOrEqual(60); // a locator fragment, not a copy of Apple's text
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

  it('keeps hedged guidance hedged (should-fix 3)', () => {
    const check = (id: string) => RULES.find((r) => r.id === id)!.check;
    expect(check('color.all-contexts')).not.toMatch(/variants/);
    expect(check('tabbar.symbols')).toMatch(/Prefer SF Symbols.*custom icons/);
    expect(check('onboarding.optional-tutorial')).toMatch(/^Consider/);
    expect(check('a11y.larger-text')).toMatch(/^Ideally/);
    // Absolute wording only where Apple's own sentence is absolute ("Always", "Don't").
    const absolute = ['buttons.press-state', 'textfield.secure', 'tabbar.no-disabled-tabs', 'buttons.destructive-not-primary', 'icon.no-apple-hardware', 'launch.no-ads'];
    for (const r of RULES) {
      if (absolute.includes(r.id)) continue;
      expect(r.check, r.id).not.toMatch(/\b(must|never|always|required?)\b/i);
    }
  });

  it('every number in a check is backed by its own cited text (should-fix 4)', () => {
    for (const r of RULES) {
      const nums = (r.check.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      const backed = new Set([...Object.values(r.data ?? {}), ...(r.source.phrase.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)]);
      for (const n of nums) expect(backed.has(n), `${r.id}: ${n}`).toBe(true);
    }
    expect(RULES.map((r) => r.id)).toEqual(expect.arrayContaining(['controls.spacing.bezeled', 'controls.spacing.borderless', 'contrast.preferred']));
    expect(RULES.find((r) => r.id === 'contrast.all-appearances')!.check).not.toMatch(/7/);
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

  it('docs/RULES.md is generated from the registry (paraphrases cannot drift)', () => {
    const doc = fs.readFileSync(new URL('../docs/RULES.md', import.meta.url), 'utf8');
    expect(doc).toBe(renderRulesDoc());
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

  it('refuses an ambiguous locator at runtime: verified:false, no quote (blocker 2)', () => {
    const c = citeFromDoc('widgets', page, 'widget');
    expect(c.verified).toBe(false);
    expect(c.quote).toBeUndefined();
    expect(c.note).toMatch(/matches \d+ sentences/);
  });

  it('marks a match on a stale cached copy as unverified with provenance (should-fix 11)', async () => {
    const fetchedAt = Date.UTC(2026, 0, 2);
    const stale = await new Citer(async () => ({ doc: page, fetchedAt, stale: true })).cite('widgets', "widget that's tidy");
    expect(stale).toMatchObject({ verified: false, source: 'stale-cache', retrievedAt: '2026-01-02T00:00:00.000Z' });
    expect(stale.quote).toBeDefined();
    expect(stale.note).toMatch(/cached copy from 2026-01-02.*not verified against the current HIG/);
    const live = await new Citer(async () => ({ doc: page, fetchedAt, stale: false })).cite('widgets', "widget that's tidy");
    expect(live).toMatchObject({ verified: true, source: 'live' });
  });

  it('memoizes failed fetches within one Citer (should-fix 12)', async () => {
    const getter = vi.fn(async () => {
      throw new Error('offline');
    });
    const citer = new Citer(getter);
    for (let i = 0; i < 6; i++) await citer.cite('typography', 'x');
    await citer.cite('accessibility', 'x');
    expect(getter).toHaveBeenCalledTimes(2);
  });

  it('HIGClient reports a stale fallback copy', async () => {
    let ok = true;
    const fetchImpl = vi.fn(async () => {
      if (!ok) throw new TypeError('network down');
      return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client = new HIGClient({
      userAgent: 't',
      ttlMs: 1,
      cacheDir: null,
      retries: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimiter: new RateLimiter(1000, 4, 0),
    });
    expect((await client.getDocInfo('widgets')).stale).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    ok = false;
    const info = await client.getDocInfo('widgets');
    expect(info.stale).toBe(true);
    expect(info.doc).toEqual(page);
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

  it('checks numeric data against the matched table row (should-fix 1)', () => {
    const rule = (phrase: string) => ({
      id: 'x', title: 'x', components: ['button'], severity: 'low' as const, check: 'xxxxxxxxxxx', platforms: ['watchos'] as ApplePlatform[],
      source: { slug: 'w', phrase }, data: { defaultPt: 20, minimumPt: 28 },
    });
    // The synthetic row is "watchOS | 20x20 pt": the default column matches, the minimum column is missing.
    expect(checkRule(rule('watchOS | 20x20 pt'), page).problem).toMatch(/minimumPt 28/);
    expect(dataProblems(rule('x'), 'iOS, iPadOS | 44x44 pt | 32x32 pt')).toEqual(['defaultPt 20 != "44x44 pt"', 'minimumPt 28 != "32x32 pt"']);
    expect(dataProblems({ ...rule('x'), data: { ratio: 4.5 } }, 'no lower than 4.5:1')).toEqual([]);
    expect(dataProblems({ ...rule('x'), data: { maxButtons: 3 } }, 'up to three buttons')).toEqual([]);
    expect(dataProblems({ ...rule('x'), data: { ratio: 7 } }, 'no lower than 4.5:1')).toHaveLength(1);
  });

  it('control and text size locators include both numeric columns', () => {
    for (const r of RULES.filter((x) => /^(controls|type)\.size\./.test(x.id))) {
      expect(r.source.phrase.split('|').length, r.id).toBe(3);
    }
  });

  it('respects page-level supported-platforms (should-fix 2)', () => {
    const scoped = { ...page, metadata: { ...page.metadata, customMetadata: { 'supported-platforms': 'ios,ipados,macos' } } };
    const base = { id: 'x', title: 'x', components: ['button'], severity: 'low' as const, check: 'xxxxxxxxxxx', source: { slug: 'w', phrase: 'Prefer round corners' } };
    expect(checkRule({ ...base, platforms: 'all' }, scoped).problem).toMatch(/supports ios, ipados, macos but the rule also claims watchos, tvos, visionos/);
    expect(checkRule({ ...base, platforms: ['ios', 'macos'] }, scoped).ok).toBe(true);
  });

  it('scopes rules to the platforms their source pages cover', () => {
    const plat = (id: string) => RULES.find((r) => r.id === id)!.platforms;
    for (const r of RULES.filter((x) => x.source.slug === 'dark-mode')) {
      expect(r.platforms, r.id).not.toBe('all');
      expect(r.platforms as string[], r.id).not.toContain('watchos');
      expect(r.platforms as string[], r.id).not.toContain('visionos');
    }
    for (const r of RULES.filter((x) => x.source.slug === 'tab-bars' || x.source.slug === 'segmented-controls')) {
      expect(r.platforms as string[], r.id).not.toContain('watchos');
      expect(r.platforms, r.id).not.toBe('all');
    }
    for (const r of RULES.filter((x) => x.source.slug === 'action-sheets')) {
      expect(r.platforms as string[], r.id).not.toContain('visionos');
      expect(r.platforms, r.id).not.toBe('all');
    }
    expect(plat('dark.both-modes')).toEqual(['ios', 'ipados', 'macos', 'tvos']);
  });

  it('only lets a paraphrase hedge where its source hedges (verify item 6)', () => {
    expect(RULES.find((r) => r.id === 'toolbar.large-title')!.check).toMatch(/^Use a large title/);
    expect(hedgeProblem('Consider a large title.', 'Use a large title to help people stay oriented.')).toMatch(/direct recommendation/);
    expect(hedgeProblem('Consider a large title.', 'Consider using a large title.')).toBeNull();
    expect(hedgeProblem('Use a large title.', 'Use a large title.')).toBeNull();
    const base = { id: 'x', title: 'x', components: ['button'], severity: 'low' as const, platforms: 'all' as const, source: { slug: 'w', phrase: 'Prefer round corners' } };
    expect(checkRule({ ...base, check: 'Ideally, corners are round.' }, page).ok).toBe(true); // source says "Prefer"
    const direct = { ...base, source: { slug: 'w', phrase: 'Widgets are small' } };
    expect(checkRule({ ...direct, check: 'Consider keeping widgets small.' }, page).problem).toMatch(/hedges/);
  });

  it('registry verification rejects stale copies and fetches each page once (verify item 5)', async () => {
    const fake = (stale: boolean) => vi.fn(async () => ({ doc: page, fetchedAt: Date.UTC(2026, 0, 2), stale }));
    const rules = [
      { id: 'a', title: 'a', components: ['button'], severity: 'low' as const, platforms: ['watchos'] as ApplePlatform[], check: 'Prefer round corners.', source: { slug: 'w', phrase: 'Prefer round corners' } },
      { id: 'b', title: 'b', components: ['button'], severity: 'low' as const, platforms: ['watchos'] as ApplePlatform[], check: 'Avoid many widgets.', source: { slug: 'w', phrase: 'Avoid more than two widgets' } },
    ];
    const live = fake(false);
    const ok = await verifyRegistry(rules, live);
    expect(ok.failures).toEqual([]);
    expect(live).toHaveBeenCalledTimes(1);
    const old = await verifyRegistry(rules, fake(true));
    expect(old.stalePages).toEqual(['w']);
    expect(old.failures).toHaveLength(2);
    expect(old.failures[0]).toMatch(/stale cached copy \(fetched 2026-01-02/);
    const down = vi.fn(async () => {
      throw new Error('offline');
    });
    expect((await verifyRegistry(rules, down)).failures[0]).toMatch(/fetch failed: offline/);
    expect(down).toHaveBeenCalledTimes(1);
  });

  it('registry verification fails on HIGClient\'s expired-cache fallback (verify item 5)', async () => {
    let ok = true;
    const fetchImpl = vi.fn(async () => {
      if (!ok) throw new TypeError('network down');
      return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client = new HIGClient({ userAgent: 't', ttlMs: 1, cacheDir: null, retries: 0, fetchImpl: fetchImpl as unknown as typeof fetch, rateLimiter: new RateLimiter(1000, 4, 0) });
    const rules = [{ id: 'a', title: 'a', components: ['button'], severity: 'low' as const, platforms: ['watchos'] as ApplePlatform[], check: 'Prefer round corners.', source: { slug: 'w', phrase: 'Prefer round corners' } }];
    expect((await verifyRegistry(rules, (s) => client.getDocInfo(s))).failures).toEqual([]);
    await new Promise((r) => setTimeout(r, 5));
    ok = false;
    const res = await verifyRegistry(rules, (s) => client.getDocInfo(s));
    expect(res.stalePages).toEqual(['w']);
    expect(res.failures[0]).toMatch(/stale cached copy/);
  });

  it('detects platform-scoped headings and mis-scoped rules', () => {
    expect(headingPlatforms('iOS, iPadOS')).toEqual(['ios', 'ipados']);
    expect(headingPlatforms('Best practices')).toBeNull();
    const base = { id: 'x', title: 'x', components: ['button'], severity: 'low' as const, check: 'xxxxxxxxxxx' };
    const phrase = 'Avoid more than two widgets on a watch';
    expect(checkRule({ ...base, platforms: ['watchos'], source: { slug: 'w', phrase } }, page).ok).toBe(true);
    expect(checkRule({ ...base, platforms: 'all', source: { slug: 'w', phrase } }, page).problem).toMatch(/also claims/);
    expect(checkRule({ ...base, platforms: 'all', source: { slug: 'w', phrase: 'nope nope' } }, page).ok).toBe(false);
    // A phrase that matches more than one sentence is ambiguous and fails.
    expect(checkRule({ ...base, platforms: 'all', source: { slug: 'w', phrase: 'widget' } }, page).problem).toMatch(/ambiguous/);
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
    const none = resolveComponent('quantum flux');
    expect(none.component).toBeNull();
    expect(none.suggestions).toEqual(Object.keys(COMPONENTS)); // nothing close: list everything
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
      return { doc: page, fetchedAt: 0, stale: false };
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

  it('rejects malformed numbers and extra alpha separators (review nit 1)', () => {
    expect(() => parseColor('rgb(0junk,0,0)')).toThrow(/Cannot parse/);
    expect(() => parseColor('rgb(0 0 0 / 0.5 / garbage)')).toThrow(/Cannot parse/);
    expect(() => parseColor('rgb(1,2)')).toThrow(/Cannot parse/);
    expect(() => parseColor('rgb(1,2,3,4,5)')).toThrow(/Cannot parse/);
    expect(() => parseColor('rgb(1, 2, 3 / 0.5)')).not.toThrow();
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
    expect(fail.hig.accessibilityTable).toMatchObject({ category: 'regular', ruleId: 'contrast.text', requiredRatio: 4.5, pass: false });
    const pass = checkContrast({ foreground: '#767676', background: '#ffffff', fontSizePt: 17 });
    expect(pass.hig.accessibilityTable.pass).toBe(true);
    expect(pass.ratio).toBe(4.54);
  });

  it('uses the HIG table categories: 18 pt and up, or bold at any size, need 3:1', () => {
    const t = (fontSizePt?: number, bold?: boolean) => checkContrast({ foreground: '#949494', background: '#fff', fontSizePt, bold }).hig.accessibilityTable;
    expect(t(18)).toMatchObject({ category: 'large', ruleId: 'contrast.large-text', pass: true });
    expect(t(12, true)).toMatchObject({ category: 'bold', ruleId: 'contrast.bold-text', pass: true }); // no WCAG 14 pt cutoff for the HIG row
    expect(t(12)).toMatchObject({ category: 'regular', pass: false });
    expect(t()).toMatchObject({ category: null, pass: null, largeOrBoldTextPass: true });
  });

  it('reports Accessibility-table and Dark Mode verdicts separately (should-fix 5)', () => {
    const r = checkContrast({ foreground: '#949494', background: '#fff', fontSizePt: 12, bold: true });
    expect(r.ratio).toBeLessThan(4.5);
    expect(r.hig.accessibilityTable.pass).toBe(true);
    expect(r.hig.darkModeMinimum).toEqual({ ruleId: 'contrast.all-appearances', requiredRatio: 4.5, pass: false });
    expect(r.hig.darkModePreferred).toEqual({ ruleId: 'contrast.preferred', targetRatio: 7, meets: false });
    expect(r.notes.join(' ')).toMatch(/reported separately/);
    expect((r.hig as Record<string, unknown>).pass).toBeUndefined(); // no single broad "HIG pass"
    expect(RULES.find((x) => x.id === 'contrast.text')!.check).toMatch(/Non-bold/);
  });

  it('composites a translucent foreground over an opaque background', () => {
    expect(composite(parseColor('#00000080'), parseColor('#ffffff'))).toMatchObject({ r: 127, g: 127, b: 127 });
    const r = checkContrast({ foreground: '#00000080', background: '#ffffff' });
    expect(r.compliance).toBe('known');
    expect(r.effectiveForeground).toBe('#7F7F7F');
    expect(r.notes.join(' ')).toMatch(/composited over the background/);
  });

  it('gives no verdict for a translucent background without a backdrop (blocker 1)', () => {
    const r = checkContrast({ foreground: '#767676', background: '#00000000', fontSizePt: 17 });
    expect(r.compliance).toBe('unknown');
    expect(r.ratio).toBeNull();
    expect(r.wcag.aaNormalText).toBeNull();
    expect(r.hig.accessibilityTable.pass).toBeNull();
    expect(r.hig.darkModeMinimum.pass).toBeNull();
    expect(r.scenarios!.map((x) => x.backdrop)).toEqual(['#FFFFFF', '#000000']);
    expect(r.notes.join(' ')).toMatch(/not bounds/);
  });

  it('uses an opaque backdrop when given, and rejects a translucent one', () => {
    const r = checkContrast({ foreground: '#767676', background: '#00000000', backdrop: '#767676', fontSizePt: 17 });
    expect(r.compliance).toBe('known');
    expect(r.ratio).toBe(1);
    expect(r.hig.accessibilityTable.pass).toBe(false);
    expect(() => checkContrast({ foreground: '#000', background: '#fff8', backdrop: '#ffffff80' })).toThrow(/opaque/);
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
