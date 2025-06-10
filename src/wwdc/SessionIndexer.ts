/**
 * SessionIndexer - Manages Fuse.js indexes for searching WWDC sessions and transcripts
 */

import Fuse, { IFuseOptions, FuseResult } from 'fuse.js';
import { 
  WWDCSession, 
  WWDCTranscript, 
  TranscriptSegment,
  WWDCSearchResult,
  TranscriptSearchResult,
  WWDCSearchFilters
} from '../types/wwdc.js';
import { logger } from '../utils/logger.js';

/**
 * Options for session search
 */
interface SessionSearchOptions {
  query: string;
  filters?: WWDCSearchFilters;
  limit?: number;
  offset?: number;
}

/**
 * Options for transcript search
 */
interface TranscriptSearchOptions {
  query: string;
  sessionIds?: string[];
  limit?: number;
  includeContext?: boolean;
}

/**
 * SessionIndexer handles indexing and searching of WWDC sessions and transcripts
 */
export class SessionIndexer {
  private sessionIndex: Fuse<WWDCSession>;
  private transcriptIndex: Map<string, Fuse<TranscriptSegment>>;
  private sessions: Map<string, WWDCSession>;
  
  // Fuse.js options for session metadata search
  private readonly sessionFuseOptions: IFuseOptions<WWDCSession> = {
    keys: [
      { name: 'title', weight: 0.4 },
      { name: 'description', weight: 0.3 },
      { name: 'topics', weight: 0.2 },
      { name: 'speakers', weight: 0.1 },
      { name: 'tags', weight: 0.1 }
    ],
    threshold: 0.4,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 2
  };
  
  // Fuse.js options for transcript segment search
  private readonly transcriptFuseOptions: IFuseOptions<TranscriptSegment> = {
    keys: ['text'],
    threshold: 0.3,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 3,
    findAllMatches: true
  };
  
  constructor() {
    this.sessionIndex = new Fuse([], this.sessionFuseOptions);
    this.transcriptIndex = new Map();
    this.sessions = new Map();
    
    logger.info('SessionIndexer initialized');
  }
  
