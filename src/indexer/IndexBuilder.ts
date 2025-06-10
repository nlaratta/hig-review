import Fuse, { IFuseOptions } from 'fuse.js';
import { CacheManager } from '../cache/CacheManager.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IndexedContent } from './ContentIndexer.js';

export interface SearchIndexEntry {
  id: string;
  title: string;
  description: string;
  url: string;
  platform?: string;
  category: string;
  subcategory?: string;
  keywords: string[];
  content: string; // Truncated content for search
  relevance: number;
  lastUpdated: string;
}

export interface SearchIndex {
  version: string;
  created: string;
  entries: SearchIndexEntry[];
  metadata: {
    totalDocuments: number;
    categories: Record<string, number>;
    platforms: Record<string, number>;
    averageDocumentSize: number;
  };
}

export class IndexBuilder {
  private cache: CacheManager;
  private indexPath: string;
  private fuseIndex: Fuse<SearchIndexEntry> | null = null;

  constructor(cacheDir: string = './cache') {
    this.cache = new CacheManager({ baseDir: cacheDir });
    this.indexPath = path.join(cacheDir, 'search-index.json');
  }

  /**
   * Build search index from cached content
   */
  async buildIndex(): Promise<SearchIndex> {
    logger.info('Building search index from cached content...');

    try {
      // Get all cached entries
      const entries = await this.loadCachedContent();
      logger.info(`Found ${entries.length} cached documents`);

      // Transform to search index entries
      const searchEntries = entries.map(entry => this.transformToSearchEntry(entry));

      // Calculate metadata
      const metadata = this.calculateMetadata(searchEntries);

      // Create the index
      const searchIndex: SearchIndex = {
        version: '1.0',
        created: new Date().toISOString(),
        entries: searchEntries,
        metadata
      };

      // Save to disk
      await this.saveIndex(searchIndex);

      // Create Fuse index
      this.createFuseIndex(searchEntries);

      logger.info('Search index built successfully', metadata);
      return searchIndex;

    } catch (error) {
      logger.error('Failed to build search index', error);
      throw error;
    }
  }

