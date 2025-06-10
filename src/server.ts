#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import {
  SearchHIGSchema,
  GetGuidelineSchema,
  BrowseSectionSchema,
  GetServerInfoSchema,
  GetSessionSchema,
  SearchHIGParams,
  GetGuidelineParams,
  BrowseSectionParams,
  GetServerInfoParams,
  GetSessionParams,
  ServerInfo,
  HIGServerError,
  CodeSnippet,
  Example,
} from './types/index.js';
import { logger } from './utils/logger.js';
import { getServerConfig, SERVER_NAME, SERVER_VERSION } from './utils/config.js';
import { GetGuideline } from './tools/getGuideline.js';
import { higSearchEngine } from './tools/searchHIG.js';
import { browseSection } from './tools/browseSection.js';
import { searchWWDCTool, SearchWWDCSchema } from './tools/searchWWDC.js';
import { initializeGetSession, getSession } from './tools/getSession.js';
import { CacheManager } from './cache/CacheManager.js';
import { WWDCCacheManager } from './cache/WWDCCacheManager.js';
import { browserManager } from './scraper/BrowserManager.js';
import { SearchWWDCParams } from './types/wwdc.js';

class AppleHIGServer {
  private server: Server;
  private startTime: number;
  private config = getServerConfig();
  private guidelineTool: GetGuideline;
  private cacheManager: CacheManager;
  private wwdcCacheManager: WWDCCacheManager;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.startTime = Date.now();
    
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize tools
    this.guidelineTool = new GetGuideline(this.config.cacheTTL);
    this.cacheManager = new CacheManager({
      baseDir: './cache',
      maxSize: 100 * 1024 * 1024, // 100MB
      maxEntries: 500,
      cleanupInterval: 60 * 60 * 1000 // 1 hour
    });
    this.wwdcCacheManager = new WWDCCacheManager({
      baseDir: './cache/wwdc',
      sessionTTL: 604800, // 1 week
      transcriptTTL: 2592000, // 30 days
      codeTTL: 1209600 // 2 weeks
    });
    initializeGetSession(this.wwdcCacheManager);

