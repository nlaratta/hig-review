/**
 * HIGService: the logic behind the MCP tools, independent of the MCP transport.
 */

import { HIGClient, HIGNotFoundError, HIG_PAGE_BASE } from './client.js';
import { Catalog, CatalogEntry, buildCatalog } from './catalog.js';
import { docPlatforms, pageUrl } from './doc.js';
import { extractHeadings, renderGuideline } from './render.js';
import { searchEntries } from './search.js';
import { GetGuidelineParams, BrowseSectionParams, HIGServerError, SearchHIGParams } from '../types/index.js';

/** Turn "buttons", "components/buttons", "/buttons" or a HIG URL into a slug candidate. */
export function normalizeId(input: string): string {
  let s = input.trim();
  if (/^https?:\/\//i.test(s)) {
    let url: URL;
    try {
      url = new URL(s);
    } catch {
      throw new HIGServerError('INVALID_ID', `Not a valid URL: ${input}`);
    }
    if (url.hostname !== 'developer.apple.com') {
      throw new HIGServerError('INVALID_ID', 'Only developer.apple.com Human Interface Guidelines URLs are supported');
    }
    s = url.pathname.replace(/^\/design\/human-interface-guidelines/i, '');
  }
  const segments = s.split(/[/#?]/).filter(Boolean);
  return (segments[segments.length - 1] ?? '').toLowerCase();
}

function line(entry: CatalogEntry): string {
  const kind = entry.isGroup ? ' (section)' : '';
  const abstract = entry.abstract ? `\n   ${entry.abstract}` : '';
  return `**${entry.title}**${kind}${abstract}\n   ${entry.url}`;
}

export class HIGService {
  private catalogPromise: Promise<Catalog> | null = null;
  private catalog: Catalog | null = null;

  constructor(private client: HIGClient) {}

  public catalogSize(): number | null {
    return this.catalog?.size ?? null;
  }

  public clientStats() {
    return this.client.cacheStats();
  }

  public async getCatalog(): Promise<Catalog> {
    if (!this.catalogPromise) {
      this.catalogPromise = buildCatalog(this.client)
        .then((c) => (this.catalog = c))
        .catch((err) => {
          this.catalogPromise = null; // allow retry
          throw err;
        });
    }
    return this.catalogPromise;
  }

  private async resolve(input: string): Promise<{ slug: string; entry?: CatalogEntry }> {
    const catalog = await this.getCatalog();
    const slug = normalizeId(input);
    const byslug = catalog.get(slug);
    if (byslug) return { slug, entry: byslug };
    // Allow matching by title, e.g. "Dark Mode".
    const wanted = input.trim().toLowerCase();
    const byTitle = [...catalog.values()].find((e) => e.title.toLowerCase() === wanted);
    if (byTitle) return { slug: byTitle.slug, entry: byTitle };
    return { slug };
  }

  /** Keep entries whose page declares support for `platform`; pages that declare nothing pass. */
  private async supportsPlatform(slug: string, platform: string): Promise<boolean> {
    try {
      const platforms = docPlatforms(await this.client.getDoc(slug));
      return platforms ? platforms.includes(platform) : true;
    } catch {
      return true;
    }
  }

  public async search(params: SearchHIGParams): Promise<string> {
    const catalog = await this.getCatalog();
    const limit = params.limit ?? 10;
    const pool = params.platform ? limit * 3 : limit;
    let hits = searchEntries([...catalog.values()], params.query, { category: params.category, limit: pool });

    if (params.platform) {
      const kept = [];
      for (const hit of hits) {
        if (kept.length >= limit) break;
        if (hit.entry.isGroup || (await this.supportsPlatform(hit.entry.slug, params.platform))) kept.push(hit);
      }
      hits = kept;
    }

    if (hits.length === 0) {
      return `No results for "${params.query}"${params.category ? ` in category "${params.category}"` : ''}${
        params.platform ? ` for ${params.platform}` : ''
      }. Try browse_hig to see what is available.`;
    }
    const body = hits.map((h, i) => `${i + 1}. ${line(h.entry)}\n   id: ${h.entry.slug} | category: ${h.entry.path[0]}`);
    return [
      `Found ${hits.length} result${hits.length === 1 ? '' : 's'} for "${params.query}" (searches page titles, names and summaries; use get_guideline to read a page):`,
      '',
      body.join('\n\n'),
    ].join('\n');
  }

  public async getGuideline(params: GetGuidelineParams): Promise<string> {
    const { slug, entry } = await this.resolve(params.guidelineId);
    if (!slug) throw new HIGServerError('INVALID_ID', 'Guideline ID cannot be empty');
    try {
      const doc = await this.client.getDoc(slug);
      let text = renderGuideline(slug, doc, { includeImages: params.includeExamples !== false });
      if (entry?.isGroup || (doc.topicSections?.length ?? 0) > 0) {
        const catalog = await this.getCatalog();
        const children = (catalog.get(slug)?.children ?? []).map((s) => catalog.get(s)).filter((e): e is CatalogEntry => !!e);
        if (children.length) {
          text += `\n\nPages in this section:\n${children.map((c) => `- ${c.title} (id: ${c.slug})`).join('\n')}`;
        }
      }
      return text;
    } catch (err) {
      if (err instanceof HIGNotFoundError) {
        const catalog = await this.getCatalog();
        const near = searchEntries([...catalog.values()], params.guidelineId.replace(/[-_/]+/g, ' '), { limit: 5 });
        const hint = near.length ? ` Did you mean: ${near.map((h) => h.entry.slug).join(', ')}?` : '';
        throw new HIGServerError('NOT_FOUND', `${err.message}.${hint}`);
      }
      throw err;
    }
  }

  public async browse(params: BrowseSectionParams): Promise<string> {
    const catalog = await this.getCatalog();
    const raw = params.section?.trim() ?? '';
    const isRoot = raw === '' || raw === '/' || raw.toLowerCase() === 'root' || raw.replace(/\/+$/, '') === HIG_PAGE_BASE;

    let title = 'Human Interface Guidelines';
    let url = pageUrl('');
    let children: CatalogEntry[];
    let outline = '';

    if (isRoot) {
      children = [...catalog.values()].filter((e) => e.parent === null);
    } else {
      const { slug, entry } = await this.resolve(raw);
      if (!entry) {
        const near = searchEntries([...catalog.values()], raw.replace(/[-_/]+/g, ' '), { limit: 5 });
        throw new HIGServerError(
          'NOT_FOUND',
          `Unknown section "${raw}".${near.length ? ` Did you mean: ${near.map((h) => h.entry.slug).join(', ')}?` : ''}`
        );
      }
      title = entry.title;
      url = entry.url;
      children = entry.children.map((s) => catalog.get(s)).filter((e): e is CatalogEntry => !!e);
      if (!entry.isGroup) {
        const doc = await this.client.getDoc(slug);
        const heads = extractHeadings(doc).filter((h) => h.level <= 3);
        outline = `\nThis is a page, not a section. Its outline:\n${heads.map((h) => `${'  '.repeat(h.level - 2)}- ${h.text}`).join('\n')}\nUse get_guideline with id "${slug}" to read it.\n`;
      }
    }

    let note = '';
    if (params.platform) {
      const cap = 30;
      const checked: CatalogEntry[] = [];
      for (const [i, c] of children.entries()) {
        if (i >= cap) break;
        if (c.isGroup || (await this.supportsPlatform(c.slug, params.platform))) checked.push(c);
      }
      if (children.length > cap) {
        note = `\n(Platform filter "${params.platform}" applied to the first ${cap} of ${children.length} entries only; the rest are not shown.)`;
      }
      children = checked;
    }

    const trailPath = isRoot ? [] : (catalog.get(normalizeId(raw))?.path ?? []);
    const trail = trailPath.length > 1 ? ` (${trailPath.join(' > ')})` : '';
    const list = children.length ? children.map((c, i) => `${i + 1}. ${line(c)}\n   id: ${c.slug}`).join('\n\n') : '(no sub-pages)';
    return `# ${title}${trail}\n${url}\n${outline}\n${children.length} item${children.length === 1 ? '' : 's'}${
      params.platform ? ` for ${params.platform}` : ''
    }:\n\n${list}${note}`;
  }
}
