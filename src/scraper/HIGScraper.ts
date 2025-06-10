import { Page } from 'playwright';
import { load } from 'cheerio';
import { browserManager } from './BrowserManager.js';
import { RateLimiter, ExponentialBackoff } from './RateLimiter.js';
import { logger } from '../utils/logger.js';
import NodeCache from 'node-cache';

interface ScrapedContent {
  title: string;
  content: string;
  summary?: string;
  codeExamples?: string[];
  platformSpecific?: Record<string, string>;
  lastUpdated: Date;
  url: string;
}

export class HIGScraper {
  private rateLimiter: RateLimiter;
  private backoff: ExponentialBackoff;
  private cache: NodeCache;
  
  constructor() {
    // Use Apple-specific rate limiter with conservative settings
    this.rateLimiter = RateLimiter.createAppleRateLimiter();
    this.backoff = new ExponentialBackoff(2000, 30000, 2);
    this.cache = new NodeCache({ stdTTL: 3600 * 24 }); // 24 hour cache for scraped content
  }

  /**
   * Scrape a single HIG page
   */
  public async scrapePage(url: string): Promise<ScrapedContent> {
    const cacheKey = `scraped-${url}`;
    const cached = this.cache.get<ScrapedContent>(cacheKey);
    if (cached) {
      logger.debug('Returning cached scraped content', { url });
      return cached;
    }

    logger.info('Scraping HIG page', { url });

    return await this.rateLimiter.execute(async () => {
      return await this.backoff.execute(
        async () => await this.performScrape(url),
        3,
        (error) => {
          // Retry on network errors, not on 404s
          if (error.message?.includes('404')) return false;
          return true;
        }
      );
    });
  }

  /**
   * Perform the actual scraping
   */
  private async performScrape(url: string): Promise<ScrapedContent> {
    let page: Page | null = null;
    
    try {
      // Create a new page for scraping
      page = await browserManager.newPage('scraper');
      
      // Navigate to the page
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      if (!response || response.status() === 404) {
        throw new Error(`Page not found: ${url}`);
      }

      // Wait for content to load
      await page.waitForSelector('main', { timeout: 10000 });

      // Get the page content
      const html = await page.content();
      const $ = load(html);

      // Extract content
      const content: ScrapedContent = {
        title: this.extractTitle($),
        content: this.extractMainContent($),
        summary: this.extractSummary($),
        codeExamples: this.extractCodeExamples($),
        platformSpecific: this.extractPlatformSpecific($),
        lastUpdated: new Date(),
        url
      };

      // Cache the result
      this.cache.set(`scraped-${url}`, content);

      logger.info('Successfully scraped page', { url, title: content.title });
      return content;

    } catch (error) {
      logger.error('Failed to scrape page', { url, error });
      throw error;
    } finally {
      // Clean up
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Extract the page title
   */
  private extractTitle($: ReturnType<typeof load>): string {
    // Try multiple selectors for title
    const selectors = [
      'h1',
      '.page-title',
      'main h1',
      'article h1',
      'title'
    ];

    for (const selector of selectors) {
      const title = $(selector).first().text().trim();
      if (title) {
        return title.replace(/\s+/g, ' ');
      }
    }

    return 'Untitled Page';
  }

  /**
   * Extract the main content
   */
  private extractMainContent($: ReturnType<typeof load>): string {
    const contentParts: string[] = [];

    // Remove script and style elements
    $('script, style, noscript').remove();

    // Try to find the main content area
    const mainSelectors = [
      'main',
      '[role="main"]',
      '.main-content',
      'article',
      '.content'
    ];

    let mainElement = null;
    for (const selector of mainSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        mainElement = element;
        break;
      }
    }

    if (!mainElement) {
      mainElement = $('body');
    }

    // Extract text content from various elements
    mainElement.find('p, h1, h2, h3, h4, h5, h6, li, td, th').each((_, elem) => {
      const text = $(elem).text().trim();
      if (text && text.length > 10) {
        contentParts.push(text);
      }
    });

    // Extract alt text from images (often contains useful information)
    mainElement.find('img[alt]').each((_, elem) => {
      const altText = $(elem).attr('alt');
      if (altText && altText.trim()) {
        contentParts.push(`[Image: ${altText.trim()}]`);
      }
    });

    return contentParts.join('\n\n');
  }

  /**
   * Extract a summary or description
   */
  private extractSummary($: ReturnType<typeof load>): string | undefined {
    // Try to find summary/description meta tags or intro paragraphs
    const metaDescription = $('meta[name="description"]').attr('content');
    if (metaDescription) {
      return metaDescription.trim();
    }

    // Look for intro paragraph
    const introSelectors = [
      '.intro',
      '.lead',
      '.description',
      'main > p:first-of-type',
      'article > p:first-of-type'
    ];

    for (const selector of introSelectors) {
      const intro = $(selector).first().text().trim();
      if (intro && intro.length > 50) {
        return intro.substring(0, 300) + (intro.length > 300 ? '...' : '');
      }
    }

    return undefined;
  }

  /**
   * Extract code examples
   */
  private extractCodeExamples($: ReturnType<typeof load>): string[] {
    const codeExamples: string[] = [];

    // Find code blocks
    $('pre code, .code-example, .code-snippet').each((_, elem) => {
      const code = $(elem).text().trim();
      if (code) {
        codeExamples.push(code);
      }
    });

    return codeExamples;
  }

  /**
   * Extract platform-specific content
   */
  private extractPlatformSpecific($: ReturnType<typeof load>): Record<string, string> {
    const platformContent: Record<string, string> = {};
    const platforms = ['ios', 'macos', 'watchos', 'tvos', 'visionos'];

    // Look for platform-specific sections
    for (const platform of platforms) {
      const selectors = [
        `[data-platform="${platform}"]`,
        `.${platform}-content`,
        `#${platform}`,
        `[id*="${platform}"]`
      ];

      for (const selector of selectors) {
        const element = $(selector);
        if (element.length > 0) {
          platformContent[platform] = element.text().trim();
          break;
        }
      }
    }

    return platformContent;
  }

  /**
   * Scrape multiple pages with rate limiting
   */
  public async scrapeMultiple(urls: string[]): Promise<Map<string, ScrapedContent>> {
    const results = new Map<string, ScrapedContent>();
    
    logger.info(`Starting batch scrape of ${urls.length} pages`);

    for (const url of urls) {
      try {
        const content = await this.scrapePage(url);
        results.set(url, content);
      } catch (error) {
        logger.error(`Failed to scrape ${url}`, error);
        // Continue with other URLs even if one fails
      }
    }

    logger.info(`Completed batch scrape. Success: ${results.size}/${urls.length}`);
    return results;
  }

  /**
   * Get scraper statistics
   */
  public getStats() {
    return {
      rateLimiterStats: this.rateLimiter.getStats(),
      cacheStats: {
        keys: this.cache.keys().length,
        hits: this.cache.getStats().hits,
        misses: this.cache.getStats().misses
      }
    };
  }

  /**
   * Clear the scraper cache
   */
  public clearCache(): void {
    this.cache.flushAll();
    logger.info('Scraper cache cleared');
  }
}