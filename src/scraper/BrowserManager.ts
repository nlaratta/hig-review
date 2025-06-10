import { chromium, Browser, BrowserContext, Page } from 'playwright';

/**
 * BrowserManager - Singleton pattern for managing Playwright browser instances
 * Handles browser lifecycle, context management, and resource cleanup
 */
export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private isInitialized = false;

  private constructor() {}

  /**
   * Get the singleton instance of BrowserManager
   */
  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /**
   * Initialize the browser instance
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      
      this.isInitialized = true;
      console.log('Browser initialized successfully');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  /**
   * Get or create a browser context
   */
  public async getContext(contextId: string = 'default'): Promise<BrowserContext> {
    if (!this.isInitialized || !this.browser) {
      await this.initialize();
    }

    if (!this.contexts.has(contextId)) {
      const context = await this.browser!.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      this.contexts.set(contextId, context);
    }

    return this.contexts.get(contextId)!;
  }

  /**
   * Create a new page in the specified context
   */
  public async newPage(contextId: string = 'default'): Promise<Page> {
    const context = await this.getContext(contextId);
    const page = await context.newPage();

    // Set additional page-level configurations
    await page.setExtraHTTPHeaders({
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none'
    });

    // Handle console messages for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('Page console error:', msg.text());
      }
    });

    // Handle page crashes
    page.on('crash', () => {
      console.error('Page crashed!');
    });

    return page;
  }

  /**
   * Close a specific context
   */
  public async closeContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (context) {
      await context.close();
      this.contexts.delete(contextId);
      console.log(`Context '${contextId}' closed`);
    }
  }

  /**
   * Close all contexts and the browser
   */
  public async close(): Promise<void> {
    // Close all contexts
    for (const [contextId, context] of this.contexts) {
      await context.close();
      console.log(`Context '${contextId}' closed`);
    }
    this.contexts.clear();

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
      console.log('Browser closed');
    }
  }

  /**
   * Check if browser is initialized
   */
  public isReady(): boolean {
    return this.isInitialized && this.browser !== null;
  }

  /**
   * Get browser instance (for advanced usage)
   */
  public getBrowser(): Browser | null {
    return this.browser;
  }
}

// Export singleton instance
export const browserManager = BrowserManager.getInstance();