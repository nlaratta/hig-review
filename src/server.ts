import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import {
  SearchHIGSchema,
  GetGuidelineSchema,
  BrowseSectionSchema,
  GetServerInfoSchema,
  HIGServerError,
  PLATFORMS,
} from './types/index.js';
import { logger } from './utils/logger.js';
import { getServerConfig, SERVER_NAME, SERVER_VERSION, USER_AGENT } from './utils/config.js';
import { HIGClient } from './hig/client.js';
import { HIGService } from './hig/service.js';

const TOOLS = [
  {
    name: 'searchHIG',
    description:
      "Search Apple's Human Interface Guidelines by topic (matches page titles, names and summaries). Returns page ids to pass to getGuideline.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query, e.g. "buttons" or "dark mode"' },
        platform: {
          type: 'string',
          enum: [...PLATFORMS],
          description: 'Only return pages that apply to this platform',
        },
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
    name: 'getGuideline',
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
        includeCode: {
          type: 'boolean',
          description: 'Accepted for compatibility; the HIG contains no code samples, so this has no effect',
          default: true,
        },
      },
      required: ['guidelineId'],
    },
  },
  {
    name: 'browseSection',
    description:
      'Browse the HIG table of contents. With no section, lists the top-level categories; with a section such as "components" or "menus-and-actions", lists the pages inside it.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'Section id or path like "components"; omit for the top level' },
        platform: { type: 'string', enum: [...PLATFORMS], description: 'Only list pages that apply to this platform' },
      },
      required: [],
    },
  },
  {
    name: 'getServerInfo',
    description: 'Get server version, configuration and cache status',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

export class AppleHIGServer {
  private server: Server;
  private startTime = Date.now();
  private config = getServerConfig();
  private service: HIGService;

  constructor() {
    this.server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });
    this.service = new HIGService(
      new HIGClient({
        userAgent: USER_AGENT,
        ttlMs: this.config.cacheTTL,
        cacheDir: this.config.cacheEnabled ? this.config.cacheDir : null,
      })
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info(`Tool called: ${name}`, { args });

      try {
        let text: string;
        switch (name) {
          case 'searchHIG':
            text = await this.service.search(SearchHIGSchema.parse(args ?? {}));
            break;
          case 'getGuideline':
            text = await this.service.getGuideline(GetGuidelineSchema.parse(args ?? {}));
            break;
          case 'browseSection':
            text = await this.service.browse(BrowseSectionSchema.parse(args ?? {}));
            break;
          case 'getServerInfo':
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
        // Runtime failures (page not found, network down) are reported as tool errors the model can read.
        logger.error(`Error executing tool ${name}`, error);
        const message = error instanceof HIGServerError ? error.message : `Error: ${error instanceof Error ? error.message : String(error)}`;
        return { isError: true, content: [{ type: 'text' as const, text: message }] };
      }
    });
  }

  private serverInfo(): string {
    const stats = this.service.clientStats();
    const size = this.service.catalogSize();
    return [
      'Apple HIG MCP Server (unofficial)',
      `Name: ${SERVER_NAME}`,
      `Version: ${SERVER_VERSION}`,
      `Uptime: ${Math.floor((Date.now() - this.startTime) / 1000)}s`,
      `Source: https://developer.apple.com/design/human-interface-guidelines/ (fetched at runtime)`,
      `Disk cache: ${this.config.cacheEnabled ? this.config.cacheDir : 'disabled'} (TTL ${Math.round(this.config.cacheTTL / 3600000)}h)`,
      `Catalog: ${size === null ? 'not loaded yet (built on first search or browse)' : `${size} pages`}`,
      `Requests to Apple this session: ${stats.requestsMade}`,
    ].join('\n');
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`Apple HIG MCP server running on stdio (v${SERVER_VERSION})`);
  }
}
