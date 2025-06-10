import { Page } from 'playwright';
import { browserManager } from './BrowserManager.js';
import { logger } from '../utils/logger.js';
import { RateLimiter } from './RateLimiter.js';

export interface EnhancedScrapedContent {
  title: string;
  html: string;          // Full HTML content (NEW)
  textContent: string;   // Text-only fallback
  summary?: string;
  codeExamples?: string[];
  platformSpecific?: Record<string, any>;
  lastUpdated: Date;
  url: string;
}

/**
 * Enhanced HIGScraper that preserves full HTML structure for ContentParser
 */
export class EnhancedHIGScraper {
  private rateLimiter: RateLimiter;

  constructor() {
    this.rateLimiter = new RateLimiter(30, 2, 1000); // 30 requests per minute, 2 concurrent, 1s delay
  }

  /**
   * Scrape a page and return both HTML structure and text content
   */
  async scrapePage(url: string): Promise<EnhancedScrapedContent> {
    // Apply rate limiting
    return this.rateLimiter.execute(async () => {
      logger.info('Scraping HIG page with HTML preservation', { url });
      return this.performScrape(url);
    });
  }

  /**
   * Enhanced scraping that preserves HTML structure
   */
  private async performScrape(url: string): Promise<EnhancedScrapedContent> {
    let page: Page | null = null;
    
    try {
      // Create a new page for scraping
      page = await browserManager.newPage('enhanced-scraper');
      
      // Navigate to the page
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      if (!response || response.status() === 404) {
        throw new Error(`Page not found: ${url}`);
      }

      // Wait for Apple HIG content to load and render
      try {
        await page.waitForFunction(() => {
          const content = document.querySelector('.content, .doc-content, .design-view');
          return content && content.textContent && content.textContent.length > 1000;
        }, { timeout: 15000 });
        
        logger.debug('Content loaded successfully', { url });
      } catch (error) {
        logger.warn('Timeout waiting for content, proceeding anyway', { 
          url, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
      
      // Additional wait for any remaining dynamic content
      await page.waitForTimeout(3000);

      // Extract title
      const title = await page.evaluate(() => {
        const selectors = ['h1', '.title', 'main h1', '.doc-title', 'title'];
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent?.trim()) {
            return el.textContent.trim();
          }
        }
        return document.title || 'Untitled Page';
      });

      // Extract the main content HTML (preserve structure!)
      const mainContentHtml = await page.evaluate(() => {
        const selectors = [
          '.content',
          '.doc-content', 
          '.design-view',
          'main',
          '[role="main"]',
          '.main-content'
        ];
        
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent && el.textContent.length > 1000) {
            // Clean up while preserving structure
            const clone = el.cloneNode(true) as Element;
            
            // Remove scripts, styles, and navigation from the clone
            clone.querySelectorAll('script, style, nav, [role="navigation"], footer, [role="contentinfo"]').forEach(el => el.remove());
            
            return clone.innerHTML;
          }
        }
        
        // Fallback to body content
        const body = document.body.cloneNode(true) as Element;
        body.querySelectorAll('script, style, nav, [role="navigation"], footer, [role="contentinfo"]').forEach(el => el.remove());
        return body.innerHTML;
      });

      // Extract text content as fallback
      const textContent = await page.evaluate(() => {
        const selectors = [
          '.content',
          '.doc-content', 
          '.design-view',
          'main',
          '[role="main"]'
        ];
        
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent && el.textContent.length > 1000) {
            return el.textContent.trim();
          }
        }
        
        return document.body.textContent?.trim() || '';
      });

      // Extract summary (first substantial paragraph)
      const summary = await page.evaluate(() => {
        const paragraphs = document.querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.textContent?.trim();
          if (text && text.length > 50 && text.length < 500) {
            return text;
          }
        }
        return undefined;
      });

      // Extract code examples
      const codeExamples = await page.evaluate(() => {
        const codeBlocks = document.querySelectorAll('code, pre, .code, .highlight');
        return Array.from(codeBlocks)
          .map(block => block.textContent?.trim())
          .filter((code): code is string => code != null && code.length > 10)
          .slice(0, 10); // Limit to 10 examples
      });

      const content: EnhancedScrapedContent = {
        title,
        html: mainContentHtml,
        textContent,
        summary,
        codeExamples,
        lastUpdated: new Date(),
        url
      };

      logger.info('Successfully scraped page with HTML preservation', { 
        url, 
        title, 
        htmlLength: mainContentHtml.length,
        textLength: textContent.length 
      });
      
      return content;

    } catch (error) {
      logger.error('Failed to scrape page', { url, error });
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Get scraping statistics
   */
  getStats() {
    return this.rateLimiter.getStats();
  }
}