  /**
   * Load all cached content
   */
  private async loadCachedContent(): Promise<IndexedContent[]> {
    const cacheDir = path.join(process.cwd(), 'cache', 'content');
    const entries: IndexedContent[] = [];

    try {
      // Read subdirectories (cache uses hash-based subdirectories)
      const subdirs = await fs.readdir(cacheDir);
      
      for (const subdir of subdirs) {
        const subdirPath = path.join(cacheDir, subdir);
        const stat = await fs.stat(subdirPath);
        
        if (stat.isDirectory()) {
          const files = await fs.readdir(subdirPath);
          
          for (const file of files) {
            if (file.endsWith('.json')) {
              try {
                const filePath = path.join(subdirPath, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const data = JSON.parse(content);
                
                // The cached content is stored directly, not under a 'data' property
                if (this.isIndexedContent(data)) {
                  entries.push(data);
                }
              } catch (error) {
                logger.error(`Failed to load cache file: ${file}`, error);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to read cache directory', error);
    }

    return entries;
  }

  /**
   * Check if data is IndexedContent
   */
  private isIndexedContent(data: any): data is IndexedContent {
    return (
      data &&
      typeof data.url === 'string' &&
      typeof data.title === 'string' &&
      typeof data.content === 'string'
    );
  }

  /**
   * Transform indexed content to search entry
   */
  private transformToSearchEntry(content: IndexedContent): SearchIndexEntry {
    // Generate a unique ID from the URL
    const id = this.generateId(content.url);

    // Truncate content for search (keep first 500 chars)
    const truncatedContent = content.content.substring(0, 500);

    // Calculate relevance based on various factors
    const relevance = this.calculateRelevance(content);

    return {
      id,
      title: content.title,
      description: content.description,
      url: content.url,
      platform: content.platform,
      category: content.category,
      subcategory: content.subcategory,
      keywords: content.keywords,
      content: truncatedContent,
      relevance,
      lastUpdated: content.lastIndexed.toString()
    };
  }

  /**
   * Generate unique ID from URL
   */
  private generateId(url: string): string {
    // Remove base URL and special characters
    return url
      .replace('https://developer.apple.com/design/human-interface-guidelines/', '')
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .toLowerCase();
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(content: IndexedContent): number {
    let score = 1.0;

    // Boost main category pages
    if (content.subcategory === 'main') {
      score += 0.5;
    }

    // Boost pages with code examples
    if (content.codeExamples > 0) {
      score += 0.2 * Math.min(content.codeExamples, 5);
    }

    // Boost foundation and component pages
    if (['foundations', 'components'].includes(content.category)) {
      score += 0.3;
    }

    // Boost pages with more sections
    if (content.sections.length > 5) {
      score += 0.2;
    }

    return Math.min(score, 2.0); // Cap at 2.0
  }

  /**
   * Calculate index metadata
   */
  private calculateMetadata(entries: SearchIndexEntry[]): SearchIndex['metadata'] {
    const categories: Record<string, number> = {};
    const platforms: Record<string, number> = {};
    let totalSize = 0;

    for (const entry of entries) {
      // Count by category
      categories[entry.category] = (categories[entry.category] || 0) + 1;

      // Count by platform
      if (entry.platform) {
        platforms[entry.platform] = (platforms[entry.platform] || 0) + 1;
      }

      // Calculate size
      totalSize += entry.content.length + entry.title.length + entry.description.length;
    }

    return {
      totalDocuments: entries.length,
      categories,
      platforms,
      averageDocumentSize: Math.round(totalSize / entries.length)
    };
  }

  /**
   * Save index to disk
   */
  private async saveIndex(index: SearchIndex): Promise<void> {
    await fs.writeFile(
      this.indexPath,
      JSON.stringify(index, null, 2),
      'utf-8'
    );
    logger.info(`Search index saved to ${this.indexPath}`);
  }

  /**
   * Load index from disk
   */
  async loadIndex(): Promise<SearchIndex | null> {
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8');
      const index = JSON.parse(data) as SearchIndex;
      
      // Create Fuse index
      this.createFuseIndex(index.entries);
      
      return index;
    } catch (error) {
      logger.error('Failed to load search index', error);
      return null;
    }
  }

  /**
   * Create Fuse.js index for fast searching
   */
  private createFuseIndex(entries: SearchIndexEntry[]): void {
    const fuseOptions: IFuseOptions<SearchIndexEntry> = {
      keys: [
        { name: 'title', weight: 2.0 },
        { name: 'description', weight: 1.5 },
        { name: 'keywords', weight: 1.2 },
        { name: 'content', weight: 1.0 },
        { name: 'category', weight: 0.8 },
        { name: 'subcategory', weight: 0.6 }
      ],
      threshold: 0.4,
      includeScore: true,
      shouldSort: true,
      minMatchCharLength: 2,
      findAllMatches: true,
      ignoreLocation: true
    };

    this.fuseIndex = new Fuse(entries, fuseOptions);
    logger.info('Fuse.js search index created');
  }

  /**
   * Search the index
   */
  search(query: string, options?: {
    platform?: string;
    category?: string;
    limit?: number;
  }): SearchIndexEntry[] {
    if (!this.fuseIndex) {
      throw new Error('Search index not loaded');
    }

    // Perform the search
    let results = this.fuseIndex.search(query);

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

    // Apply relevance boost and limit
    const boostedResults = results
      .map(result => ({
        ...result,
        score: (result.score || 0) * result.item.relevance
      }))
      .sort((a, b) => a.score - b.score) // Lower score is better in Fuse.js
      .slice(0, options?.limit || 50);

    return boostedResults.map(result => result.item);
  }

  /**
   * Update index incrementally
   */
  async updateIndex(newEntries: IndexedContent[]): Promise<void> {
    logger.info(`Updating search index with ${newEntries.length} new entries`);

    // Load existing index
    const existingIndex = await this.loadIndex();
    if (!existingIndex) {
      // No existing index, build from scratch
      await this.buildIndex();
      return;
    }

    // Transform new entries
    const newSearchEntries = newEntries.map(entry => this.transformToSearchEntry(entry));

    // Merge with existing entries (avoiding duplicates)
    const urlMap = new Map<string, SearchIndexEntry>();
    
    // Add existing entries
    existingIndex.entries.forEach(entry => {
      urlMap.set(entry.url, entry);
    });

    // Add/update new entries
    newSearchEntries.forEach(entry => {
      urlMap.set(entry.url, entry);
    });

    // Create updated index
    const updatedEntries = Array.from(urlMap.values());
    const updatedIndex: SearchIndex = {
      ...existingIndex,
      entries: updatedEntries,
      metadata: this.calculateMetadata(updatedEntries),
      created: new Date().toISOString()
    };

    // Save and reload
    await this.saveIndex(updatedIndex);
    this.createFuseIndex(updatedEntries);

    logger.info('Search index updated successfully');
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<{
    loaded: boolean;
    totalDocuments: number;
    categories: Record<string, number>;
    platforms: Record<string, number>;
    indexSize: number;
    lastUpdated: string;
  }> {
    const index = await this.loadIndex();
    
    if (!index) {
      return {
        loaded: false,
        totalDocuments: 0,
        categories: {},
        platforms: {},
        indexSize: 0,
        lastUpdated: 'never'
      };
    }

    // Get file size
    const stats = await fs.stat(this.indexPath);

    return {
      loaded: true,
      totalDocuments: index.metadata.totalDocuments,
      categories: index.metadata.categories,
      platforms: index.metadata.platforms,
      indexSize: stats.size,
      lastUpdated: index.created
    };
  }
}