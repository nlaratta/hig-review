import Fuse, { IFuseOptions, FuseResult } from 'fuse.js';
import { SearchHIGParams } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { HIGScraper } from '../scraper/HIGScraper.js';
import NodeCache from 'node-cache';
import urlMappings from '../scraper/url-mappings.json' with { type: 'json' };

interface SearchDocument {
  id: string;
  title: string;
  content: string;
  url: string;
  platform?: string;
  category: string;
  subcategory?: string;
  summary?: string;
  keywords: string[];
  lastUpdated: Date;
}

interface SearchResult {
  item: SearchDocument;
  score: number;
  matches?: readonly any[];
  highlights?: string[];
}

export class HIGSearchEngine {
  private index: Fuse<SearchDocument>;
  private documents: Map<string, SearchDocument> = new Map();
  private cache: NodeCache;
  private scraper: HIGScraper;
  private isIndexed: boolean = false;
  
  // Fuse.js configuration for fuzzy search
  private fuseOptions: IFuseOptions<SearchDocument> = {
    keys: [
      { name: 'title', weight: 0.3 },
      { name: 'content', weight: 0.4 },
      { name: 'keywords', weight: 0.2 },
      { name: 'summary', weight: 0.1 }
    ],
    includeScore: true,
    includeMatches: true,
    threshold: 0.6, // Increased fuzzy matching threshold for better typo tolerance
    location: 0,
    distance: 100,
    minMatchCharLength: 2,
    shouldSort: true,
    findAllMatches: true,
    ignoreLocation: false,
    useExtendedSearch: false,
    ignoreFieldNorm: false,
    fieldNormWeight: 1
  };

  constructor() {
    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache
    this.scraper = new HIGScraper();
    this.index = new Fuse([], this.fuseOptions);
  }

  /**
   * Initialize the search index with pre-defined sections
   * This creates a basic index that can be searched immediately
   */
  public async initialize(): Promise<void> {
    if (this.isIndexed) return;

    logger.info('Initializing HIG search index...');

    try {
      // Build initial index from URL mappings
      await this.buildInitialIndex();
      
      // Update the Fuse.js index
      this.index = new Fuse(Array.from(this.documents.values()), this.fuseOptions);
      
      this.isIndexed = true;
      logger.info(`Search index initialized with ${this.documents.size} documents`);
    } catch (error) {
      logger.error('Failed to initialize search index', error);
      throw error;
    }
  }

  /**
   * Build initial index from URL mappings
   */
  private async buildInitialIndex(): Promise<void> {
    const baseUrl = urlMappings.base_url;

    // Index platforms
    for (const [platformId, platform] of Object.entries(urlMappings.platforms)) {
      const doc: SearchDocument = {
        id: `platform-${platformId}`,
        title: `Designing for ${platformId.toUpperCase()}`,
        content: platform.description,
        url: `${baseUrl}${platform.main}`,
        platform: platformId,
        category: 'platforms',
        keywords: [platformId, 'platform', 'design', platform.description.toLowerCase()],
        lastUpdated: new Date()
      };
      this.documents.set(doc.id, doc);
    }

    // Index sections
    for (const [sectionId, section] of Object.entries(urlMappings.sections)) {
      // Main section document
      const mainDoc: SearchDocument = {
        id: `section-${sectionId}`,
        title: sectionId.charAt(0).toUpperCase() + sectionId.slice(1),
        content: section.description,
        url: `${baseUrl}${section.main}`,
        category: sectionId,
        keywords: [sectionId, section.description.toLowerCase()],
        lastUpdated: new Date()
      };
      this.documents.set(mainDoc.id, mainDoc);

      // Index subcategories if available
      if ('subcategories' in section && Array.isArray(section.subcategories)) {
        for (const subcategory of section.subcategories) {
          const subcatName = subcategory.split('/').pop() || '';
          const subcatDoc: SearchDocument = {
            id: `${sectionId}-${subcatName}`,
            title: this.titleCase(subcatName.replace(/-/g, ' ')),
            content: `${section.description} - ${this.titleCase(subcatName.replace(/-/g, ' '))}`,
            url: `${baseUrl}${subcategory}`,
            category: sectionId,
            subcategory: subcatName,
            keywords: [sectionId, subcatName, subcatName.replace(/-/g, ' ')],
            lastUpdated: new Date()
          };
          this.documents.set(subcatDoc.id, subcatDoc);
        }
      }

      // Index components
      if (sectionId === 'components' && 'categories' in section) {
        for (const [categoryId, category] of Object.entries(section.categories)) {
          if (typeof category === 'object' && 'items' in category) {
            for (const item of category.items) {
              const itemName = item.split('/').pop() || '';
              const componentDoc: SearchDocument = {
                id: `component-${itemName}`,
                title: this.titleCase(itemName.replace(/-/g, ' ')),
                content: `UI component for ${this.titleCase(itemName.replace(/-/g, ' '))}`,
                url: `${baseUrl}/components${item}`,
                category: 'components',
                subcategory: categoryId,
                keywords: ['component', 'ui', itemName, itemName.replace(/-/g, ' '), categoryId],
                lastUpdated: new Date()
              };
              this.documents.set(componentDoc.id, componentDoc);
            }
          }
        }
      }

      // Index technologies
      if (sectionId === 'technologies' && 'items' in section) {
        for (const item of section.items) {
          const techName = item.split('/').pop() || '';
          const techDoc: SearchDocument = {
            id: `technology-${techName}`,
            title: this.titleCase(techName.replace(/-/g, ' ')),
            content: `Technology and framework: ${this.titleCase(techName.replace(/-/g, ' '))}`,
            url: `${baseUrl}/technologies${item}`,
            category: 'technologies',
            keywords: ['technology', 'framework', techName, techName.replace(/-/g, ' ')],
            lastUpdated: new Date()
          };
          this.documents.set(techDoc.id, techDoc);
        }
      }
    }
  }

