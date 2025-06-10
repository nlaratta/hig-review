/**
 * Type definitions for Apple HIG MCP Server
 */

import { z } from 'zod';

// Platform types
export type ApplePlatform = 'ios' | 'macos' | 'watchos' | 'tvos' | 'visionos';

// Tool parameter schemas
export const SearchHIGSchema = z.object({
  query: z.string().describe('Search query for Apple HIG'),
  platform: z.enum(['ios', 'macos', 'watchos', 'tvos', 'visionos']).optional(),
  category: z.string().optional().describe('Category like foundations, components, patterns'),
});

export const GetGuidelineSchema = z.object({
  guidelineId: z.string().describe('Specific guideline ID or URL path'),
  includeExamples: z.boolean().optional().default(true),
  includeCode: z.boolean().optional().default(true),
});

export const BrowseSectionSchema = z.object({
  section: z.string().describe('Section path like components/buttons'),
  platform: z.enum(['ios', 'macos', 'watchos', 'tvos', 'visionos']),
});

export const GetServerInfoSchema = z.object({});

// Type inference from schemas
export type SearchHIGParams = z.infer<typeof SearchHIGSchema>;
export type GetGuidelineParams = z.infer<typeof GetGuidelineSchema>;
export type BrowseSectionParams = z.infer<typeof BrowseSectionSchema>;
export type GetServerInfoParams = z.infer<typeof GetServerInfoSchema>;

// Response types
export interface HIGSearchResult {
  id: string;
  title: string;
  description: string;
  platform: ApplePlatform;
  category: string;
  url: string;
  relevanceScore: number;
}

export interface HIGGuideline {
  id: string;
  title: string;
  content: string;
  platform: ApplePlatform;
  category: string;
  lastUpdated: string;
  examples?: Example[];
  codeSnippets?: CodeSnippet[];
  relatedGuidelines?: string[];
}

export interface HIGSection {
  path: string;
  title: string;
  description: string;
  subsections?: HIGSection[];
  guidelines?: GuidelineSummary[];
}

export interface Example {
  title: string;
  description: string;
  imageUrl?: string;
  code?: string;
}

export interface CodeSnippet {
  language: 'swift' | 'objc' | 'swiftui';
  code: string;
  description?: string;
}

export interface GuidelineSummary {
  id: string;
  title: string;
  description: string;
}

export interface ServerInfo {
  name: string;
  version: string;
  status: 'running' | 'error' | 'initializing';
  uptime: number;
  capabilities: {
    search: boolean;
    cache: boolean;
    scraping: boolean;
  };
  stats: {
    totalGuidelines: number;
    lastUpdate: string | null;
    cacheSize: number;
  };
}

// Error types
export class HIGServerError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'HIGServerError';
  }
}

// Configuration types
export interface ServerConfig {
  cacheEnabled: boolean;
  cacheTTL: number;
  maxConcurrentRequests: number;
  scrapingEnabled: boolean;
  debugMode: boolean;
}

// Cache types
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Logger interface
export interface Logger {
  info(message: string, data?: any): void;
  error(message: string, error?: any): void;
  debug(message: string, data?: any): void;
  warn(message: string, data?: any): void;
}