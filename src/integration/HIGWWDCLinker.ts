/**
 * HIGWWDCLinker - Maps WWDC sessions to HIG guidelines based on relevance
 * 
 * This component calculates relevance scores using:
 * - Platform matching (0.3 weight)
 * - Topic/keyword matching (0.4 weight)
 * - Title/content similarity (0.3 weight)
 */

import { HIGGuideline, HIGSearchResult, ApplePlatform, CacheEntry } from '../types/index.js';
import { WWDCSession, HIGSessionMapping, RelatedSession } from '../types/wwdc.js';
import { HIGSearchEngine } from '../tools/searchHIG.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RelevanceWeights {
  platform: number;
  topic: number;
  content: number;
}

interface MappingCache {
  [guidelineId: string]: CacheEntry<RelatedSession[]>;
}

export class HIGWWDCLinker {
  private static readonly WEIGHTS: RelevanceWeights = {
    platform: 0.3,
    topic: 0.4,
    content: 0.3
  };

  private static readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly CACHE_FILE = path.join(__dirname, '../../cache/hig-wwdc-mappings.json');
  
  private searchEngine: HIGSearchEngine;
  private mappingCache: MappingCache = {};
  private wwdcSessions: WWDCSession[] = [];
  
  constructor(searchEngine: HIGSearchEngine) {
    this.searchEngine = searchEngine;
    this.initializeCache();
  }

  /**
   * Initialize the mapping cache from disk
   */
  private async initializeCache(): Promise<void> {
    try {
      const cacheData = await fs.readFile(HIGWWDCLinker.CACHE_FILE, 'utf-8');
      this.mappingCache = JSON.parse(cacheData);
      logger.info('Loaded HIG-WWDC mapping cache', {
        entries: Object.keys(this.mappingCache).length
      });
    } catch (error) {
      logger.debug('No existing mapping cache found, starting fresh');
      this.mappingCache = {};
    }
  }

