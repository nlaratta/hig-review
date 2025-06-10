import { HIGScraper } from '../scraper/HIGScraper.js';
import { ContentParser } from '../parser/ContentParser.js';
import { CacheManager } from '../cache/CacheManager.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import urlMappings from '../scraper/url-mappings.json' assert { type: 'json' };

export interface IndexProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentUrl?: string;
  startTime: number;
  errors: Array<{ url: string; error: string }>;
}

export interface IndexedContent {
  url: string;
  title: string;
  description: string;
  content: string;
  sections: Array<{
    title: string;
    content: string;
    type: string;
  }>;
  platform?: string;
  category: string;
  subcategory?: string;
  keywords: string[];
  codeExamples: number;
  lastIndexed: Date;
  contentHash: string;
}

export class ContentIndexer {
  private scraper: HIGScraper;
  private parser: ContentParser;
  private cache: CacheManager;
  private progress: IndexProgress;
  private progressFile: string;
  private indexFile: string;
  private abortController: AbortController;

  constructor(cacheDir: string = './cache') {
    this.scraper = new HIGScraper();
    this.parser = new ContentParser();
    this.cache = new CacheManager({ baseDir: cacheDir });
    this.progressFile = path.join(cacheDir, 'index-progress.json');
    this.indexFile = path.join(cacheDir, 'content-index.json');
    this.abortController = new AbortController();
    
    this.progress = {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      startTime: Date.now(),
      errors: []
    };

    // Handle graceful shutdown
    process.on('SIGINT', () => this.handleShutdown());
    process.on('SIGTERM', () => this.handleShutdown());
  }

  /**
   * Start indexing all HIG content
   */
  async indexAll(options: {
    incremental?: boolean;
    platforms?: string[];
    categories?: string[];
    onProgress?: (progress: IndexProgress) => void;
  } = {}): Promise<void> {
    try {
      logger.info('Starting content indexing', options);

      // Load previous progress if resuming
      await this.loadProgress();

      // Get all URLs to index
      const urls = await this.collectUrls(options);
      this.progress.total = urls.length;

      logger.info(`Found ${urls.length} URLs to index`);

      // Process each URL
      for (const urlInfo of urls) {
        if (this.abortController.signal.aborted) {
          logger.info('Indexing aborted by user');
          break;
        }

        await this.indexUrl(urlInfo, options.incremental || false);
        
        if (options.onProgress) {
          options.onProgress(this.progress);
        }

        // Save progress periodically
        if (this.progress.completed % 10 === 0) {
          await this.saveProgress();
        }
      }

      // Final save
      await this.saveProgress();
      await this.buildSearchIndex();

      logger.info('Indexing completed', {
        total: this.progress.total,
        completed: this.progress.completed,
        failed: this.progress.failed,
        skipped: this.progress.skipped,
        duration: Date.now() - this.progress.startTime
      });

    } catch (error) {
      logger.error('Indexing failed', error);
      throw error;
    }
  }

