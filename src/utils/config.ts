/**
 * Configuration management for the MCP server
 */

import os from 'node:os';
import path from 'node:path';
import { ServerConfig } from '../types/index.js';

export const SERVER_VERSION = '0.3.0';
export const SERVER_NAME = 'hig-review';
export const USER_AGENT = `${SERVER_NAME}/${SERVER_VERSION} (unofficial HIG review tool; +https://github.com/nlaratta/hig-review)`;

export function getServerConfig(): ServerConfig {
  const cacheHome = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return {
    cacheEnabled: process.env.CACHE_ENABLED !== 'false',
    cacheTTL: parseInt(process.env.CACHE_TTL || String(24 * 60 * 60 * 1000), 10), // 24 hours
    cacheDir: process.env.HIG_CACHE_DIR || path.join(cacheHome, SERVER_NAME),
    debugMode: process.env.DEBUG === 'true',
  };
}
