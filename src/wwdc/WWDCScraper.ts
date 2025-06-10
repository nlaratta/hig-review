/**
 * WWDC content scraper for Apple Developer videos
 */

import { Page } from 'playwright';
import { BrowserManager } from '../scraper/BrowserManager.js';
import { RateLimiter } from '../scraper/RateLimiter.js';
import { logger } from '../utils/logger.js';
import { WWDCSession, WWDCTranscript } from '../types/wwdc.js';

export class WWDCScraper {
  private rateLimiter: RateLimiter;
  private browserManager: BrowserManager;
  private readonly baseUrl = 'https://developer.apple.com';
  private readonly videoBaseUrl = 'https://devstreaming-cdn.apple.com/videos';

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager;
    // More conservative rate limiting for WWDC content
    this.rateLimiter = new RateLimiter(
      5,     // 5 requests per minute
      2,     // Max 2 concurrent requests
      2000   // 2 second minimum delay between requests
    );
  }

  /**
   * Scrape the list of sessions for a given year
   */
  async scrapeSessionList(year: number): Promise<WWDCSession[]> {
    const url = `${this.baseUrl}/videos/wwdc${year}`;
    logger.info(`Scraping WWDC ${year} session list`, { url });

    // Rate limiting is handled within execute method

    const page = await this.browserManager.getPage();
    const sessions: WWDCSession[] = [];

    try {
      await page.goto(url, { waitUntil: 'networkidle' });

      // Wait for session cards to load
      await page.waitForSelector('.video-card', { timeout: 10000 });

      // Extract session information
      const sessionElements = await page.$$('.video-card');
      
      for (const element of sessionElements) {
        try {
          const session = await this.extractSessionFromCard(element, year);
          if (session) {
            sessions.push(session);
          }
        } catch (error) {
          logger.error('Failed to extract session from card', error);
        }
      }

      logger.info(`Scraped ${sessions.length} sessions from WWDC ${year}`);
    } catch (error) {
      logger.error(`Failed to scrape WWDC ${year} session list`, error);
      throw error;
    } finally {
      await this.browserManager.releasePage(page);
    }

    return sessions;
  }

  /**
   * Scrape detailed information for a specific session
   */
  async scrapeSessionDetails(sessionId: string): Promise<WWDCSession> {
    const year = this.extractYearFromSessionId(sessionId);
    const sessionNumber = this.extractSessionNumber(sessionId);
    const url = `${this.baseUrl}/videos/play/wwdc${year}/${sessionNumber}`;
    
    logger.info(`Scraping session details`, { sessionId, url });

    // Rate limiting is handled within execute method

    const page = await this.browserManager.getPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });

      // Wait for video player and metadata to load
      await page.waitForSelector('.video-player', { timeout: 10000 });

      const session: WWDCSession = {
        id: sessionId,
        year,
        title: await this.extractText(page, 'h1.video-title') || '',
        description: await this.extractText(page, '.video-description') || '',
        duration: await this.extractDuration(page),
        speakers: await this.extractSpeakers(page),
        platforms: await this.extractPlatforms(page),
        topics: await this.extractTopics(page),
        videoUrl: url,
        transcriptUrl: await this.extractTranscriptUrl(page, sessionId),
        resourcesUrl: await this.extractResourcesUrl(page),
        sampleCodeUrl: await this.extractSampleCodeUrl(page),
        timestamp: new Date(),
        thumbnailUrl: await this.extractThumbnailUrl(page),
        tags: await this.extractTags(page),
      };

      logger.info(`Scraped session details`, { sessionId, title: session.title });
      return session;
    } catch (error) {
      logger.error(`Failed to scrape session details`, { sessionId, error });
      throw error;
    } finally {
      await this.browserManager.releasePage(page);
    }
  }

  /**
   * Download and parse transcript for a session
   */
  async scrapeTranscript(sessionId: string): Promise<WWDCTranscript | null> {
    const vttUrl = this.constructVTTUrl(sessionId);
    
    logger.info(`Downloading transcript`, { sessionId, vttUrl });

    // Rate limiting is handled within execute method

    try {
      const response = await fetch(vttUrl);
      
      if (!response.ok) {
        logger.warn(`Transcript not found`, { sessionId, status: response.status });
        return null;
      }

      const vttContent = await response.text();
      
      // We'll parse this in the TranscriptParser
      return {
        sessionId,
        segments: [], // Will be filled by TranscriptParser
        fullText: vttContent,
        language: 'en',
        format: 'vtt',
      };
    } catch (error) {
      logger.error(`Failed to download transcript`, { sessionId, error });
      return null;
    }
  }

  /**
   * Download sample code for a session
   */
  async downloadSampleCode(sessionId: string, sampleCodeUrl: string): Promise<string | null> {
    logger.info(`Downloading sample code`, { sessionId, sampleCodeUrl });

    // Rate limiting is handled within execute method

    try {
      const response = await fetch(sampleCodeUrl);
      
      if (!response.ok) {
        logger.warn(`Sample code not found`, { sessionId, status: response.status });
        return null;
      }

      // For now, just return the download URL
      // In a full implementation, we'd download and extract the zip file
      return sampleCodeUrl;
    } catch (error) {
      logger.error(`Failed to download sample code`, { sessionId, error });
      return null;
    }
  }

  /**
   * Extract session information from a video card element
   */
  private async extractSessionFromCard(element: any, year: number): Promise<WWDCSession | null> {
    try {
      const titleElement = await element.$('.video-title');
      const title = titleElement ? await titleElement.textContent() : '';
      
      const linkElement = await element.$('a');
      const href = linkElement ? await linkElement.getAttribute('href') : '';
      
      const sessionNumber = this.extractSessionNumberFromUrl(href);
      if (!sessionNumber) return null;

      const sessionId = `wwdc${year}-${sessionNumber}`;
      
      const descriptionElement = await element.$('.video-description');
      const description = descriptionElement ? await descriptionElement.textContent() : '';

      const durationElement = await element.$('.video-duration');
      const durationText = durationElement ? await durationElement.textContent() : '';
      const duration = this.parseDuration(durationText);

      return {
        id: sessionId,
        year,
        title: title.trim(),
        description: description.trim(),
        duration,
        speakers: [], // Will be filled when fetching details
        platforms: [], // Will be filled when fetching details
        topics: [], // Will be filled when fetching details
        videoUrl: `${this.baseUrl}${href}`,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Failed to extract session from card', error);
      return null;
    }
  }

  /**
   * Helper method to extract text content
   */
  private async extractText(page: Page, selector: string): Promise<string | null> {
    try {
      const element = await page.$(selector);
      if (!element) return null;
      const text = await element.textContent();
      return text?.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract video duration
   */
  private async extractDuration(page: Page): Promise<number> {
    try {
      const durationText = await this.extractText(page, '.video-duration');
      return this.parseDuration(durationText || '');
    } catch {
      return 0;
    }
  }

  /**
   * Extract speaker names
   */
  private async extractSpeakers(page: Page): Promise<string[]> {
    try {
      const speakerElements = await page.$$('.speaker-name');
      const speakers: string[] = [];
      
      for (const element of speakerElements) {
        const name = await element.textContent();
        if (name) speakers.push(name.trim());
      }
      
      return speakers;
    } catch {
      return [];
    }
  }

  /**
   * Extract related platforms
   */
  private async extractPlatforms(page: Page): Promise<string[]> {
    try {
      const platformElements = await page.$$('.platform-tag');
      const platforms: string[] = [];
      
      for (const element of platformElements) {
        const platform = await element.textContent();
        if (platform) {
          const normalized = this.normalizePlatform(platform.trim());
          if (normalized) platforms.push(normalized);
        }
      }
      
      return platforms as any[];
    } catch {
      return [];
    }
  }

  /**
   * Extract topics/tags
   */
  private async extractTopics(page: Page): Promise<string[]> {
    try {
      const topicElements = await page.$$('.topic-tag, .technology-tag');
      const topics: string[] = [];
      
      for (const element of topicElements) {
        const topic = await element.textContent();
        if (topic) topics.push(topic.trim());
      }
      
      return topics;
    } catch {
      return [];
    }
  }

  /**
   * Extract tags
   */
  private async extractTags(page: Page): Promise<string[]> {
    try {
      const tagElements = await page.$$('.tag, .label');
      const tags: string[] = [];
      
      for (const element of tagElements) {
        const tag = await element.textContent();
        if (tag) tags.push(tag.trim().toLowerCase());
      }
      
      return tags;
    } catch {
      return [];
    }
  }

  /**
   * Extract transcript URL
   */
  private async extractTranscriptUrl(page: Page, sessionId: string): Promise<string | undefined> {
    try {
      // Check if transcript is available
      const transcriptButton = await page.$('[aria-label*="transcript"], .transcript-button');
      if (!transcriptButton) return undefined;
      
      return this.constructVTTUrl(sessionId);
    } catch {
      return undefined;
    }
  }

  /**
   * Extract resources URL
   */
  private async extractResourcesUrl(page: Page): Promise<string | undefined> {
    try {
      const resourcesLink = await page.$('a[href*="resources"], .resources-link');
      if (!resourcesLink) return undefined;
      
      const href = await resourcesLink.getAttribute('href');
      return href ? `${this.baseUrl}${href}` : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract sample code URL
   */
  private async extractSampleCodeUrl(page: Page): Promise<string | undefined> {
    try {
      const codeLink = await page.$('a[href*="sample-code"], .sample-code-link');
      if (!codeLink) return undefined;
      
      const href = await codeLink.getAttribute('href');
      return href ? `${this.baseUrl}${href}` : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Extract thumbnail URL
   */
  private async extractThumbnailUrl(page: Page): Promise<string | undefined> {
    try {
      const thumbnail = await page.$('img.video-thumbnail, .poster-image');
      if (!thumbnail) return undefined;
      
      return await thumbnail.getAttribute('src') || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Construct VTT URL for a session
   */
  private constructVTTUrl(sessionId: string): string {
    const year = this.extractYearFromSessionId(sessionId);
    const sessionNumber = this.extractSessionNumber(sessionId);
    return `${this.videoBaseUrl}/wwdc/${year}/${sessionNumber}/subtitles/eng/${sessionNumber}.vtt`;
  }

  /**
   * Extract year from session ID
   */
  private extractYearFromSessionId(sessionId: string): number {
    const match = sessionId.match(/wwdc(\d{4})/);
    return match ? parseInt(match[1]) : new Date().getFullYear();
  }

  /**
   * Extract session number from session ID
   */
  private extractSessionNumber(sessionId: string): string {
    const parts = sessionId.split('-');
    return parts.length > 1 ? parts[1] : '';
  }

  /**
   * Extract session number from URL
   */
  private extractSessionNumberFromUrl(url: string): string | null {
    const match = url.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
  }

  /**
   * Parse duration string to seconds
   */
  private parseDuration(durationText: string): number {
    // Format: "23 min" or "1 hr 23 min"
    let totalSeconds = 0;
    
    const hourMatch = durationText.match(/(\d+)\s*hr/);
    if (hourMatch) {
      totalSeconds += parseInt(hourMatch[1]) * 3600;
    }
    
    const minMatch = durationText.match(/(\d+)\s*min/);
    if (minMatch) {
      totalSeconds += parseInt(minMatch[1]) * 60;
    }
    
    return totalSeconds;
  }

  /**
   * Normalize platform names
   */
  private normalizePlatform(platform: string): string | null {
    const normalized = platform.toLowerCase();
    
    if (normalized.includes('ios') || normalized.includes('iphone') || normalized.includes('ipad')) {
      return 'ios';
    } else if (normalized.includes('macos') || normalized.includes('mac')) {
      return 'macos';
    } else if (normalized.includes('watchos') || normalized.includes('watch')) {
      return 'watchos';
    } else if (normalized.includes('tvos') || normalized.includes('tv')) {
      return 'tvos';
    } else if (normalized.includes('visionos') || normalized.includes('vision')) {
      return 'visionos';
    }
    
    return null;
  }
}