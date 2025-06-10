import { Page } from 'playwright';
import { GetGuidelineParams, HIGGuideline, CodeSnippet, Example } from '../types/index.js';
import { GuidelineParser, ParsedGuideline } from '../parser/GuidelineParser.js';
import { browserManager } from '../scraper/BrowserManager.js';
import { logger } from '../utils/logger.js';
import NodeCache from 'node-cache';

/**
 * GetGuideline - Fetches and parses specific Apple HIG guideline content
 */
export class GetGuideline {
  private cache: any;
  private baseUrl = 'https://developer.apple.com/design/human-interface-guidelines';

  constructor(cacheTTL: number = 3600) {
    const NodeCacheConstructor = (NodeCache as any).default || NodeCache;
    this.cache = new NodeCacheConstructor({ 
      stdTTL: cacheTTL,
      checkperiod: 600,
      useClones: false
    });
  }

  /**
   * Execute the getGuideline tool
   */
  public async execute(params: GetGuidelineParams): Promise<HIGGuideline> {
    const { guidelineId, includeExamples = true, includeCode = true } = params;
    
    logger.info('Fetching guideline', { guidelineId, includeExamples, includeCode });

    // Check cache first
    const cacheKey = this.getCacheKey(guidelineId, includeExamples, includeCode);
    const cached = this.cache.get(cacheKey) as HIGGuideline | undefined;
    if (cached) {
      logger.debug('Returning cached guideline', { guidelineId });
      return cached;
    }

    try {
      // Construct the URL
      const url = this.constructUrl(guidelineId);
      logger.debug('Fetching URL', { url });

      // Fetch the page content
      const html = await this.fetchPageContent(url);

      // Parse the content
      const parser = new GuidelineParser(html, url);
      const parsed = parser.parse();

      // Transform to HIGGuideline format
      const guideline = this.transformToGuideline(parsed, guidelineId, includeExamples, includeCode);

      // Cache the result
      this.cache.set(cacheKey, guideline);

      return guideline;
    } catch (error) {
      logger.error('Failed to fetch guideline', { guidelineId, error });
      throw new Error(`Failed to fetch guideline ${guidelineId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Construct the full URL from a guideline ID
   */
  private constructUrl(guidelineId: string): string {
    // Handle different input formats
    if (guidelineId.startsWith('http')) {
      return guidelineId;
    }

    if (guidelineId.startsWith('/')) {
      return `${this.baseUrl}${guidelineId}`;
    }

    // Assume it's a relative path
    return `${this.baseUrl}/${guidelineId}`;
  }

  /**
   * Fetch page content using Playwright
   */
  private async fetchPageContent(url: string): Promise<string> {
    let page: Page | null = null;

    try {
      // Initialize browser if needed
      if (!browserManager.isReady()) {
        await browserManager.initialize();
      }

      page = await browserManager.newPage('guideline-fetcher');

      // Navigate to the page
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for main content to be loaded
      await page.waitForSelector('main, article, [role="main"]', {
        timeout: 10000
      });

      // Additional wait for dynamic content
      await page.waitForTimeout(2000);

      // Get the page content
      const html = await page.content();

      return html;
    } catch (error) {
      logger.error('Failed to fetch page content', { url, error });
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Transform parsed guideline to HIGGuideline format
   */
  private transformToGuideline(
    parsed: ParsedGuideline,
    guidelineId: string,
    includeExamples: boolean,
    includeCode: boolean
  ): HIGGuideline {
    // Extract category from URL
    const category = this.extractCategory(parsed.url);

    // Build content sections
    let content = `# ${parsed.title}\n\n`;
    
    if (parsed.summary) {
      content += `## Overview\n${parsed.summary}\n\n`;
    }

    // Add main content sections
    parsed.mainContent.forEach(section => {
      content += `## ${section.title}\n${section.content}\n\n`;
    });

    // Add best practices
    if (parsed.bestPractices.length > 0) {
      content += `## Best Practices\n`;
      parsed.bestPractices.forEach(practice => {
        content += `- ${practice}\n`;
      });
      content += '\n';
    }

    // Add design specifications
    if (parsed.designSpecs.length > 0) {
      content += `## Design Specifications\n`;
      parsed.designSpecs.forEach(spec => {
        content += `- **${spec.property}**: ${spec.value}`;
        if (spec.notes) {
          content += ` (${spec.notes})`;
        }
        content += '\n';
      });
      content += '\n';
    }

    // Add Do's and Don'ts
    if (parsed.dosAndDonts.dos.length > 0 || parsed.dosAndDonts.donts.length > 0) {
      content += `## Guidelines\n`;
      
      if (parsed.dosAndDonts.dos.length > 0) {
        content += `### Do\n`;
        parsed.dosAndDonts.dos.forEach(item => {
          content += `- ✓ ${item}\n`;
        });
        content += '\n';
      }

      if (parsed.dosAndDonts.donts.length > 0) {
        content += `### Don't\n`;
        parsed.dosAndDonts.donts.forEach(item => {
          content += `- ✗ ${item}\n`;
        });
        content += '\n';
      }
    }

    // Add related links
    if (parsed.relatedLinks.length > 0) {
      content += `## Related Guidelines\n`;
      parsed.relatedLinks.forEach(link => {
        content += `- [${link.title}](${link.url}) (${link.type})\n`;
      });
      content += '\n';
    }

    // Prepare examples if requested
    const examples: Example[] = [];
    if (includeExamples && parsed.designSpecs.length > 0) {
      examples.push({
        title: 'Design Specifications',
        description: 'Key design tokens and specifications for this component',
        code: parsed.designSpecs.map(spec => `${spec.property}: ${spec.value}`).join('\n')
      });
    }

    // Prepare code snippets if requested
    const codeSnippets: CodeSnippet[] = [];
    if (includeCode && parsed.codeExamples.length > 0) {
      parsed.codeExamples.forEach(example => {
        codeSnippets.push({
          language: example.language as 'swift' | 'objc' | 'swiftui',
          code: example.code,
          description: example.description
        });
      });
    }

    // Extract related guideline IDs
    const relatedGuidelines = parsed.relatedLinks
      .filter(link => link.type !== 'documentation' && link.type !== 'other')
      .map(link => this.extractGuidelineId(link.url));

    return {
      id: guidelineId,
      title: parsed.title,
      content,
      platform: parsed.platform,
      category,
      lastUpdated: parsed.lastUpdated,
      examples: includeExamples ? examples : undefined,
      codeSnippets: includeCode ? codeSnippets : undefined,
      relatedGuidelines: relatedGuidelines.length > 0 ? relatedGuidelines : undefined
    };
  }

  /**
   * Extract category from URL
   */
  private extractCategory(url: string): string {
    const match = url.match(/\/(foundations?|components?|patterns?|technologies?|inputs?)\//i);
    if (match) {
      return match[1].replace(/s$/, ''); // Remove plural 's'
    }
    return 'general';
  }

  /**
   * Extract guideline ID from URL
   */
  private extractGuidelineId(url: string): string {
    // Remove base URL and any query parameters
    const cleanUrl = url.replace(this.baseUrl, '').split('?')[0].split('#')[0];
    return cleanUrl.replace(/^\/+|\/+$/g, ''); // Trim slashes
  }

  /**
   * Generate cache key
   */
  private getCacheKey(guidelineId: string, includeExamples: boolean, includeCode: boolean): string {
    return `guideline:${guidelineId}:ex${includeExamples}:co${includeCode}`;
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.cache.flushAll();
    logger.info('Guideline cache cleared');
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
}