  /**
   * Search the HIG documentation
   */
  public async search(params: SearchHIGParams): Promise<SearchResult[]> {
    // Ensure index is initialized
    if (!this.isIndexed) {
      await this.initialize();
    }

    const cacheKey = `search-${params.query}-${params.platform || 'all'}-${params.category || 'all'}`;
    const cached = this.cache.get<SearchResult[]>(cacheKey);
    if (cached) {
      logger.debug('Returning cached search results', { query: params.query });
      return cached;
    }

    logger.info('Searching HIG', { query: params.query, platform: params.platform, category: params.category });

    // Pre-filter documents if platform or category specified
    let searchableDocuments = Array.from(this.documents.values());
    
    if (params.platform) {
      searchableDocuments = searchableDocuments.filter(doc => 
        doc.platform === params.platform || !doc.platform
      );
    }

    if (params.category) {
      searchableDocuments = searchableDocuments.filter(doc => 
        doc.category === params.category || 
        doc.subcategory === params.category
      );
    }

    // Create a new Fuse instance with filtered documents
    const filteredIndex = new Fuse(searchableDocuments, this.fuseOptions);

    // Perform the search
    const results = filteredIndex.search(params.query);

    // Format results
    const formattedResults: SearchResult[] = results.map(result => ({
      item: result.item,
      score: result.score || 0,
      matches: result.matches,
      highlights: this.generateHighlights(result)
    }));

    // Cache the results
    this.cache.set(cacheKey, formattedResults);

    logger.info(`Found ${formattedResults.length} results for query: ${params.query}`);
    return formattedResults;
  }

  /**
   * Generate text highlights for search results
   */
  private generateHighlights(result: FuseResult<SearchDocument>): string[] {
    const highlights: string[] = [];
    
    if (result.matches) {
      for (const match of result.matches) {
        if (match.value && match.indices.length > 0) {
          // Get the matched text with some context
          const fullText = match.value;
          const firstIndex = match.indices[0];
          const start = Math.max(0, firstIndex[0] - 30);
          const end = Math.min(fullText.length, firstIndex[1] + 30);
          
          let highlight = fullText.substring(start, end);
          if (start > 0) highlight = '...' + highlight;
          if (end < fullText.length) highlight = highlight + '...';
          
          highlights.push(highlight);
        }
      }
    }

    return highlights;
  }

  /**
   * Update the index with scraped content
   */
  public async updateDocument(id: string, content: string, summary?: string): Promise<void> {
    const doc = this.documents.get(id);
    if (doc) {
      doc.content = content;
      if (summary) {
        doc.summary = summary;
      }
      doc.lastUpdated = new Date();
      
      // Rebuild the index
      this.index = new Fuse(Array.from(this.documents.values()), this.fuseOptions);
      logger.debug(`Updated document: ${id}`);
    }
  }

  /**
   * Get statistics about the search index
   */
  public getStats() {
    return {
      totalDocuments: this.documents.size,
      isIndexed: this.isIndexed,
      categories: this.getCategoryStats()
    };
  }

  private getCategoryStats() {
    const stats: Record<string, number> = {};
    for (const doc of this.documents.values()) {
      stats[doc.category] = (stats[doc.category] || 0) + 1;
    }
    return stats;
  }

  /**
   * Helper to convert kebab-case to Title Case
   */
  private titleCase(str: string): string {
    return str.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Format search results for display
   */
  public formatResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No results found for your search query.';
    }

    let output = `Found ${results.length} results:\n\n`;

    for (const [index, result] of results.entries()) {
      const relevance = Math.round((1 - (result.score || 0)) * 100);
      
      output += `${index + 1}. **${result.item.title}**\n`;
      output += `   URL: ${result.item.url}\n`;
      output += `   Category: ${result.item.category}`;
      if (result.item.platform) {
        output += ` | Platform: ${result.item.platform}`;
      }
      output += `\n   Relevance: ${relevance}%\n`;
      
      if (result.item.summary) {
        output += `   Summary: ${result.item.summary}\n`;
      } else if (result.highlights && result.highlights.length > 0) {
        output += `   Preview: ${result.highlights[0]}\n`;
      }
      
      output += '\n';
    }

    return output;
  }
}

// Export singleton instance
export const higSearchEngine = new HIGSearchEngine();