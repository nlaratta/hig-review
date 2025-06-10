import Fuse from 'fuse.js';
import { HIGSearchResult } from '../types/index.js';
import { IndexBuilder } from '../indexer/IndexBuilder.js';
import { logger } from '../utils/logger.js';
import urlMappings from '../scraper/url-mappings.json' assert { type: 'json' };

export class SearchEngine {
  private indexBuilder: IndexBuilder;
  private fuseInstance: Fuse<any> | null = null;
  private fallbackIndex: any[] = [];
  private isInitialized: boolean = false;

  constructor() {
    this.indexBuilder = new IndexBuilder();
    this.initializeFallbackIndex();
  }

  /**
   * Initialize the search engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Try to load persisted index
      const searchIndex = await this.indexBuilder.loadIndex();
      
      if (searchIndex && searchIndex.entries.length > 0) {
        logger.info('Loaded persisted search index', {
          documents: searchIndex.entries.length,
          created: searchIndex.created
        });
        
        // The IndexBuilder already creates the Fuse instance
        this.isInitialized = true;
      } else {
        logger.warn('No persisted index found, using fallback URL mappings');
        this.initializeFuseWithFallback();
      }
    } catch (error) {
      logger.error('Failed to load search index, using fallback', error);
      this.initializeFuseWithFallback();
    }
  }

  /**
   * Search for HIG content
   */
  async search(
    query: string,
    options?: {
      platform?: string;
      category?: string;
      limit?: number;
    }
  ): Promise<HIGSearchResult[]> {
    await this.initialize();

    try {
      // Use IndexBuilder's search if available
      const searchResults = this.indexBuilder.search(query, options);
      
      if (searchResults.length > 0) {
        // Transform to HIGSearchResult format
        return searchResults.map(result => ({
          id: result.id,
          title: result.title,
          description: result.description,
          platform: (result.platform || 'general') as any,
          category: result.category,
          url: result.url,
          relevanceScore: result.relevance
        }));
      }
    } catch (error) {
      logger.error('Search failed, falling back to URL mappings', error);
    }

    // Fallback to URL-based search
    return this.fallbackSearch(query, options);
  }

  /**
   * Initialize fallback index from URL mappings
   */
  private initializeFallbackIndex(): void {
    const entries: any[] = [];

    // Add platform pages
    Object.entries(urlMappings.platforms).forEach(([platform, data]) => {
      entries.push({
        id: `platform-${platform}`,
        title: `Designing for ${platform.toUpperCase()}`,
        description: data.description,
        url: `${urlMappings.base_url}${data.main}`,
        platform,
        category: 'platform',
        keywords: [platform, 'design', 'guidelines'],
        relevance: 1.5
      });
    });

    // Add section pages
    Object.entries(urlMappings.sections).forEach(([section, data]) => {
      // Main section page
      entries.push({
        id: `section-${section}`,
        title: section.charAt(0).toUpperCase() + section.slice(1),
        description: data.description,
        url: `${urlMappings.base_url}${data.main}`,
        category: section,
        keywords: [section],
        relevance: 1.3
      });

      // Add subcategories
      if ('subcategories' in data && Array.isArray(data.subcategories)) {
        data.subcategories.forEach(subUrl => {
          const name = this.extractNameFromUrl(subUrl);
          entries.push({
            id: `${section}-${name}`,
            title: this.formatTitle(name),
            description: `${section} - ${name}`,
            url: `${urlMappings.base_url}${subUrl}`,
            category: section,
            subcategory: name,
            keywords: [section, name],
            relevance: 1.0
          });
        });
      }
    });

    this.fallbackIndex = entries;
  }

  /**
   * Initialize Fuse with fallback data
   */
  private initializeFuseWithFallback(): void {
    const fuseOptions: Fuse.IFuseOptions<any> = {
      keys: [
        { name: 'title', weight: 2.0 },
        { name: 'description', weight: 1.5 },
        { name: 'keywords', weight: 1.2 },
        { name: 'category', weight: 0.8 }
      ],
      threshold: 0.4,
      includeScore: true,
      shouldSort: true,
      minMatchCharLength: 2
    };

    this.fuseInstance = new Fuse(this.fallbackIndex, fuseOptions);
    this.isInitialized = true;
  }

  /**
   * Fallback search using URL mappings
   */
  private fallbackSearch(
    query: string,
    options?: {
      platform?: string;
      category?: string;
      limit?: number;
    }
  ): HIGSearchResult[] {
    if (!this.fuseInstance) {
      this.initializeFuseWithFallback();
    }

    let results = this.fuseInstance!.search(query);

    // Apply filters
    if (options?.platform || options?.category) {
      results = results.filter(result => {
        const item = result.item;
        if (options.platform && item.platform !== options.platform) {
          return false;
        }
        if (options.category && item.category !== options.category) {
          return false;
        }
        return true;
      });
    }

    // Transform and limit results
    return results
      .slice(0, options?.limit || 20)
      .map(result => ({
        id: result.item.id,
        title: result.item.title,
        description: result.item.description,
        platform: result.item.platform || 'general',
        category: result.item.category,
        url: result.item.url,
        relevanceScore: result.item.relevance * (1 - (result.score || 0))
      }));
  }

  /**
   * Extract name from URL path
   */
  private extractNameFromUrl(url: string): string {
    const parts = url.split('/');
    return parts[parts.length - 1] || 'unknown';
  }

  /**
   * Format title from URL segment
   */
  private formatTitle(name: string): string {
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Update search index incrementally
   */
  async updateIndex(newContent: any[]): Promise<void> {
    try {
      await this.indexBuilder.updateIndex(newContent);
      // Reinitialize to use updated index
      this.isInitialized = false;
      await this.initialize();
      logger.info('Search index updated successfully');
    } catch (error) {
      logger.error('Failed to update search index', error);
    }
  }

  /**
   * Get search engine statistics
   */
  async getStats(): Promise<any> {
    return await this.indexBuilder.getStats();
  }
}