  /**
   * Save the mapping cache to disk
   */
  private async saveCache(): Promise<void> {
    try {
      const cacheDir = path.dirname(HIGWWDCLinker.CACHE_FILE);
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        HIGWWDCLinker.CACHE_FILE,
        JSON.stringify(this.mappingCache, null, 2)
      );
      logger.debug('Saved HIG-WWDC mapping cache');
    } catch (error) {
      logger.error('Failed to save mapping cache', error);
    }
  }

  /**
   * Set the available WWDC sessions for mapping
   */
  public setWWDCSessions(sessions: WWDCSession[]): void {
    this.wwdcSessions = sessions;
    logger.info('Set WWDC sessions for mapping', { count: sessions.length });
  }

  /**
   * Calculate relevance score between a guideline and a WWDC session
   */
  private calculateRelevanceScore(
    guideline: HIGGuideline,
    session: WWDCSession
  ): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    // Platform matching (0.3 weight)
    const platformScore = this.calculatePlatformScore(guideline.platform, session.platforms);
    if (platformScore > 0) {
      score += platformScore * HIGWWDCLinker.WEIGHTS.platform;
      reasons.push(`Platform match: ${guideline.platform} in [${session.platforms.join(', ')}]`);
    }

    // Topic/keyword matching (0.4 weight)
    const topicScore = this.calculateTopicScore(guideline, session);
    if (topicScore > 0) {
      score += topicScore * HIGWWDCLinker.WEIGHTS.topic;
      reasons.push(`Topic overlap: ${Math.round(topicScore * 100)}% match`);
    }

    // Title/content similarity (0.3 weight)
    const contentScore = this.calculateContentSimilarity(guideline, session);
    if (contentScore > 0) {
      score += contentScore * HIGWWDCLinker.WEIGHTS.content;
      reasons.push(`Content similarity: ${Math.round(contentScore * 100)}%`);
    }

    return { score, reasons };
  }

  /**
   * Calculate platform matching score
   */
  private calculatePlatformScore(
    guidelinePlatform: ApplePlatform,
    sessionPlatforms: ApplePlatform[]
  ): number {
    if (sessionPlatforms.includes(guidelinePlatform)) {
      return 1.0;
    }
    
    // Partial credit for related platforms
    const relatedPlatforms: Record<ApplePlatform, ApplePlatform[]> = {
      'ios': ['watchos', 'tvos'],
      'macos': ['ios'],
      'watchos': ['ios'],
      'tvos': ['ios'],
      'visionos': ['ios', 'macos']
    };
    
    const related = relatedPlatforms[guidelinePlatform] || [];
    const hasRelated = sessionPlatforms.some(p => related.includes(p));
    
    return hasRelated ? 0.5 : 0;
  }

  /**
   * Calculate topic/keyword matching score
   */
  private calculateTopicScore(guideline: HIGGuideline, session: WWDCSession): number {
    if (!guideline.topics || guideline.topics.length === 0) {
      return 0;
    }

    const guidelineTopics = new Set(
      guideline.topics.map(t => t.toLowerCase())
    );
    
    const sessionTopics = new Set([
      ...session.topics.map(t => t.toLowerCase()),
      ...session.tags?.map(t => t.toLowerCase()) || []
    ]);

    // Also extract keywords from titles
    const guidelineKeywords = this.extractKeywords(guideline.title);
    const sessionKeywords = this.extractKeywords(session.title);

    guidelineKeywords.forEach(k => guidelineTopics.add(k));
    sessionKeywords.forEach(k => sessionTopics.add(k));

    // Calculate intersection
    const intersection = [...guidelineTopics].filter(t => sessionTopics.has(t));
    const union = new Set([...guidelineTopics, ...sessionTopics]);

    return intersection.length / Math.max(guidelineTopics.size, 1);
  }

  /**
   * Calculate content similarity score
   */
  private calculateContentSimilarity(
    guideline: HIGGuideline,
    session: WWDCSession
  ): number {
    // Combine relevant text for comparison
    const guidelineText = `${guideline.title} ${guideline.content}`.toLowerCase();
    const sessionText = `${session.title} ${session.description}`.toLowerCase();

    // Simple keyword overlap calculation
    const guidelineWords = this.extractSignificantWords(guidelineText);
    const sessionWords = this.extractSignificantWords(sessionText);

    const overlap = guidelineWords.filter(w => sessionWords.includes(w));
    
    return overlap.length / Math.max(guidelineWords.length, 1);
  }

  /**
   * Extract keywords from a title
   */
  private extractKeywords(title: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were'
    ]);

    return title
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Extract significant words from text
   */
  private extractSignificantWords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them'
    ]);

    return text
      .split(/\W+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 50); // Limit to top 50 words for performance
  }

  /**
   * Find related WWDC sessions for a given guideline
   */
  public async findRelatedSessions(
    guideline: HIGGuideline,
    limit: number = 5
  ): Promise<RelatedSession[]> {
    // Check cache first
    const cached = this.mappingCache[guideline.id];
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('Returning cached WWDC sessions for guideline', {
        guidelineId: guideline.id
      });
      return cached.data.slice(0, limit);
    }

    // Calculate relevance scores for all sessions
    const scoredSessions: RelatedSession[] = this.wwdcSessions
      .map(session => {
        const { score, reasons } = this.calculateRelevanceScore(guideline, session);
        return {
          session,
          relevance: score,
          reasons
        };
      })
      .filter(result => result.relevance > 0.1) // Filter out very low relevance
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit * 2); // Get more than needed for caching

    // Cache the results
    this.mappingCache[guideline.id] = {
      data: scoredSessions,
      timestamp: Date.now(),
      expiresAt: Date.now() + HIGWWDCLinker.CACHE_TTL
    };

    await this.saveCache();

    return scoredSessions.slice(0, limit);
  }

  /**
   * Find related guidelines for a given WWDC session
   */
  public async findRelatedGuidelines(
    session: WWDCSession,
    limit: number = 5
  ): Promise<HIGSearchResult[]> {
    // Build a search query from session info
    const searchTerms = [
      ...this.extractKeywords(session.title),
      ...session.topics.slice(0, 3)
    ].join(' ');

    // Search for related guidelines
    const searchResults = await this.searchEngine.search({
      query: searchTerms,
      platform: session.platforms[0], // Use primary platform
    });
    
    // Limit the results
    const limitedResults = searchResults.slice(0, limit * 2);

    // Re-score based on our relevance calculation and convert format
    const rescoredResults = await Promise.all(
      limitedResults.map(async result => {
        // Convert HIGSearchEngine result to HIGSearchResult format
        const higResult: HIGSearchResult = {
          id: result.item.id,
          title: result.item.title,
          description: result.item.content || result.item.summary || '',
          platform: (result.item.platform as ApplePlatform) || session.platforms[0],
          category: result.item.category,
          url: result.item.url,
          relevanceScore: 1 - (result.score || 0) // Fuse scores are inverted (lower is better)
        };
        
        // Calculate our custom relevance
        const customRelevance = this.calculateSimplifiedRelevance(higResult, session);
        return {
          ...higResult,
          relevanceScore: customRelevance
        };
      })
    );

    return rescoredResults
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  /**
   * Calculate simplified relevance for search results
   */
  private calculateSimplifiedRelevance(
    searchResult: HIGSearchResult,
    session: WWDCSession
  ): number {
    let score = searchResult.relevanceScore * 0.5; // Start with search relevance

    // Platform bonus
    if (session.platforms.includes(searchResult.platform)) {
      score += 0.2;
    }

    // Title similarity bonus
    const titleSimilarity = this.calculateTitleSimilarity(
      searchResult.title,
      session.title
    );
    score += titleSimilarity * 0.3;

    return Math.min(score, 1.0);
  }

  /**
   * Calculate title similarity
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const words1 = this.extractKeywords(title1);
    const words2 = this.extractKeywords(title2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const intersection = words1.filter(w => words2.includes(w));
    return intersection.length / Math.max(words1.length, words2.length);
  }

  /**
   * Enrich a guideline response with related WWDC content
   */
  public async enrichGuidelineWithWWDC(
    guideline: HIGGuideline,
    maxSessions: number = 3
  ): Promise<HIGGuideline & { relatedWWDCSessions?: RelatedSession[] }> {
    try {
      const relatedSessions = await this.findRelatedSessions(guideline, maxSessions);
      
      if (relatedSessions.length > 0) {
        logger.info('Enriched guideline with WWDC sessions', {
          guidelineId: guideline.id,
          sessionCount: relatedSessions.length
        });

        return {
          ...guideline,
          relatedWWDCSessions: relatedSessions
        };
      }
    } catch (error) {
      logger.error('Failed to enrich guideline with WWDC content', error);
    }

    return guideline;
  }

  /**
   * Batch process guidelines to build mappings
   */
  public async buildMappings(
    guidelines: HIGGuideline[],
    sessionsPerGuideline: number = 5
  ): Promise<HIGSessionMapping[]> {
    const mappings: HIGSessionMapping[] = [];

    for (const guideline of guidelines) {
      try {
        const relatedSessions = await this.findRelatedSessions(
          guideline,
          sessionsPerGuideline
        );

        if (relatedSessions.length > 0) {
          mappings.push({
            guidelineId: guideline.id,
            sessions: relatedSessions,
            lastUpdated: new Date()
          });
        }
      } catch (error) {
        logger.error(`Failed to build mapping for guideline ${guideline.id}`, error);
      }
    }

    logger.info('Built HIG-WWDC mappings', {
      guidelines: guidelines.length,
      mappings: mappings.length
    });

    return mappings;
  }

  /**
   * Clear the mapping cache
   */
  public async clearCache(): Promise<void> {
    this.mappingCache = {};
    await this.saveCache();
    logger.info('Cleared HIG-WWDC mapping cache');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    entries: number;
    size: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const entries = Object.values(this.mappingCache);
    
    if (entries.length === 0) {
      return { entries: 0, size: 0 };
    }

    const timestamps = entries.map(e => e.timestamp);
    
    return {
      entries: entries.length,
      size: JSON.stringify(this.mappingCache).length,
      oldestEntry: new Date(Math.min(...timestamps)),
      newestEntry: new Date(Math.max(...timestamps))
    };
  }
}