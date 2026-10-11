import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import {
  SearchHIGSchema,
  GetGuidelineSchema,
  BrowseSectionSchema,
  GetServerInfoSchema,
  HigChecklistSchema,
  ReviewSwiftUISchema,
  CheckContrastSchema,
  HIGServerError,
  PLATFORMS,
} from './types/index.js';
import { logger } from './utils/logger.js';
import { getServerConfig, SERVER_NAME, SERVER_VERSION, USER_AGENT } from './utils/config.js';
import { HIGClient } from './hig/client.js';
import { HIGService } from './hig/service.js';
import { Citer } from './rules/citation.js';
import { buildChecklist, knownComponents } from './rules/checklist.js';
import { ColorParseError, checkContrast } from './rules/contrast.js';
import { RULES, ruleById } from './rules/registry.js';
import { loadSwift, reviewSwiftUI } from './swift/review.js';
import { HEURISTICS } from './swift/heuristics.js';

const platformProp = { type: 'string', enum: [...PLATFORMS] };

export const TOOLS = [
  {
    name: 'hig_checklist',
    description:
      "Curated Human Interface Guidelines review rules for the UI components you name, each with a severity, a short check, and a citation fetched live from Apple's HIG (page, section link, one-sentence quote). Call this after YOU have looked at a screenshot or design and listed the components and platform you see; then judge each rule against the image yourself. This tool does not see or analyze images. Unknown component names return suggestions.",
    inputSchema: {
      type: 'object',
      properties: {
        components: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Components or topics to review, e.g. ["tab bar", "button", "list", "typography", "dark mode", "accessibility", "safe area", "app icon"]',
        },
        platform: { ...platformProp, description: 'Target platform; omit to include rules for every platform' },
      },
      required: ['components'],
    },
  },
  {
    name: 'review_swiftui',
    description:
      'Heuristic static checks on SwiftUI source (inline code or a path to a .swift file, max 200 KB): small hit targets, fixed font sizes that ignore Dynamic Type, hard-coded colors, icon-only buttons without accessibility labels, onTapGesture used as a button, ignoresSafeArea on content, screen-bounds layout, alerts with too many buttons, crowded segmented pickers, light font weights. Each finding has line numbers, a snippet, severity, confidence and a live HIG citation. Lexical heuristics: they can misfire and miss things; confirm each one.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Swift source to review' },
        path: { type: 'string', description: 'Path to a .swift file (absolute, or relative to the server working directory)' },
        platform: { ...platformProp, description: 'Platform whose thresholds apply (default ios)' },
      },
      required: [],
    },
  },
  {
    name: 'check_contrast',
    description:
      "Deterministic WCAG 2.x contrast ratio between two colors (#RGB, #RRGGBB, #RRGGBBAA or rgb()/rgba(); a translucent foreground is composited over the background). Reports WCAG AA/AAA results and the HIG's own thresholds (4.5:1 for text up to 17 pt, 3:1 for 18 pt and larger or bold text), with live citations.",
    inputSchema: {
      type: 'object',
      properties: {
        foreground: { type: 'string', description: 'Text or icon color, e.g. "#8E8E93"' },
        background: { type: 'string', description: 'Background color, e.g. "#FFFFFF"' },
        fontSizePt: { type: 'number', description: 'Text size in points, to pick the applicable HIG threshold' },
        bold: { type: 'boolean', description: 'Whether the text is bold' },
      },
      required: ['foreground', 'background'],
    },
  },
  {
    name: 'search_hig',
    description:
      "Search Apple's Human Interface Guidelines by topic (matches page titles, names and summaries). Returns page ids to pass to get_guideline.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query, e.g. "buttons" or "dark mode"' },
        platform: { ...platformProp, description: 'Only return pages that apply to this platform' },
        category: {
          type: 'string',
          description: 'Top-level category: getting-started, foundations, patterns, components, inputs, technologies',
        },
        limit: { type: 'number', description: 'Maximum results (default 10, max 25)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_guideline',
    description:
      'Fetch a Human Interface Guidelines page as Markdown (headings, lists, tables, notes). Accepts a page id like "buttons" or "color", a path like "components/buttons", or a HIG URL.',
    inputSchema: {
      type: 'object',
      properties: {
        guidelineId: { type: 'string', description: 'Page id, path or URL, e.g. "buttons"' },
        includeExamples: {
          type: 'boolean',
          description: 'Include text descriptions of the page images and videos (default true)',
          default: true,
        },
      },
      required: ['guidelineId'],
    },
  },
  {
    name: 'browse_hig',
    description:
      'Browse the HIG table of contents. With no section, lists the top-level categories; with a section such as "components" or "menus-and-actions", lists the pages inside it.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'Section id or path like "components"; omit for the top level' },
        platform: { ...platformProp, description: 'Only list pages that apply to this platform' },
      },
      required: [],
    },
  },
  {
    name: 'server_info',
    description: 'Version, cache location, rule and heuristic counts, and the component names hig_checklist understands.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

const json = (value: unknown) => JSON.stringify(value, null, 2);

export class HIGReviewServer {
  private server: Server;
  private startTime = Date.now();
  private config = getServerConfig();
  private client: HIGClient;
  private service: HIGService;

  constructor() {
    this.server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });
    this.client = new HIGClient({
      userAgent: USER_AGENT,
      ttlMs: this.config.cacheTTL,
      cacheDir: this.config.cacheEnabled ? this.config.cacheDir : null,
    });
    this.service = new HIGService(this.client);
    this.setupHandlers();
  }

  private citer() {
    return new Citer((slug) => this.client.getDoc(slug));
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info(`Tool called: ${name}`);

      try {
        let text: string;
        switch (name) {
          case 'hig_checklist': {
            const p = HigChecklistSchema.parse(args ?? {});
            text = json(await buildChecklist(p.components, p.platform, this.citer()));
            break;
          }
          case 'review_swiftui': {
            const p = ReviewSwiftUISchema.parse(args ?? {});
            const input = await loadSwift(p);
            text = json(await reviewSwiftUI(input, p.platform, this.citer()));
            break;
          }
          case 'check_contrast': {
            const p = CheckContrastSchema.parse(args ?? {});
            text = json(await this.contrast(p));
            break;
          }
          case 'search_hig':
            text = await this.service.search(SearchHIGSchema.parse(args ?? {}));
            break;
          case 'get_guideline':
            text = await this.service.getGuideline(GetGuidelineSchema.parse(args ?? {}));
            break;
          case 'browse_hig':
            text = await this.service.browse(BrowseSectionSchema.parse(args ?? {}));
            break;
          case 'server_info':
            GetServerInfoSchema.parse(args ?? {});
            text = this.serverInfo();
            break;
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        if (error instanceof McpError) throw error;
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          );
        }
        // Runtime failures (page not found, network down, unreadable file) are tool errors the model can read.
        logger.error(`Error executing tool ${name}`, error);
        const message =
          error instanceof HIGServerError || error instanceof ColorParseError
            ? error.message
            : `Error: ${error instanceof Error ? error.message : String(error)}`;
        return { isError: true, content: [{ type: 'text' as const, text: message }] };
      }
    });
  }

  private async contrast(p: z.infer<typeof CheckContrastSchema>) {
    const result = checkContrast(p);
    const citer = this.citer();
    const ids =
      result.hig.category === null
        ? ['contrast.text', 'contrast.large-text', 'contrast.bold-text']
        : result.hig.category === 'regular'
          ? ['contrast.text']
          : result.hig.category === 'large'
            ? ['contrast.large-text']
            : ['contrast.bold-text'];
    ids.push('contrast.all-appearances');
    const citations = [];
    for (const id of ids) {
      const rule = ruleById(id)!;
      citations.push({ ruleId: id, citation: await citer.cite(rule.source.slug, rule.source.phrase) });
    }
    return {
      ...result,
      definitions:
        'WCAG "large text" is 18 pt, or 14 pt bold. The HIG table (used by Accessibility Inspector) applies 3:1 to text of 18 pt and larger, and to bold text of any size. The Dark Mode page asks for at least 4.5:1 in every appearance and suggests striving for 7:1 with custom colors, especially for small text. Check light and dark color pairs separately.',
      citations,
    };
  }

  private serverInfo(): string {
    const stats = this.service.clientStats();
    const size = this.service.catalogSize();
    return [
      'hig-review (unofficial; not affiliated with Apple)',
      `Name: ${SERVER_NAME}`,
      `Version: ${SERVER_VERSION}`,
      `Uptime: ${Math.floor((Date.now() - this.startTime) / 1000)}s`,
      `Source: https://developer.apple.com/design/human-interface-guidelines/ (fetched at runtime)`,
      `Disk cache: ${this.config.cacheEnabled ? this.config.cacheDir : 'disabled'} (TTL ${Math.round(this.config.cacheTTL / 3600000)}h)`,
      `Catalog: ${size === null ? 'not loaded yet (built on first search or browse)' : `${size} pages`}`,
      `Requests to Apple this session: ${stats.requestsMade}`,
      `Review rules: ${RULES.length} (citations verified live on each call)`,
      `SwiftUI heuristics: ${HEURISTICS.map((h) => h.id).join(', ')}`,
      `hig_checklist components: ${knownComponents()
        .map((c) => c.id)
        .join(', ')}`,
    ].join('\n');
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`hig-review MCP server running on stdio (v${SERVER_VERSION})`);
  }
}
