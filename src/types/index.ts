/**
 * Shared types and tool parameter schemas for the Apple HIG MCP server.
 */

import { z } from 'zod';

export const PLATFORMS = ['ios', 'ipados', 'macos', 'watchos', 'tvos', 'visionos'] as const;
export type ApplePlatform = (typeof PLATFORMS)[number];

export const SearchHIGSchema = z.object({
  query: z.string().min(1).describe('Search query for Apple HIG'),
  platform: z.enum(PLATFORMS).optional(),
  category: z
    .string()
    .optional()
    .describe('Top-level category such as foundations, components, patterns, inputs, technologies'),
  limit: z.number().int().min(1).max(25).optional().default(10),
});

export const GetGuidelineSchema = z.object({
  guidelineId: z.string().min(1).describe('Page name or HIG URL, e.g. "buttons" or "components/buttons"'),
  includeExamples: z.boolean().optional().default(true),
  includeCode: z.boolean().optional().default(true),
});

export const BrowseSectionSchema = z.object({
  section: z
    .string()
    .optional()
    .default('')
    .describe('Section name or path like "components" or "components/menus-and-actions"; empty for the top level'),
  platform: z.enum(PLATFORMS).optional(),
});

export const GetServerInfoSchema = z.object({});

export type SearchHIGParams = z.infer<typeof SearchHIGSchema>;
export type GetGuidelineParams = z.infer<typeof GetGuidelineSchema>;
export type BrowseSectionParams = z.infer<typeof BrowseSectionSchema>;
export type GetServerInfoParams = z.infer<typeof GetServerInfoSchema>;

export class HIGServerError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'HIGServerError';
  }
}

export interface ServerConfig {
  cacheEnabled: boolean;
  cacheTTL: number;
  cacheDir: string;
  debugMode: boolean;
}

export interface Logger {
  info(message: string, data?: any): void;
  error(message: string, error?: any): void;
  debug(message: string, data?: any): void;
  warn(message: string, data?: any): void;
}
