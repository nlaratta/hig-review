import { z } from 'zod';
import { SearchWWDCParams, WWDCSearchResult, TranscriptSearchResult } from '../types/wwdc.js';
import { logger } from '../utils/logger.js';
import { SessionIndexer } from '../wwdc/SessionIndexer.js';
import NodeCache from 'node-cache';

/**
 * Schema for searchWWDC tool parameters
 */
export const SearchWWDCSchema = z.object({
  query: z.string().describe('Search query string'),
  year: z.number().optional().describe('Filter by specific year (e.g., 2023)'),
  platform: z.enum(['ios', 'macos', 'watchos', 'tvos', 'visionos']).optional()
    .describe('Filter by Apple platform'),
  searchIn: z.enum(['all', 'titles', 'transcripts', 'code']).optional().default('all')
    .describe('Where to search: all, titles only, transcripts only, or code examples'),
  includeCode: z.boolean().optional().default(false)
    .describe('Include code examples in results'),
  limit: z.number().optional().default(20)
    .describe('Maximum number of results to return')
});

/**
 * SearchWWDC - Tool for searching WWDC session content
 */
export class SearchWWDC {
  private indexer: SessionIndexer;
  private cache: any;
  private isIndexBuilt: boolean = false;

  constructor(cacheTTL: number = 3600) {
    this.indexer = new SessionIndexer();
    const NodeCacheConstructor = (NodeCache as any).default || NodeCache;
    this.cache = new NodeCacheConstructor({ 
      stdTTL: cacheTTL,
      checkperiod: 600,
      useClones: false
    });
    
    logger.info('SearchWWDC tool initialized');
  }

