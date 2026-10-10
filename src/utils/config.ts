/**
 * Configuration management for the MCP server
 */

import os from 'node:os';
import path from 'node:path';
import { ServerConfig } from '../types/index.js';

export const SERVER_VERSION = '0.2.0';
export const SERVER_NAME = 'apple-hig-mcp';
export const USER_AGENT = `${SERVER_NAME}/${SERVER_VERSION} (unofficial MCP server; +https://github.com/nlaratta/apple-hig-mcp)`;

export function getServerConfig(): ServerConfig {
  const cacheHome = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return {
    cacheEnabled: process.env.CACHE_ENABLED !== 'false',
    cacheTTL: parseInt(process.env.CACHE_TTL || String(24 * 60 * 60 * 1000), 10), // 24 hours
    cacheDir: process.env.HIG_CACHE_DIR || path.join(cacheHome, SERVER_NAME),
    debugMode: process.env.DEBUG === 'true',
  };
}
