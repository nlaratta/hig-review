/**
 * Render a DocC page document to Markdown. Pure: no I/O.
 */

import { BlockNode, HIGDoc, InlineNode, RefEntry, docPlatforms, docTitle, inlineToText, pageUrl } from './doc.js';
import { SITE_ROOT } from './client.js';

export interface RenderOptions {
  /** Include image/video alt-text descriptions. */
  includeImages: boolean;
}

export interface Heading {
  level: number;
  text: string;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

class Renderer {
  constructor(
    private doc: HIGDoc,
    private opts: RenderOptions
  ) {}

  private ref(id: string | undefined): RefEntry | undefined {
    return id ? this.doc.references?.[id] : undefined;
  }

  private href(r: RefEntry | undefined): string | undefined {
    if (!r?.url) return undefined;
    return r.url.startsWith('http') ? r.url : `${SITE_ROOT}${r.url}`;
  }

  inline(nodes: InlineNode[] | undefined): string {
    if (!nodes) return '';
    return nodes
      .map((n) => {
        switch (n.type) {
          case 'text':
            return n.text ?? '';
          case 'codeVoice':
            return `\`${n.text ?? ''}\``;
          case 'strong':
            return `**${this.inline(n.inlineContent)}**`;
          case 'emphasis':
            return `*${this.inline(n.inlineContent)}*`;
          case 'reference': {
            const r = this.ref(n.identifier);
            const label = n.overridingTitle ?? r?.title ?? '';
            const href = this.href(r);
            if (!label) return '';
            return href ? `[${label}](${href})` : label;
          }
          case 'link': {
            const label = n.title ?? n.destination ?? '';
            return n.destination ? `[${label}](${n.destination})` : label;
          }
          case 'image': {
            const alt = this.ref(n.identifier)?.alt ?? inlineToText((n as any).metadata?.abstract);
            return this.opts.includeImages && alt ? `[Image: ${alt}]` : '';
          }
          default:
            return n.inlineContent ? this.inline(n.inlineContent) : (n.text ?? '');
        }
      })
      .join('');
  }

  blocks(blocks: BlockNode[] | undefined, indent = ''): string[] {
    const out: string[] = [];
    for (const b of blocks ?? []) {
      const rendered = this.block(b, indent);
      if (rendered) out.push(rendered);
    }
    return out;
  }

  private block(b: BlockNode, indent: string): string {
    switch (b.type) {
      case 'heading':
        return `${'#'.repeat(Math.min(6, (b.level ?? 2) + 0))} ${b.text}`;
      case 'paragraph': {
        const text = this.inline(b.inlineContent).trim();
        return text ? indent + text : '';
      }
      case 'unorderedList':
      case 'orderedList':
        return (b.items ?? [])
          .map((item: { content?: BlockNode[] }, i: number) => {
            const marker = b.type === 'orderedList' ? `${i + 1}.` : '-';
            const parts = this.blocks(item.content, '');
            if (parts.length === 0) return '';
            const [first, ...rest] = parts;
            const pad = ' '.repeat(marker.length + 1);
            return (
              `${indent}${marker} ${first.trimStart()}` +
              rest.map((r) => '\n' + r.split('\n').map((l) => `${indent}${pad}${l}`).join('\n')).join('')
            );
          })
          .filter(Boolean)
          .join('\n');
      case 'table':
        return this.table(b);
      case 'aside': {
        const label = b.name ?? b.style ?? 'Note';
        const body = this.blocks(b.content).join('\n\n');
        return body
          .split('\n')
          .map((l, i) => `> ${i === 0 ? `**${label}:** ` : ''}${l}`)
          .join('\n');
      }
      case 'row': {
        const cols: BlockNode[][] = (b.columns ?? []).map((c: { content?: BlockNode[] }) => c.content ?? []);
        return cols.flatMap((c) => this.blocks(c, indent)).join('\n\n');
      }
      case 'video': {
        const alt = this.ref(b.identifier)?.alt ?? inlineToText(b.metadata?.abstract);
        return this.opts.includeImages && alt ? `[Video: ${alt}]` : '';
      }
      case 'codeListing':
        return '```' + (b.syntax ?? '') + '\n' + (b.code ?? []).join('\n') + '\n```';
      default:
        // links / card groups and unknown block types carry navigation, not prose.
        return b.content ? this.blocks(b.content, indent).join('\n\n') : '';
    }
  }

  private table(b: BlockNode): string {
    const rows: BlockNode[][][] = b.rows ?? [];
    if (rows.length === 0) return '';
    const text = rows.map((r) => r.map((c) => cell(this.blocks(c).join(' '))));
    const width = Math.max(...text.map((r) => r.length));
    const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
    const hasHeader = b.header === 'row' || b.header === 'both';
    const head = hasHeader ? pad(text[0]) : Array(width).fill('');
    const body = hasHeader ? text.slice(1) : text;
    const line = (r: string[]) => `| ${r.join(' | ')} |`;
    return [line(head), line(Array(width).fill('---')), ...body.map((r) => line(pad(r)))].join('\n');
  }
}

/** Headings (levels 2-4) in page order. */
export function extractHeadings(doc: HIGDoc): Heading[] {
  const out: Heading[] = [];
  for (const section of doc.primaryContentSections ?? []) {
    for (const b of section.content ?? []) {
      if (b.type === 'heading' && typeof b.text === 'string') out.push({ level: b.level ?? 2, text: b.text });
    }
  }
  return out;
}

export function renderDocBody(doc: HIGDoc, opts: RenderOptions): string {
  const r = new Renderer(doc, opts);
  const parts: string[] = [];
  for (const section of doc.primaryContentSections ?? []) parts.push(...r.blocks(section.content));
  return parts.join('\n\n');
}

/** Full Markdown rendering of a guideline page, with attribution footer. */
export function renderGuideline(slug: string, doc: HIGDoc, opts: RenderOptions): string {
  const r = new Renderer(doc, opts);
  const platforms = docPlatforms(doc);
  const abstract = r.inline(doc.abstract).trim();
  const lines = [`# ${docTitle(doc)}`, ''];
  lines.push(`Source: ${pageUrl(slug)}`);
  if (platforms) lines.push(`Platforms: ${platforms.join(', ')}`);
  if (abstract) lines.push('', `> ${abstract}`);
  const body = renderDocBody(doc, opts);
  if (body) lines.push('', body);
  lines.push(
    '',
    '---',
    `Content from Apple's Human Interface Guidelines (${pageUrl(slug)}), fetched at runtime. Copyright Apple Inc. This server is unofficial and not affiliated with Apple.`
  );
  return lines.join('\n');
}
