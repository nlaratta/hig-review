import { chromium, Browser, BrowserContext, Page } from 'playwright';

/**
 * BrowserManager - Singleton pattern for managing Playwright browser instances
 * Handles browser lifecycle, context management, and resource cleanup
 */
export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private isInitialized: boolean = false;
  private isShuttingDown: boolean = false;
  private activeOperations: Set<string> = new Set();

  private constructor() {}

  /**
   * Get the singleton instance of BrowserManager
   */
  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /**
   * Initialize the browser instance
   */
  async initialize(): Promise<void> {
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
  async getContext(contextId: string = 'default'): Promise<BrowserContext> {
    if (this.isShuttingDown) {
      throw new Error('BrowserManager is shutting down');
    }

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
   * Register an active operation to prevent shutdown
   */
  registerOperation(operationId: string): void {
    this.activeOperations.add(operationId);
  }

  /**
   * Unregister an active operation
   */
  unregisterOperation(operationId: string): void {
    this.activeOperations.delete(operationId);
  }

  /**
   * Check if there are active operations
   */
  hasActiveOperations(): boolean {
    return this.activeOperations.size > 0;
  }

  /**
   * Create a new page in the specified context
   */
  async newPage(contextId: string = 'default'): Promise<Page> {
    if (this.isShuttingDown) {
      throw new Error('BrowserManager is shutting down');
    }

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
   * Close a specific context safely
   */
  async closeContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (context) {
      try {
        await context.close();
        this.contexts.delete(contextId);
        console.log(`Context '${contextId}' closed`);
      } catch (error) {
        console.error(`Error closing context '${contextId}':`, error);
        // Remove from map even if close failed
        this.contexts.delete(contextId);
      }
    }
  }

  /**
   * Close all contexts and the browser safely
   */
  async close(): Promise<void> {
    if (this.isShuttingDown) {
      return; // Already shutting down
    }

    this.isShuttingDown = true;

    // Wait for active operations to complete
    if (this.hasActiveOperations()) {
      console.log(`Waiting for ${this.activeOperations.size} active operations to complete...`);
      const maxWait = 15000; // 15 seconds max wait
      const startTime = Date.now();
      
      while (this.hasActiveOperations() && (Date.now() - startTime) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      if (this.hasActiveOperations()) {
        console.warn(`Force closing with ${this.activeOperations.size} operations still active:`, Array.from(this.activeOperations));
      }
    }

    try {
      // Close all contexts sequentially to avoid race conditions
      const contextEntries = Array.from(this.contexts.entries());
      for (const [contextId, context] of contextEntries) {
        try {
          await context.close();
          console.log(`Context '${contextId}' closed`);
        } catch (error) {
          console.error(`Error closing context '${contextId}':`, error);
        }
      }
      this.contexts.clear();

      // Close browser
      if (this.browser) {
        try {
          await this.browser.close();
          console.log('Browser closed');
        } catch (error) {
          console.error('Error closing browser:', error);
        }
        this.browser = null;
      }
    } finally {
      this.isInitialized = false;
      this.isShuttingDown = false;
    }
  }

  /**
   * Check if browser is initialized and ready
   */
  isReady(): boolean {
    return this.isInitialized && this.browser !== null && !this.isShuttingDown;
  }

  /**
   * Get browser instance (for advanced usage)
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  /**
   * Get number of active contexts
   */
  getActiveContextCount(): number {
    return this.contexts.size;
  }
}

// Export singleton instance
export const browserManager = BrowserManager.getInstance();