    this.setupHandlers();
    logger.info('Apple HIG MCP Server initialized', { config: this.config });
  }

  private setupHandlers() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Listing available tools');
      
      return {
        tools: [
          {
            name: 'searchHIG',
            description: 'Search Apple Human Interface Guidelines for design patterns, components, and best practices',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for Apple HIG',
                },
                platform: {
                  type: 'string',
                  enum: ['ios', 'macos', 'watchos', 'tvos', 'visionos'],
                  description: 'Filter by specific Apple platform',
                },
                category: {
                  type: 'string',
                  description: 'Category like foundations, components, patterns',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'getGuideline',
            description: 'Get specific Apple HIG guideline content with examples and specifications',
            inputSchema: {
              type: 'object',
              properties: {
                guidelineId: {
                  type: 'string',
                  description: 'Specific guideline ID or URL path',
                },
                includeExamples: {
                  type: 'boolean',
                  description: 'Include code examples',
                  default: true,
                },
                includeCode: {
                  type: 'boolean',
                  description: 'Include SwiftUI/UIKit code samples',
                  default: true,
                },
                includeWWDC: {
                  type: 'boolean',
                  description: 'Include related WWDC sessions',
                  default: true,
                },
              },
              required: ['guidelineId'],
            },
          },
          {
            name: 'browseSection',
            description: 'Browse a specific section of Apple HIG documentation',
            inputSchema: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  description: 'Section path like components/buttons',
                },
                platform: {
                  type: 'string',
                  enum: ['ios', 'macos', 'watchos', 'tvos', 'visionos'],
                  description: 'Apple platform',
                },
              },
              required: ['section', 'platform'],
            },
          },
          {
            name: 'getServerInfo',
            description: 'Get information about the HIG MCP server status and capabilities',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'getSession',
            description: 'Get WWDC session details with transcript, code examples, and related HIG guidelines',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: {
                  type: 'string',
                  description: 'WWDC session ID',
                },
                includeTranscript: {
                  type: 'boolean',
                  description: 'Include full transcript',
                  default: false,
                },
                includeCode: {
                  type: 'boolean',
                  description: 'Include code examples',
                  default: false,
                },
                timestamp: {
                  type: 'number',
                  description: 'Jump to specific timestamp in seconds',
                },
                includeRelatedGuidelines: {
                  type: 'boolean',
                  description: 'Include related HIG guidelines',
                  default: false,
                },
              },
              required: ['sessionId'],
            },
          },
          {
            name: 'searchWWDC',
            description: 'Search WWDC sessions for content related to Apple HIG guidelines',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query string',
                },
                year: {
                  type: 'number',
                  description: 'Filter by specific year (e.g., 2023)',
                },
                platform: {
                  type: 'string',
                  enum: ['ios', 'macos', 'watchos', 'tvos', 'visionos'],
                  description: 'Filter by Apple platform',
                },
                searchIn: {
                  type: 'string',
                  enum: ['all', 'titles', 'transcripts', 'code'],
                  description: 'Where to search: all, titles only, transcripts only, or code examples',
                  default: 'all',
                },
                includeCode: {
                  type: 'boolean',
                  description: 'Include code examples in results',
                  default: false,
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  default: 20,
                },
              },
              required: ['query'],
            },
          },
        ],
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      logger.info(`Tool called: ${name}`, { args });
      
      try {
        switch (name) {
          case 'searchHIG': {
            const validated = SearchHIGSchema.parse(args);
            return await this.searchHIG(validated);
          }
          case 'getGuideline': {
            const validated = GetGuidelineSchema.parse(args);
            return await this.getGuideline(validated);
          }
          case 'browseSection': {
            const validated = BrowseSectionSchema.parse(args);
            return await this.browseSection(validated);
          }
          case 'getServerInfo': {
            const validated = GetServerInfoSchema.parse(args);
            return await this.getServerInfo(validated);
          }
          case 'getSession': {
            const validated = GetSessionSchema.parse(args);
            return await this.getSession(validated);
          }
          case 'searchWWDC': {
            const validated = SearchWWDCSchema.parse(args);
            return await this.searchWWDC(validated);
          }
          default:
            logger.error(`Unknown tool requested: ${name}`);
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        logger.error(`Error executing tool ${name}`, error);
        
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          );
        }
        
        if (error instanceof McpError) {
          throw error;
        }
        
        if (error instanceof HIGServerError) {
          throw new McpError(
            ErrorCode.InternalError,
            error.message,
            error.details
          );
        }
        
        // Unknown error
        throw new McpError(
          ErrorCode.InternalError,
          `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  private async searchHIG(params: SearchHIGParams) {
    try {
      logger.debug('Searching HIG', params);
      
      // Ensure initialization is complete
      await this.ensureInitialized();
      
      // Perform the search
      const results = await higSearchEngine.search(params);
      
      // Format the results
      const formattedResults = higSearchEngine.formatResults(results);
      
      return {
        content: [
          {
            type: 'text' as const,
            text: formattedResults,
          },
        ],
      };
    } catch (error) {
      logger.error('Error in searchHIG', error);
      throw new HIGServerError('SEARCH_ERROR', 'Failed to search HIG content', error);
    }
  }

  private async getGuideline(params: GetGuidelineParams) {
    try {
      logger.debug('Getting guideline', params);
      
      // Validate guideline ID format
      if (!params.guidelineId || params.guidelineId.trim() === '') {
        throw new HIGServerError('INVALID_GUIDELINE_ID', 'Guideline ID cannot be empty');
      }
      
      // Use the GetGuideline tool to fetch and parse the guideline
      const guideline = await this.guidelineTool.execute(params);
      
      // Format the response
      let responseText = guideline.content;
      
      // Add code examples if available
      if (guideline.codeSnippets && guideline.codeSnippets.length > 0) {
        responseText += '\n\n## Code Examples\n';
        guideline.codeSnippets.forEach((snippet: CodeSnippet, index: number) => {
          responseText += `\n### Example ${index + 1}`;
          if (snippet.description) {
            responseText += `: ${snippet.description}`;
          }
          responseText += `\n\`\`\`${snippet.language}\n${snippet.code}\n\`\`\`\n`;
        });
      }
      
      // Add examples if available
      if (guideline.examples && guideline.examples.length > 0) {
        responseText += '\n\n## Examples\n';
        guideline.examples.forEach((example: Example) => {
          responseText += `\n### ${example.title}\n`;
          if (example.description) {
            responseText += `${example.description}\n`;
          }
          if (example.code) {
            responseText += `\n\`\`\`\n${example.code}\n\`\`\`\n`;
          }
        });
      }
      
      return {
        content: [
          {
            type: 'text' as const,
            text: responseText,
          },
        ],
      };
    } catch (error) {
      logger.error('Error in getGuideline', error);
      
      if (error instanceof HIGServerError) {
        throw error;
      }
      
      throw new HIGServerError('GUIDELINE_FETCH_ERROR', 'Failed to fetch guideline', error);
    }
  }

  private async browseSection(params: BrowseSectionParams) {
    try {
      logger.debug('Browsing section', params);
      
      // Ensure initialization is complete
      await this.ensureInitialized();
      
      // Browse the section
      const sectionContent = await browseSection.execute(params);
      
      return {
        content: [
          {
            type: 'text' as const,
            text: sectionContent,
          },
        ],
      };
    } catch (error) {
      logger.error('Error in browseSection', error);
      
      if (error instanceof HIGServerError) {
        throw error;
      }
      
      throw new HIGServerError('SECTION_BROWSE_ERROR', 'Failed to browse section', error);
    }
  }

  private async getServerInfo(_: GetServerInfoParams) {
    try {
      logger.debug('Getting server info');
      
      const uptime = Date.now() - this.startTime;
      
      const serverInfo: ServerInfo = {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        status: 'running',
        uptime: uptime,
        capabilities: {
          search: true,
          cache: this.config.cacheEnabled,
          scraping: this.config.scrapingEnabled,
        },
        stats: {
          totalGuidelines: higSearchEngine.getStats().totalDocuments,
          lastUpdate: null, // TODO: Track last scraping update
          cacheSize: (await this.cacheManager.getStats()).totalEntries,
        },
      };
      
      return {
        content: [
          {
            type: 'text' as const,
            text: `Apple HIG MCP Server Status\n` +
            `==========================\n\n` +
            `Name: ${serverInfo.name}\n` +
            `Version: ${serverInfo.version}\n` +
            `Status: ${serverInfo.status}\n` +
            `Uptime: ${Math.floor(uptime / 1000)}s\n\n` +
            `Capabilities:\n` +
            `- Search: ${serverInfo.capabilities.search ? 'Enabled' : 'Disabled'}\n` +
            `- Cache: ${serverInfo.capabilities.cache ? 'Enabled' : 'Disabled'}\n` +
            `- Scraping: ${serverInfo.capabilities.scraping ? 'Enabled' : 'Disabled'}\n\n` +
            `Configuration:\n` +
            `- Debug Mode: ${this.config.debugMode ? 'Enabled' : 'Disabled'}\n` +
            `- Cache TTL: ${this.config.cacheTTL}ms\n` +
            `- Max Concurrent Requests: ${this.config.maxConcurrentRequests}\n\n` +
            `Statistics:\n` +
            `- Total Guidelines: ${serverInfo.stats.totalGuidelines}\n` +
            `- Last Update: ${serverInfo.stats.lastUpdate || 'Never'}\n` +
            `- Cache Size: ${serverInfo.stats.cacheSize} items`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error in getServerInfo', error);
      throw new HIGServerError('SERVER_INFO_ERROR', 'Failed to get server info', error);
    }
  }

  private async searchWWDC(params: SearchWWDCParams) {
    try {
      logger.debug('Searching WWDC sessions', params);
      
      // Execute the search
      const results = await searchWWDCTool.execute(params);
      
      return {
        content: [
          {
            type: 'text' as const,
            text: results,
          },
        ],
      };
    } catch (error) {
      logger.error('Error in searchWWDC', error);
      
      if (error instanceof HIGServerError) {
        throw error;
      }
      
      throw new HIGServerError('WWDC_SEARCH_ERROR', 'Failed to search WWDC content', error);
    }
  }

  private async getSession(params: GetSessionParams) {
    try {
      logger.debug('Getting WWDC session', params);
      
      // Ensure initialization is complete
      if (this.initializationPromise) {
        await this.initializationPromise;
      }
      
      // Execute the getSession tool
      const result = await getSession().execute(params);
      
      return result;
    } catch (error) {
      logger.error('Error in getSession', error);
      
      if (error instanceof HIGServerError) {
        throw error;
      }
      
      throw new HIGServerError('SESSION_FETCH_ERROR', 'Failed to fetch WWDC session', error);
    }
  }

  /**
   * Initialize server components
   */
  private async initialize(): Promise<void> {
    logger.info('Initializing server components...');
    
    try {
      // Initialize browser manager
      logger.info('Initializing browser manager...');
      await browserManager.initialize();
      
      // Initialize search engine
      logger.info('Initializing search engine...');
      await higSearchEngine.initialize();
      
      // Initialize WWDC linker for GetGuideline tool
      logger.info('Initializing WWDC linker for guidelines...');
      this.guidelineTool.initializeWWDCLinker(higSearchEngine);
      
      // Warm cache with popular sections
      logger.info('Warming cache...');
      const popularUrls = [
        'https://developer.apple.com/design/human-interface-guidelines/',
        'https://developer.apple.com/design/human-interface-guidelines/components',
        'https://developer.apple.com/design/human-interface-guidelines/foundations',
        'https://developer.apple.com/design/human-interface-guidelines/platforms/designing-for-ios'
      ];
      await this.cacheManager.warmCache(popularUrls);
      
      logger.info('Server initialization complete');
    } catch (error) {
      logger.error('Failed to initialize server components', error);
      throw error;
    }
  }

  /**
   * Ensure server is initialized before handling requests
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }
    await this.initializationPromise;
  }

  async run() {
    try {
      logger.info('Starting Apple HIG MCP server...');
      
      // Initialize server components
      await this.initialize();
      
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('Apple HIG MCP server running on stdio');
      logger.info(`Server ready - version ${SERVER_VERSION}`);
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await this.shutdown();
        process.exit(0);
      });
      
      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await this.shutdown();
        process.exit(0);
      });
      
    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    logger.info('Shutting down server...');
    
    try {
      // Close browser
      await browserManager.close();
      
      // Close cache managers
      await this.cacheManager.close();
      await this.wwdcCacheManager.close();
      
      logger.info('Server shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', error);
    }
  }
}

// Start the server
const server = new AppleHIGServer();
server.run().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});