  /**
   * Add or update a session in the index
   */
  async indexSession(session: WWDCSession): Promise<void> {
    try {
      // Store session data
      this.sessions.set(session.id, session);
      
      // Update Fuse index
      const existingIndex = this.sessionIndex.getIndex();
      const existingDocs = (existingIndex as any).docs as WWDCSession[];
      const filteredDocs = existingDocs.filter(s => s.id !== session.id);
      
      // Create new index with updated sessions
      this.sessionIndex = new Fuse([...filteredDocs, session], this.sessionFuseOptions);
      
      logger.info(`Indexed session: ${session.id} - ${session.title}`);
    } catch (error) {
      logger.error(`Failed to index session ${session.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Add or update a transcript in the index
   */
  async indexTranscript(sessionId: string, transcript: WWDCTranscript): Promise<void> {
    try {
      // Create Fuse index for this transcript's segments
      const segmentIndex = new Fuse(transcript.segments, this.transcriptFuseOptions);
      this.transcriptIndex.set(sessionId, segmentIndex);
      
      logger.info(`Indexed transcript for session: ${sessionId} (${transcript.segments.length} segments)`);
    } catch (error) {
      logger.error(`Failed to index transcript for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Bulk index multiple sessions
   */
  async bulkIndexSessions(sessions: WWDCSession[]): Promise<void> {
    try {
      // Store all sessions
      sessions.forEach(session => {
        this.sessions.set(session.id, session);
      });
      
      // Create new index with all sessions
      this.sessionIndex = new Fuse(sessions, this.sessionFuseOptions);
      
      logger.info(`Bulk indexed ${sessions.length} sessions`);
    } catch (error) {
      logger.error('Failed to bulk index sessions:', error);
      throw error;
    }
  }
  
  /**
   * Search sessions by query and filters
   */
  searchSessions(options: SessionSearchOptions): WWDCSearchResult[] {
    const { query, filters, limit = 20, offset = 0 } = options;
    
    try {
      // Perform fuzzy search
      let results = this.sessionIndex.search(query);
      
      // Apply filters
      if (filters) {
        results = this.applyFilters(results, filters);
      }
      
      // Apply pagination
      const paginatedResults = results.slice(offset, offset + limit);
      
      // Format results
      return paginatedResults.map(result => this.formatSearchResult(result, query));
    } catch (error) {
      logger.error('Failed to search sessions:', error);
      return [];
    }
  }
  
  /**
   * Search transcripts across all or specific sessions
   */
  searchTranscripts(options: TranscriptSearchOptions): TranscriptSearchResult[] {
    const { query, sessionIds, limit = 50, includeContext = true } = options;
    
    try {
      const results: TranscriptSearchResult[] = [];
      
      // Determine which transcript indexes to search
      const indexesToSearch = sessionIds 
        ? sessionIds.map(id => [id, this.transcriptIndex.get(id)]).filter(([_, index]) => index)
        : Array.from(this.transcriptIndex.entries());
      
      // Search each transcript index
      for (const [sessionId, index] of indexesToSearch) {
        if (!index) continue;
        
        const searchResults = index.search(query, { limit });
        
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          results.push({
            sessionId: sessionId as string,
            matches: (searchResults as FuseResult<TranscriptSegment>[]).map((match: FuseResult<TranscriptSegment>) => ({
              segment: match.item,
              score: match.score || 0,
              highlightedText: includeContext ? this.extractHighlight(match) : undefined
            }))
          });
        }
      }
      
      // Sort by best match score across all results
      results.sort((a, b) => {
        const maxScoreA = Math.min(...a.matches.map(m => m.score));
        const maxScoreB = Math.min(...b.matches.map(m => m.score));
        return maxScoreA - maxScoreB;
      });
      
      return results;
    } catch (error) {
      logger.error('Failed to search transcripts:', error);
      return [];
    }
  }
  
  /**
   * Search both sessions and transcripts
   */
  searchAll(query: string, filters?: WWDCSearchFilters): {
    sessions: WWDCSearchResult[];
    transcripts: TranscriptSearchResult[];
  } {
    const sessions = this.searchSessions({ query, filters });
    const transcripts = this.searchTranscripts({ query });
    
    return { sessions, transcripts };
  }
  
  /**
   * Get indexed sessions by various criteria
   */
  getSessionsByYear(year: number): WWDCSession[] {
    return Array.from(this.sessions.values()).filter(session => session.year === year);
  }
  
  getSessionsByPlatform(platform: string): WWDCSession[] {
    return Array.from(this.sessions.values()).filter(session => 
      session.platforms.includes(platform as any)
    );
  }
  
  getSessionsBySpeaker(speaker: string): WWDCSession[] {
    const normalizedSpeaker = speaker.toLowerCase();
    return Array.from(this.sessions.values()).filter(session => 
      session.speakers.some(s => s.toLowerCase().includes(normalizedSpeaker))
    );
  }
  
  /**
   * Get a specific session by ID
   */
  getSession(sessionId: string): WWDCSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Check if a transcript is indexed for a session
   */
  hasTranscript(sessionId: string): boolean {
    return this.transcriptIndex.has(sessionId);
  }
  
  /**
   * Get statistics about indexed content
   */
  getStats(): {
    totalSessions: number;
    sessionsWithTranscripts: number;
    totalTranscriptSegments: number;
    sessionsByYear: Record<number, number>;
  } {
    const sessionsByYear: Record<number, number> = {};
    let totalTranscriptSegments = 0;
    
    // Count sessions by year
    for (const session of this.sessions.values()) {
      sessionsByYear[session.year] = (sessionsByYear[session.year] || 0) + 1;
    }
    
    // Count transcript segments
    for (const [_, index] of this.transcriptIndex) {
      const collection = (index.getIndex() as any).docs as TranscriptSegment[];
      totalTranscriptSegments += collection.length;
    }
    
    return {
      totalSessions: this.sessions.size,
      sessionsWithTranscripts: this.transcriptIndex.size,
      totalTranscriptSegments,
      sessionsByYear
    };
  }
  
  /**
   * Clear all indexes
   */
  clear(): void {
    this.sessionIndex = new Fuse([], this.sessionFuseOptions);
    this.transcriptIndex.clear();
    this.sessions.clear();
    logger.info('All indexes cleared');
  }
  
  /**
   * Apply filters to search results
   */
  private applyFilters(
    results: FuseResult<WWDCSession>[], 
    filters: WWDCSearchFilters
  ): FuseResult<WWDCSession>[] {
    return results.filter(result => {
      const session = result.item;
      
      // Year filter
      if (filters.year !== undefined) {
        const years = Array.isArray(filters.year) ? filters.year : [filters.year];
        if (!years.includes(session.year)) return false;
      }
      
      // Platform filter
      if (filters.platform !== undefined) {
        const platforms = Array.isArray(filters.platform) ? filters.platform : [filters.platform];
        if (!platforms.some(p => session.platforms.includes(p))) return false;
      }
      
      // Speaker filter
      if (filters.speakers && filters.speakers.length > 0) {
        const speakerMatch = filters.speakers.some((speaker: string) =>
          session.speakers.some((s: string) => s.toLowerCase().includes(speaker.toLowerCase()))
        );
        if (!speakerMatch) return false;
      }
      
      // Tag filter
      if (filters.tags && filters.tags.length > 0 && session.tags) {
        const tagMatch = filters.tags.some((tag: string) =>
          session.tags!.some((t: string) => t.toLowerCase() === tag.toLowerCase())
        );
        if (!tagMatch) return false;
      }
      
      // Duration filters
      if (filters.minDuration !== undefined && session.duration < filters.minDuration) {
        return false;
      }
      if (filters.maxDuration !== undefined && session.duration > filters.maxDuration) {
        return false;
      }
      
      // Transcript filter
      if (filters.hasTranscript === true && !session.transcriptUrl) {
        return false;
      }
      
      // Code filter
      if (filters.hasCode === true && !session.sampleCodeUrl) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * Format a search result with highlights
   */
  private formatSearchResult(
    result: FuseResult<WWDCSession>, 
    query: string
  ): WWDCSearchResult {
    const highlights: string[] = [];
    
    // Extract highlights from matches
    if (result.matches) {
      for (const match of result.matches) {
        if (match.value) {
          const snippet = this.createHighlightSnippet(match.value, match.indices || []);
          highlights.push(snippet);
        }
      }
    }
    
    return {
      session: result.item,
      score: result.score || 0,
      highlights: highlights.length > 0 ? highlights : [this.createDefaultHighlight(result.item, query)]
    };
  }
  
  /**
   * Create a highlighted snippet from match indices
   */
  private createHighlightSnippet(text: string, indices: readonly [number, number][]): string {
    if (indices.length === 0) return text.substring(0, 150) + '...';
    
    // Find the first match
    const [start, end] = indices[0];
    const contextStart = Math.max(0, start - 30);
    const contextEnd = Math.min(text.length, end + 30);
    
    let snippet = '';
    if (contextStart > 0) snippet += '...';
    snippet += text.substring(contextStart, start);
    snippet += `**${text.substring(start, end + 1)}**`;
    snippet += text.substring(end + 1, contextEnd);
    if (contextEnd < text.length) snippet += '...';
    
    return snippet;
  }
  
  /**
   * Create a default highlight when no specific matches
   */
  private createDefaultHighlight(session: WWDCSession, query: string): string {
    const description = session.description || '';
    const maxLength = 150;
    
    if (description.length <= maxLength) {
      return description;
    }
    
    // Try to find query in description
    const queryLower = query.toLowerCase();
    const descLower = description.toLowerCase();
    const queryIndex = descLower.indexOf(queryLower);
    
    if (queryIndex !== -1) {
      const start = Math.max(0, queryIndex - 50);
      const end = Math.min(description.length, queryIndex + query.length + 50);
      return (start > 0 ? '...' : '') + 
             description.substring(start, end) + 
             (end < description.length ? '...' : '');
    }
    
    return description.substring(0, maxLength) + '...';
  }
  
  /**
   * Extract highlighted text from a transcript match
   */
  private extractHighlight(match: FuseResult<TranscriptSegment>): string {
    if (!match.matches || match.matches.length === 0) {
      return match.item.text;
    }
    
    const textMatch = match.matches[0];
    if (!textMatch.value || !textMatch.indices) {
      return match.item.text;
    }
    
    return this.createHighlightSnippet(textMatch.value, textMatch.indices);
  }
}

export default SessionIndexer;