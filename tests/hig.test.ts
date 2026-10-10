import { describe, expect, it, vi } from 'vitest';
import { ancestorSlugs, childSlugs, docPlatforms, inlineToText, slugFromIdentifier } from '../src/hig/doc.js';
import { renderGuideline, extractHeadings } from '../src/hig/render.js';
import { buildCatalog, entriesFromGroupDoc } from '../src/hig/catalog.js';
import { lexicalScore, searchEntries, tokenize } from '../src/hig/search.js';
import { HIGClient, HIGNotFoundError } from '../src/hig/client.js';
import { HIGService, normalizeId } from '../src/hig/service.js';
import { RateLimiter } from '../src/hig/RateLimiter.js';
import { SERVER_VERSION } from '../src/utils/config.js';
import pkg from '../package.json' with { type: 'json' };
import { buttonsDoc, componentsDoc, foundationsDoc, rootDoc } from './fixtures/docs.js';

const docs: Record<string, unknown> = {
  '': rootDoc,
  foundations: foundationsDoc,
  components: componentsDoc,
  buttons: buttonsDoc,
};

/** A fetch that serves the fixtures and counts calls. */
function fakeFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    const slug = u.endsWith('human-interface-guidelines.json') ? '' : /\/([^/]+)\.json$/.exec(u)![1];
    if (slug in docs) {
      return new Response(JSON.stringify(docs[slug]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('<html>app shell</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  });
}

function makeClient(fetchImpl = fakeFetch(), ttlMs = 60_000) {
  return {
    fetchImpl,
    client: new HIGClient({
      userAgent: 'test-agent',
      ttlMs,
      cacheDir: null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimiter: new RateLimiter(1000, 4, 0),
    }),
  };
}

describe('doc helpers', () => {
  it('extracts slugs from identifiers and paths', () => {
    expect(slugFromIdentifier('doc://com.apple.HIG/design/Human-Interface-Guidelines/Buttons')).toBe('buttons');
    expect(slugFromIdentifier('/design/human-interface-guidelines/color#Dark')).toBe('color');
    expect(slugFromIdentifier('doc://com.apple.documentation/documentation/uikit')).toBeNull();
    expect(slugFromIdentifier(undefined)).toBeNull();
  });

  it('reads children, ancestors, platforms and inline text', () => {
    expect(childSlugs(foundationsDoc)).toEqual(['color']); // anchors are not pages
    expect(ancestorSlugs(buttonsDoc)).toEqual(['components']);
    expect(docPlatforms(buttonsDoc)).toEqual(['ios', 'macos']);
    expect(docPlatforms(rootDoc)).toBeNull();
    expect(inlineToText([{ type: 'text', text: 'a ' }, { type: 'strong', inlineContent: [{ type: 'text', text: 'b' }] }])).toBe('a b');
  });
});

describe('renderGuideline', () => {
  const md = renderGuideline('buttons', buttonsDoc, { includeImages: true });

  it('renders title, source, platforms and abstract', () => {
    expect(md).toMatch(/^# Buttons/);
    expect(md).toContain('Source: https://developer.apple.com/design/human-interface-guidelines/buttons');
    expect(md).toContain('Platforms: ios, macos');
    expect(md).toContain('> A button initiates an instantaneous action.');
  });

  it('renders inline markup, references, headings, lists, asides and tables', () => {
    expect(md).toContain('Use **clear** labels, see [Menus](https://developer.apple.com/design/human-interface-guidelines/menus).');
    expect(md).toContain('## Best practices');
    expect(md).toContain('- First\n- Second');
    expect(md).toContain('> **Note:** Mind the hit region.');
    expect(md).toContain('| Size | Use |\n| --- | --- |\n| 44pt | a\\|b |');
  });

  it('toggles image descriptions and always credits Apple', () => {
    expect(md).toContain('[Image: A sample picture]');
    expect(renderGuideline('buttons', buttonsDoc, { includeImages: false })).not.toContain('A sample picture');
    expect(md).toMatch(/Copyright Apple Inc\. This server is unofficial/);
  });

  it('lists headings', () => {
    expect(extractHeadings(buttonsDoc)).toEqual([{ level: 2, text: 'Best practices' }]);
  });
});

describe('catalog', () => {
  it('builds entries from a group doc', () => {
    const entries = entriesFromGroupDoc(rootDoc, null, []);
    expect(entries.map((e) => [e.slug, e.title, e.isGroup, e.path])).toEqual([
      ['foundations', 'Foundations', true, ['foundations']],
      ['components', 'Components', true, ['components']],
    ]);
  });

  it('crawls groups into a tree', async () => {
    const { client } = makeClient();
    const catalog = await buildCatalog(client);
    expect([...catalog.keys()].sort()).toEqual(['buttons', 'color', 'components', 'foundations', 'menus']);
    expect(catalog.get('components')!.children).toEqual(['buttons', 'menus']);
    expect(catalog.get('buttons')!.path).toEqual(['components', 'buttons']);
    expect(catalog.get('buttons')!.abstract).toBe('A button initiates an instantaneous action.');
  });
});

describe('search ranking', () => {
  const entries = [
    ...entriesFromGroupDoc(componentsDoc, 'components', ['components']),
    ...entriesFromGroupDoc(foundationsDoc, 'foundations', ['foundations']),
    ...entriesFromGroupDoc(rootDoc, null, []),
  ];

  it('tokenizes with simple plural folding', () => {
    expect(tokenize('Buttons and Menus!')).toEqual(['button', 'and', 'menu']);
  });

  it('ranks exact title above abstract mentions', () => {
    const [button] = entries.filter((e) => e.slug === 'buttons');
    const [menu] = entries.filter((e) => e.slug === 'menus');
    expect(lexicalScore(button, 'buttons')).toBe(100);
    expect(lexicalScore(button, 'button')).toBe(100);
    expect(lexicalScore(menu, 'action')).toBeLessThan(lexicalScore(button, 'button'));
  });

  it('finds by title, abstract and typo, best first', () => {
    expect(searchEntries(entries, 'buttons')[0].entry.slug).toBe('buttons');
    expect(searchEntries(entries, 'instantaneous')[0].entry.slug).toBe('buttons');
    expect(searchEntries(entries, 'buton')[0].entry.slug).toBe('buttons');
    expect(searchEntries(entries, 'zzzzqq')).toEqual([]);
  });

  it('filters by category and respects limit', () => {
    expect(searchEntries(entries, 'color', { category: 'components' })).toEqual([]);
    expect(searchEntries(entries, 'color', { category: 'foundations' })[0].entry.slug).toBe('color');
    expect(searchEntries(entries, 'a', { limit: 1 }).length).toBeLessThanOrEqual(1);
  });
});

describe('normalizeId', () => {
  it('accepts names, paths and URLs', () => {
    expect(normalizeId('Buttons')).toBe('buttons');
    expect(normalizeId('components/buttons')).toBe('buttons');
    expect(normalizeId('/components/')).toBe('components');
    expect(normalizeId('https://developer.apple.com/design/human-interface-guidelines/color#Dark')).toBe('color');
  });

  it('rejects other hosts', () => {
    expect(() => normalizeId('https://example.com/design/human-interface-guidelines/buttons')).toThrow();
  });
});

describe('HIGClient', () => {
  it('sends a descriptive User-Agent and caches in memory', async () => {
    const { client, fetchImpl } = makeClient();
    await client.getDoc('buttons');
    await client.getDoc('buttons');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('test-agent');
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://developer.apple.com/tutorials/data/design/human-interface-guidelines/buttons.json');
  });

  it('treats an HTML app-shell response as not found', async () => {
    const { client } = makeClient();
    await expect(client.getDoc('nope')).rejects.toBeInstanceOf(HIGNotFoundError);
  });

  it('refuses slugs that could escape the path', async () => {
    const { client, fetchImpl } = makeClient();
    await expect(client.getDoc('../../etc/passwd')).rejects.toBeInstanceOf(HIGNotFoundError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('HIGService', () => {
  const service = () => new HIGService(makeClient().client);

  it('searches, reads and browses via the catalog', async () => {
    const s = service();
    expect(await s.search({ query: 'buttons', limit: 10 })).toMatch(/1\. \*\*Buttons\*\*[\s\S]*id: buttons \| category: components/);
    expect(await s.getGuideline({ guidelineId: 'components/buttons', includeExamples: true, includeCode: true })).toMatch(/^# Buttons/);
    const top = await s.browse({ section: '' });
    expect(top).toMatch(/Foundations[\s\S]*Components/);
    expect(await s.browse({ section: 'components' })).toMatch(/2 items[\s\S]*Buttons[\s\S]*Menus/);
  });

  it('applies the platform filter using page metadata', async () => {
    const s = service();
    expect(await s.search({ query: 'buttons', platform: 'macos', limit: 10 })).toContain('id: buttons');
    expect(await s.search({ query: 'buttons', platform: 'watchos', limit: 10 })).toMatch(/^No results/);
  });

  it('suggests alternatives for unknown pages', async () => {
    await expect(service().getGuideline({ guidelineId: 'butons', includeExamples: true, includeCode: true })).rejects.toThrow(/Did you mean: buttons/);
  });
});

describe('versioning', () => {
  it('keeps SERVER_VERSION in sync with package.json', () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});