  /**
   * Index a single URL
   */
  private async indexUrl(urlInfo: {
    url: string;
    platform?: string;
    category: string;
    subcategory?: string;
  }, incremental: boolean): Promise<void> {
    const fullUrl = `${urlMappings.base_url}${urlInfo.url}`;
    this.progress.currentUrl = fullUrl;

    try {
      // Check if already indexed (for incremental mode)
      if (incremental) {
        const cached = await this.cache.get(fullUrl, { platform: urlInfo.platform });
        if (cached && this.isRecentlyIndexed(cached.lastIndexed)) {
          logger.debug('Skipping recently indexed URL', { url: fullUrl });
          this.progress.skipped++;
          this.progress.completed++;
          return;
        }
      }

      logger.info('Indexing URL', { url: fullUrl });

      // Scrape the page
      const scrapedContent = await this.scraper.scrapePage(fullUrl);

      let indexedContent: IndexedContent;

      try {
        // Try to parse the content
        const parsedContent = await this.parser.parse(scrapedContent.content, fullUrl);

        // Extract keywords
        const keywords = this.extractKeywords(parsedContent);

        // Create indexed content from parsed data
        indexedContent = {
          url: fullUrl,
          title: parsedContent.title,
          description: parsedContent.description,
          content: this.combineContent(parsedContent),
          sections: parsedContent.sections.map(section => ({
            title: section.title,
            content: section.content,
            type: section.type
          })),
          platform: urlInfo.platform,
          category: urlInfo.category,
          subcategory: urlInfo.subcategory,
          keywords,
          codeExamples: parsedContent.codeBlocks.length,
          lastIndexed: new Date(),
          contentHash: await this.generateContentHash(parsedContent)
        };
      } catch (parseError) {
        // Fall back to scraped content if parsing fails
        logger.warn('Failed to parse content, using scraped data', { url: fullUrl, error: parseError });
        
        const keywords = this.extractKeywordsFromScraped(scrapedContent);
        
        indexedContent = {
          url: fullUrl,
          title: scrapedContent.title,
          description: scrapedContent.summary || '',
          content: scrapedContent.content,
          sections: [{
            title: scrapedContent.title,
            content: scrapedContent.content,
            type: 'general'
          }],
          platform: urlInfo.platform,
          category: urlInfo.category,
          subcategory: urlInfo.subcategory,
          keywords,
          codeExamples: scrapedContent.codeExamples?.length || 0,
          lastIndexed: new Date(),
          contentHash: await this.generateScrapedContentHash(scrapedContent)
        };
      }

      // Store in cache
      await this.cache.set(fullUrl, indexedContent, {
        platform: urlInfo.platform,
        ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      this.progress.completed++;
      logger.info('Successfully indexed URL', { 
        url: fullUrl, 
        title: indexedContent.title 
      });

    } catch (error) {
      logger.error('Failed to index URL', { url: fullUrl, error });
      this.progress.failed++;
      this.progress.errors.push({
        url: fullUrl,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Collect all URLs to index based on url-mappings.json
   */
  private async collectUrls(options: {
    platforms?: string[];
    categories?: string[];
  }): Promise<Array<{
    url: string;
    platform?: string;
    category: string;
    subcategory?: string;
  }>> {
    const urls: Array<{
      url: string;
      platform?: string;
      category: string;
      subcategory?: string;
    }> = [];

    // Add platform-specific URLs
    if (!options.platforms || options.platforms.length === 0) {
      options.platforms = Object.keys(urlMappings.platforms);
    }

    for (const platform of options.platforms) {
      const platformData = urlMappings.platforms[platform as keyof typeof urlMappings.platforms];
      if (platformData) {
        urls.push({
          url: platformData.main,
          platform,
          category: 'platform',
          subcategory: platform
        });
      }
    }

    // Add section URLs
    const categories = options.categories || Object.keys(urlMappings.sections);
    
    for (const category of categories) {
      const section = urlMappings.sections[category as keyof typeof urlMappings.sections];
      if (!section) continue;

      // Add main section URL
      urls.push({
        url: section.main,
        category,
        subcategory: 'main'
      });

      // Add subcategory URLs
      if ('subcategories' in section && Array.isArray(section.subcategories)) {
        for (const subUrl of section.subcategories) {
          urls.push({
            url: subUrl,
            category,
            subcategory: this.extractSubcategory(subUrl)
          });
        }
      }

      // Handle components section with nested structure
      if (category === 'components' && 'categories' in section) {
        const componentSection = section as typeof urlMappings.sections.components;
        
        // Add all components page
        if (componentSection.all_components) {
          urls.push({
            url: componentSection.all_components,
            category: 'components',
            subcategory: 'all'
          });
        }

        // Add component category pages
        for (const [catKey, catData] of Object.entries(componentSection.categories)) {
          for (const itemPath of catData.items) {
            urls.push({
              url: `${catData.path}${itemPath}`,
              category: 'components',
              subcategory: catKey
            });
          }
        }
      }

      // Handle technologies section
      if (category === 'technologies' && 'items' in section) {
        const techSection = section as typeof urlMappings.sections.technologies;
        for (const techPath of techSection.items) {
          urls.push({
            url: `${techSection.main}${techPath}`,
            category: 'technologies',
            subcategory: this.extractSubcategory(techPath)
          });
        }
      }
    }

    return urls;
  }

  /**
   * Extract subcategory from URL path
   */
  private extractSubcategory(url: string): string {
    const parts = url.split('/');
    return parts[parts.length - 1] || 'general';
  }

  /**
   * Check if content was recently indexed
   */
  private isRecentlyIndexed(lastIndexed: Date | string): boolean {
    const indexed = new Date(lastIndexed);
    const daysSinceIndexed = (Date.now() - indexed.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceIndexed < 1; // Consider recent if indexed within 1 day
  }

  /**
   * Extract keywords from parsed content
   */
  private extractKeywords(content: any): string[] {
    const keywords = new Set<string>();

    // Add title words
    const titleWords = content.title.toLowerCase().split(/\s+/);
    titleWords.forEach((word: string) => {
      if (word.length > 3) keywords.add(word);
    });

    // Add common HIG terms found in content
    const higTerms = [
      'button', 'navigation', 'color', 'typography', 'layout',
      'gesture', 'animation', 'accessibility', 'icon', 'symbol',
      'view', 'controller', 'swift', 'swiftui', 'uikit', 'appkit'
    ];

    const contentText = this.combineContent(content).toLowerCase();
    higTerms.forEach(term => {
      if (contentText.includes(term)) {
        keywords.add(term);
      }
    });

    // Add platform names
    const platforms = ['ios', 'macos', 'watchos', 'tvos', 'visionos'];
    platforms.forEach(platform => {
      if (contentText.includes(platform)) {
        keywords.add(platform);
      }
    });

    return Array.from(keywords);
  }

  /**
   * Combine all content into searchable text
   */
  private combineContent(parsedContent: any): string {
    const parts = [
      parsedContent.title,
      parsedContent.description
    ];

    // Add section content
    if (parsedContent.sections) {
      parsedContent.sections.forEach((section: any) => {
        parts.push(section.title);
        parts.push(section.content);
      });
    }

    return parts.filter(Boolean).join(' ');
  }

  /**
   * Generate content hash for change detection
   */
  private async generateContentHash(content: any): Promise<string> {
    const crypto = await import('crypto');
    const contentStr = JSON.stringify({
      title: content.title,
      description: content.description,
      sections: content.sections
    });
    return crypto.default.createHash('md5').update(contentStr).digest('hex');
  }

  /**
   * Generate content hash for scraped content
   */
  private async generateScrapedContentHash(content: any): Promise<string> {
    const crypto = await import('crypto');
    const contentStr = JSON.stringify({
      title: content.title,
      content: content.content,
      summary: content.summary
    });
    return crypto.default.createHash('md5').update(contentStr).digest('hex');
  }

  /**
   * Extract keywords from scraped content
   */
  private extractKeywordsFromScraped(content: any): string[] {
    const keywords = new Set<string>();

    // Add title words
    const titleWords = (content.title || '').toLowerCase().split(/\s+/);
    titleWords.forEach((word: string) => {
      if (word.length > 3) keywords.add(word);
    });

    // Add common HIG terms found in content
    const higTerms = [
      'button', 'navigation', 'color', 'typography', 'layout',
      'gesture', 'animation', 'accessibility', 'icon', 'symbol',
      'view', 'controller', 'swift', 'swiftui', 'uikit', 'appkit'
    ];

    const contentText = (content.content || '').toLowerCase();
    higTerms.forEach(term => {
      if (contentText.includes(term)) {
        keywords.add(term);
      }
    });

    return Array.from(keywords);
  }

  /**
   * Build the final search index
   */
  private async buildSearchIndex(): Promise<void> {
    logger.info('Building search index...');
    
    const entries = await this.cache.getStats();
    const allContent: IndexedContent[] = [];

    // This is a simplified version - in production, you'd iterate through all cached entries
    // For now, we'll save the index metadata
    const indexMetadata = {
      version: '1.0',
      lastBuilt: new Date().toISOString(),
      totalDocuments: this.progress.completed,
      categories: this.getCategoryStats(),
      platforms: this.getPlatformStats()
    };

    await fs.writeFile(
      this.indexFile,
      JSON.stringify(indexMetadata, null, 2),
      'utf-8'
    );

    logger.info('Search index built successfully');
  }

  /**
   * Get category statistics
   */
  private getCategoryStats(): Record<string, number> {
    // In a real implementation, this would count actual indexed content
    return {
      foundations: 0,
      patterns: 0,
      components: 0,
      inputs: 0,
      technologies: 0
    };
  }

  /**
   * Get platform statistics
   */
  private getPlatformStats(): Record<string, number> {
    // In a real implementation, this would count actual indexed content
    return {
      ios: 0,
      macos: 0,
      watchos: 0,
      tvos: 0,
      visionos: 0
    };
  }

  /**
   * Load previous indexing progress
   */
  private async loadProgress(): Promise<void> {
    try {
      const data = await fs.readFile(this.progressFile, 'utf-8');
      const saved = JSON.parse(data);
      
      // Only restore if the previous session was recent (within 24 hours)
      if (Date.now() - saved.startTime < 24 * 60 * 60 * 1000) {
        this.progress = saved;
        logger.info('Resuming previous indexing session', {
          completed: saved.completed,
          total: saved.total
        });
      }
    } catch (error) {
      // No previous progress, start fresh
      logger.debug('No previous progress found, starting fresh');
    }
  }

  /**
   * Save current indexing progress
   */
  private async saveProgress(): Promise<void> {
    try {
      await fs.writeFile(
        this.progressFile,
        JSON.stringify(this.progress, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error('Failed to save progress', error);
    }
  }

  /**
   * Handle graceful shutdown
   */
  private async handleShutdown(): Promise<void> {
    logger.info('Shutting down indexer...');
    this.abortController.abort();
    await this.saveProgress();
    await this.cache.close();
    process.exit(0);
  }

  /**
   * Get indexing statistics
   */
  getStats(): {
    progress: IndexProgress;
    cacheStats: any;
    performance: {
      pagesPerMinute: number;
      averagePageTime: number;
      estimatedTimeRemaining: number;
    };
  } {
    const elapsed = Date.now() - this.progress.startTime;
    const pagesPerMinute = (this.progress.completed / elapsed) * 60000;
    const averagePageTime = elapsed / Math.max(1, this.progress.completed);
    const remaining = this.progress.total - this.progress.completed;
    const estimatedTimeRemaining = remaining * averagePageTime;

    return {
      progress: this.progress,
      cacheStats: this.scraper.getStats(),
      performance: {
        pagesPerMinute: Math.round(pagesPerMinute * 100) / 100,
        averagePageTime: Math.round(averagePageTime / 1000), // in seconds
        estimatedTimeRemaining: Math.round(estimatedTimeRemaining / 60000) // in minutes
      }
    };
  }
}