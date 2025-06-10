/**
 * Configuration management for the MCP server
 */

import { ServerConfig } from '../types/index.js';

export function getServerConfig(): ServerConfig {
  return {
    cacheEnabled: process.env.CACHE_ENABLED !== 'false',
    cacheTTL: parseInt(process.env.CACHE_TTL || '3600000', 10), // 1 hour default
    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '10', 10),
    scrapingEnabled: process.env.SCRAPING_ENABLED !== 'false',
    debugMode: process.env.DEBUG === 'true',
  };
}

export const SERVER_VERSION = '1.0.0';
export const SERVER_NAME = 'apple-hig-mcp';