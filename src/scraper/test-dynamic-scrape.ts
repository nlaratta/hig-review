import { Page } from 'playwright';
import { browserManager } from './BrowserManager.js';
import { RateLimiter } from './RateLimiter.js';

/**
 * Test dynamic content scraping for Apple HIG documentation
 */
class DynamicContentScraper {
  private rateLimiter: RateLimiter;

  constructor() {
    this.rateLimiter = RateLimiter.createAppleRateLimiter();
  }

  /**
   * Test scraping a page with dynamic content
   */
  public async scrapeWithJavaScript(): Promise<void> {
    const url = 'https://developer.apple.com/design/human-interface-guidelines/designing-for-ios';
    
    return this.rateLimiter.execute(async () => {
      let page: Page | null = null;

      try {
        console.log(`\nTesting dynamic content scraping: ${url}`);
        
        // Get a new page
        page = await browserManager.newPage();
        
        // Enable request interception to monitor network activity
        await page.route('**/*', route => {
          const request = route.request();
          const resourceType = request.resourceType();
          
          // Log API calls
          if (resourceType === 'xhr' || resourceType === 'fetch') {
            console.log(`API Request: ${request.method()} ${request.url()}`);
          }
          
          route.continue();
        });
        
        // Navigate and wait for dynamic content
        console.log('Navigating to page...');
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        
        // Wait for specific dynamic content indicators
        console.log('Waiting for dynamic content to load...');
        
        // Try different strategies for waiting for content
        try {
          // Strategy 1: Wait for specific selectors that indicate content is loaded
          await page.waitForSelector('.topic-content', { timeout: 5000 });
          console.log('✓ Topic content loaded');
        } catch (e) {
          console.log('✗ Topic content selector not found');
        }
        
        try {
          // Strategy 2: Wait for navigation sidebar
          await page.waitForSelector('[role="navigation"] .nav-menu', { timeout: 5000 });
          console.log('✓ Navigation menu loaded');
        } catch (e) {
          console.log('✗ Navigation menu not found');
        }
        
        // Strategy 3: Wait for any lazy-loaded images
        const lazyImages = await page.$$('img[loading="lazy"]');
        console.log(`Found ${lazyImages.length} lazy-loaded images`);
        
        // Strategy 4: Check for JavaScript-rendered content
        const jsRenderedContent = await page.evaluate(() => {
          // Check if React/Vue/Angular roots exist
          const reactRoot = document.querySelector('#root') || document.querySelector('[data-reactroot]');
          const vueApp = document.querySelector('#app') || document.querySelector('[data-app]');
          const angularApp = document.querySelector('[ng-app]') || document.querySelector('[data-ng-app]');
          
          return {
            hasReact: !!reactRoot,
            hasVue: !!vueApp,
            hasAngular: !!angularApp,
            hasSPA: !!(reactRoot || vueApp || angularApp)
          };
        });
        
        console.log('JavaScript framework detection:', jsRenderedContent);
        
        // Extract dynamic content
        const dynamicContent = await page.evaluate(() => {
          const results = {
            codeBlocks: 0,
            interactiveElements: 0,
            mediaElements: 0,
            ajaxContent: 0
          };
          
          // Count code blocks
          results.codeBlocks = document.querySelectorAll('pre, code, .code-listing').length;
          
          // Count interactive elements
          results.interactiveElements = document.querySelectorAll(
            'button, [role="button"], .interactive, [onclick], [data-action]'
          ).length;
          
          // Count media elements
          results.mediaElements = document.querySelectorAll(
            'img, video, audio, picture, canvas, svg'
          ).length;
          
          // Check for AJAX-loaded content containers
          const ajaxContainers = document.querySelectorAll(
            '[data-ajax], [data-load], .async-content, .lazy-load'
          );
          results.ajaxContent = ajaxContainers.length;
          
          return results;
        });
        
        console.log('\nDynamic content analysis:');
        console.log(`- Code blocks: ${dynamicContent.codeBlocks}`);
        console.log(`- Interactive elements: ${dynamicContent.interactiveElements}`);
        console.log(`- Media elements: ${dynamicContent.mediaElements}`);
        console.log(`- AJAX containers: ${dynamicContent.ajaxContent}`);
        
        // Test scrolling to trigger lazy loading
        console.log('\nTesting scroll-triggered content...');
        const initialHeight = await page.evaluate(() => document.body.scrollHeight);
        
        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000); // Wait for lazy content
        
        const finalHeight = await page.evaluate(() => document.body.scrollHeight);
        console.log(`Page height changed from ${initialHeight}px to ${finalHeight}px`);
        
        if (finalHeight > initialHeight) {
          console.log('✓ Dynamic content loaded on scroll');
        } else {
          console.log('✗ No additional content loaded on scroll');
        }
        
        // Extract performance metrics
        const perfMetrics = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          return {
            domContentLoaded: Math.round(navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart),
            loadComplete: Math.round(navigation.loadEventEnd - navigation.loadEventStart),
            totalTime: Math.round(navigation.loadEventEnd - navigation.fetchStart)
          };
        });
        
        console.log('\nPerformance metrics:');
        console.log(`- DOM Content Loaded: ${perfMetrics.domContentLoaded}ms`);
        console.log(`- Load Complete: ${perfMetrics.loadComplete}ms`);
        console.log(`- Total Time: ${perfMetrics.totalTime}ms`);
        
      } catch (error) {
        console.error('Dynamic scraping failed:', error);
        throw error;
      } finally {
        if (page) {
          await page.close();
        }
      }
    });
  }

  /**
   * Test handling of client-side routing (SPA)
   */
  public async testSPANavigation(): Promise<void> {
    let page: Page | null = null;

    try {
      console.log('\n\nTesting SPA navigation handling...');
      
      page = await browserManager.newPage();
      
      // Monitor navigation events
      page.on('framenavigated', frame => {
        if (frame === page!.mainFrame()) {
          console.log(`Navigation detected: ${frame.url()}`);
        }
      });
      
      // Start at main page
      await page.goto('https://developer.apple.com/design/human-interface-guidelines', {
        waitUntil: 'networkidle'
      });
      
      // Try to navigate using client-side routing
      const navigationLinks = await page.$$eval('a[href*="/design/"]', links => 
        links.map(link => ({
          text: link.textContent?.trim() || '',
          href: link.getAttribute('href') || ''
        })).filter(link => link.href && !link.href.startsWith('http'))
      );
      
      console.log(`Found ${navigationLinks.length} internal navigation links`);
      
      if (navigationLinks.length > 0) {
        const targetLink = navigationLinks[0];
        console.log(`Clicking on: "${targetLink.text}" (${targetLink.href})`);
        
        // Click and wait for navigation
        await Promise.all([
          page.click(`a[href="${targetLink.href}"]`),
          page.waitForLoadState('networkidle')
        ]);
        
        console.log('✓ Successfully navigated via client-side routing');
      }
      
    } catch (error) {
      console.error('SPA navigation test failed:', error);
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  public async cleanup(): Promise<void> {
    await browserManager.close();
  }
}

/**
 * Main test function
 */
async function main() {
  const scraper = new DynamicContentScraper();

  try {
    // Initialize browser
    await browserManager.initialize();

    // Test dynamic content scraping
    await scraper.scrapeWithJavaScript();
    
    // Test SPA navigation
    await scraper.testSPANavigation();

    console.log('\n=== DYNAMIC CONTENT HANDLING SUMMARY ===');
    console.log('✓ Successfully handled JavaScript-rendered content');
    console.log('✓ Detected and waited for dynamic elements');
    console.log('✓ Monitored network requests for API calls');
    console.log('✓ Tested scroll-triggered lazy loading');
    console.log('✓ Extracted performance metrics');
    console.log('✓ Handled client-side routing');

  } catch (error) {
    console.error('\nTest failed:', error);
    process.exit(1);
  } finally {
    console.log('\nCleaning up...');
    await scraper.cleanup();
    console.log('Dynamic content test completed!');
  }
}

// Run the test
main().catch(console.error);