  /**
   * Execute the searchWWDC tool
   */
  public async execute(params: SearchWWDCParams): Promise<string> {
    const { 
      query, 
      year, 
      platform, 
      searchIn = 'all', 
      includeCode = false, 
      limit = 20 
    } = params;
    
    logger.info('Searching WWDC sessions', { query, year, platform, searchIn, includeCode, limit });

    // Check if index is built
    if (!this.isIndexBuilt) {
      logger.warn('WWDC index not built yet');
      return this.formatNoIndexResponse();
    }

    // Check cache first
    const cacheKey = this.getCacheKey(params);
    const cached = this.cache.get(cacheKey) as string | undefined;
    if (cached) {
      logger.debug('Returning cached WWDC search results', { query });
      return cached;
    }

    try {
      let results: string;

      // Create filters based on parameters
      const filters = {
        year,
        platform,
        hasCode: includeCode ? true : undefined
      };

      switch (searchIn) {
        case 'titles': {
          // Search only in session metadata (titles, descriptions)
          const sessionResults = this.indexer.searchSessions({
            query,
            filters,
            limit
          });
          results = this.formatSessionResults(sessionResults, includeCode);
          break;
        }
        
        case 'transcripts': {
          // Search only in transcripts
          const transcriptResults = this.indexer.searchTranscripts({
            query,
            limit,
            includeContext: true
          });
          results = this.formatTranscriptResults(transcriptResults, limit);
          break;
        }
        
        case 'code': {
          // Search with code filter enabled
          const sessionResults = this.indexer.searchSessions({
            query,
            filters: { ...filters, hasCode: true },
            limit
          });
          results = this.formatSessionResults(sessionResults, true);
          break;
        }
        
        case 'all':
        default: {
          // Search both sessions and transcripts
          const { sessions, transcripts } = this.indexer.searchAll(query, filters);
          results = this.formatCombinedResults(sessions, transcripts, includeCode, limit);
          break;
        }
      }

      // Cache the results
      this.cache.set(cacheKey, results);

      return results;
    } catch (error) {
      logger.error('Failed to search WWDC content', { query, error });
      throw new Error(`Failed to search WWDC content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format response when index is not built
   */
  private formatNoIndexResponse(): string {
    return `# WWDC Search Not Available

The WWDC session index has not been built yet. 

To enable WWDC search functionality:
1. Run the indexing process to scrape and index WWDC sessions
2. Ensure transcripts are downloaded and processed
3. Wait for the indexing to complete

Once indexed, you'll be able to search:
- Session titles and descriptions
- Full transcript content
- Code examples from sessions
- Filter by year, platform, and more

Please contact the administrator to build the WWDC index.`;
  }

  /**
   * Format session search results
   */
  private formatSessionResults(results: WWDCSearchResult[], includeCode: boolean): string {
    if (results.length === 0) {
      return 'No WWDC sessions found matching your search query.';
    }

    let output = `# WWDC Session Search Results\n\n`;
    output += `Found ${results.length} matching sessions:\n\n`;

    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      const { session, score, highlights } = result;
      const relevance = Math.round((1 - score) * 100);

      output += `## ${index + 1}. ${session.title}\n\n`;
      output += `- **Year**: WWDC ${session.year}\n`;
      output += `- **Platforms**: ${session.platforms.join(', ')}\n`;
      output += `- **Duration**: ${this.formatDuration(session.duration)}\n`;
      output += `- **Speakers**: ${session.speakers.join(', ')}\n`;
      output += `- **Relevance**: ${relevance}%\n`;
      output += `- **Video**: [Watch Session](${session.videoUrl})\n`;

      if (session.transcriptUrl) {
        output += `- **Transcript**: [View Transcript](${session.transcriptUrl})\n`;
      }

      if (session.sampleCodeUrl && includeCode) {
        output += `- **Sample Code**: [Download Code](${session.sampleCodeUrl})\n`;
      }

      if (session.resourcesUrl) {
        output += `- **Resources**: [Additional Resources](${session.resourcesUrl})\n`;
      }

      output += `\n### Description\n${session.description}\n`;

      if (highlights.length > 0) {
        output += `\n### Relevant Excerpts\n`;
        for (const highlight of highlights) {
          output += `- ${highlight}\n`;
        }
      }

      if (session.topics && session.topics.length > 0) {
        output += `\n### Topics Covered\n`;
        for (const topic of session.topics) {
          output += `- ${topic}\n`;
        }
      }

      output += '\n---\n\n';
    }

    return output.trim();
  }

  /**
   * Format transcript search results
   */
  private formatTranscriptResults(results: TranscriptSearchResult[], limit: number): string {
    if (results.length === 0) {
      return 'No transcript matches found for your search query.';
    }

    let output = `# WWDC Transcript Search Results\n\n`;
    let totalMatches = 0;
    let formattedCount = 0;

    for (const result of results) {
      if (formattedCount >= limit) break;

      const session = this.indexer.getSession(result.sessionId);
      if (!session) continue;

      output += `## ${session.title} (WWDC ${session.year})\n\n`;
      output += `[Watch Session](${session.videoUrl})\n\n`;

      output += `### Matching Segments:\n\n`;

      for (const match of result.matches.slice(0, 5)) { // Show top 5 matches per session
        const { segment, score, highlightedText } = match;
        const relevance = Math.round((1 - score) * 100);

        output += `**[${this.formatTimestamp(segment.startTime)} - ${this.formatTimestamp(segment.endTime)}]** (${relevance}% match)\n`;
        
        if (segment.speaker) {
          output += `*Speaker: ${segment.speaker}*\n`;
        }

        output += `${highlightedText || segment.text}\n\n`;
        totalMatches++;
      }

      output += '---\n\n';
      formattedCount++;
    }

    output += `\n*Showing ${formattedCount} sessions with ${totalMatches} matching segments*`;

    return output.trim();
  }

  /**
   * Format combined session and transcript results
   */
  private formatCombinedResults(
    sessions: WWDCSearchResult[], 
    transcripts: TranscriptSearchResult[],
    includeCode: boolean,
    limit: number
  ): string {
    let output = `# WWDC Search Results\n\n`;

    // Format session results first
    if (sessions.length > 0) {
      output += `## Matching Sessions (${sessions.length} found)\n\n`;
      
      const sessionsToShow = sessions.slice(0, Math.ceil(limit / 2));
      for (let index = 0; index < sessionsToShow.length; index++) {
        const result = sessionsToShow[index];
        const { session, score } = result;
        const relevance = Math.round((1 - score) * 100);

        output += `### ${index + 1}. ${session.title} (WWDC ${session.year})\n`;
        output += `- **Relevance**: ${relevance}%\n`;
        output += `- **Platforms**: ${session.platforms.join(', ')}\n`;
        output += `- **Duration**: ${this.formatDuration(session.duration)}\n`;
        output += `- [Watch Video](${session.videoUrl})`;
        
        if (session.transcriptUrl) {
          output += ` | [Transcript](${session.transcriptUrl})`;
        }
        
        if (session.sampleCodeUrl && includeCode) {
          output += ` | [Code](${session.sampleCodeUrl})`;
        }
        
        output += `\n\n${session.description}\n\n`;
      }
    }

    // Format transcript results
    if (transcripts.length > 0) {
      output += `## Matching Transcript Segments\n\n`;
      
      let segmentCount = 0;
      for (const result of transcripts) {
        if (segmentCount >= Math.floor(limit / 2)) break;
        
        const session = this.indexer.getSession(result.sessionId);
        if (!session) continue;

        output += `### From: ${session.title} (WWDC ${session.year})\n\n`;

        for (const match of result.matches.slice(0, 3)) { // Top 3 matches per session
          const { segment, highlightedText } = match;
          
          output += `**[${this.formatTimestamp(segment.startTime)}]** `;
          if (segment.speaker) {
            output += `*${segment.speaker}:* `;
          }
          output += `${highlightedText || segment.text}\n\n`;
          segmentCount++;
        }
      }
    }

    if (sessions.length === 0 && transcripts.length === 0) {
      output = 'No WWDC content found matching your search query.';
    }

    return output.trim();
  }

  /**
   * Format duration in seconds to human-readable format
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Format timestamp in seconds to MM:SS or HH:MM:SS
   */
  private formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Generate cache key from search parameters
   */
  private getCacheKey(params: SearchWWDCParams): string {
    const { query, year, platform, searchIn, includeCode, limit } = params;
    return `wwdc:${query}:${year || 'all'}:${platform || 'all'}:${searchIn || 'all'}:${includeCode}:${limit}`;
  }

  /**
   * Set the index built status (used by external indexing process)
   */
  public setIndexBuilt(built: boolean): void {
    this.isIndexBuilt = built;
    if (built) {
      logger.info('WWDC search index is ready');
    }
  }

  /**
   * Get the session indexer instance (for external indexing)
   */
  public getIndexer(): SessionIndexer {
    return this.indexer;
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.cache.flushAll();
    logger.info('WWDC search cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { hits: number; misses: number; keys: number } {
    const keys = this.cache.keys();
    const stats = this.cache.getStats();
    return {
      hits: stats.hits,
      misses: stats.misses,
      keys: keys.length
    };
  }

  /**
   * Get index statistics
   */
  public getIndexStats() {
    return this.indexer.getStats();
  }
}

// Export singleton instance
export const searchWWDCTool = new SearchWWDC();