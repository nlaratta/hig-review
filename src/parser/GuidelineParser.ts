import * as cheerio from 'cheerio';
import { ApplePlatform, CodeSnippet, Example } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * GuidelineParser - Extracts structured content from Apple HIG pages
 */
export class GuidelineParser {
  private $: cheerio.Root;
  private url: string;

  constructor(html: string, url: string) {
    this.$ = cheerio.load(html);
    this.url = url;
  }

  /**
   * Parse the guideline content and extract all relevant information
   */
  public parse(): ParsedGuideline {
    try {
      const title = this.extractTitle();
      const platform = this.extractPlatform();
      const summary = this.extractSummary();
      const mainContent = this.extractMainContent();
      const bestPractices = this.extractBestPractices();
      const codeExamples = this.extractCodeExamples();
      const designSpecs = this.extractDesignSpecifications();
      const dosAndDonts = this.extractDosAndDonts();
      const relatedLinks = this.extractRelatedLinks();

      return {
        title,
        platform,
        url: this.url,
        summary,
        mainContent,
        bestPractices,
        codeExamples,
        designSpecs,
        dosAndDonts,
        relatedLinks,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error parsing guideline', { url: this.url, error });
      throw new Error(`Failed to parse guideline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract the page title
   */
  private extractTitle(): string {
    // Try multiple selectors that Apple typically uses
    const selectors = [
      'h1.page-title',
      'h1[class*="title"]',
      'h1',
      'meta[property="og:title"]'
    ];

    for (const selector of selectors) {
      if (selector.startsWith('meta')) {
        const content = this.$(selector).attr('content');
        if (content) return content.trim();
      } else {
        const text = this.$(selector).first().text().trim();
        if (text) return text;
      }
    }

    return 'Untitled Guideline';
  }

  /**
   * Extract the platform from the page
   */
  private extractPlatform(): ApplePlatform {
    // Check URL patterns
    const urlLower = this.url.toLowerCase();
    if (urlLower.includes('/ios/')) return 'ios';
    if (urlLower.includes('/macos/')) return 'macos';
    if (urlLower.includes('/watchos/')) return 'watchos';
    if (urlLower.includes('/tvos/')) return 'tvos';
    if (urlLower.includes('/visionos/')) return 'visionos';

    // Check page content
    const platformIndicators = {
      ios: ['iOS', 'iPhone', 'iPad'],
      macos: ['macOS', 'Mac'],
      watchos: ['watchOS', 'Apple Watch'],
      tvos: ['tvOS', 'Apple TV'],
      visionos: ['visionOS', 'Vision Pro']
    };

    const pageText = this.$('body').text();
    for (const [platform, indicators] of Object.entries(platformIndicators)) {
      if (indicators.some(indicator => pageText.includes(indicator))) {
        return platform as ApplePlatform;
      }
    }

    return 'ios'; // Default to iOS
  }

  /**
   * Extract the summary/overview section
   */
  private extractSummary(): string {
    const summarySelectors = [
      '.intro-text',
      '.page-intro',
      'p.lead',
      'div[class*="intro"] p',
      'section:first-of-type p:first-of-type'
    ];

    for (const selector of summarySelectors) {
      const text = this.$(selector).first().text().trim();
      if (text && text.length > 50) {
        return text;
      }
    }

    // Fallback: Get first substantial paragraph
    const firstParagraph = this.$('main p, article p').first().text().trim();
    return firstParagraph || '';
  }

  /**
   * Extract the main content sections
   */
  private extractMainContent(): ContentSection[] {
    const sections: ContentSection[] = [];
    
    // Find all h2/h3 sections
    this.$('h2, h3').each((_, element) => {
      const $heading = this.$(element);
      const title = $heading.text().trim();
      
      if (!title) return;

      // Skip navigation or metadata headings
      if (title.match(/^(See Also|Related|Resources|On This Page)/i)) return;

      const content: string[] = [];
      let $current = $heading.next();

      // Collect content until next heading
      while ($current.length && !$current.is('h2, h3')) {
        if ($current.is('p, ul, ol')) {
          const text = $current.text().trim();
          if (text) content.push(text);
        }
        $current = $current.next();
      }

      if (content.length > 0) {
        sections.push({
          title,
          content: content.join('\n\n')
        });
      }
    });

    return sections;
  }

  /**
   * Extract best practices section
   */
  private extractBestPractices(): string[] {
    const practices: string[] = [];
    
    // Look for dedicated best practices sections
    const bestPracticesSection = this.$('h2, h3').filter((_, el) => {
      const text = this.$(el).text();
      return text.match(/best practices?|guidelines?|recommendations?/i) !== null;
    });

    bestPracticesSection.each((_, heading) => {
      let $current = this.$(heading).next();
      
      while ($current.length && !$current.is('h2, h3')) {
        if ($current.is('ul, ol')) {
          $current.find('li').each((_, li) => {
            const text = this.$(li).text().trim();
            if (text) practices.push(text);
          });
        } else if ($current.is('p')) {
          const text = $current.text().trim();
          if (text && text.includes('should') || text.includes('must') || text.includes('avoid')) {
            practices.push(text);
          }
        }
        $current = $current.next();
      }
    });

    return practices;
  }

  /**
   * Extract code examples
   */
  private extractCodeExamples(): CodeExample[] {
    const examples: CodeExample[] = [];
    
    // Find code blocks
    this.$('pre code, pre[class*="language-"], code[class*="language-"]').each((_, element) => {
      const $code = this.$(element);
      const code = $code.text().trim();
      
      if (!code) return;

      // Determine language
      let language: CodeLanguage = 'swift';
      const classAttr = $code.attr('class') || '';
      
      if (classAttr.includes('swift') || classAttr.includes('swiftui')) {
        language = classAttr.includes('swiftui') ? 'swiftui' : 'swift';
      } else if (classAttr.includes('objc') || classAttr.includes('objective-c')) {
        language = 'objc';
      }

      // Try to find description
      let description = '';
      const $pre = $code.closest('pre');
      const $prev = $pre.prev();
      
      if ($prev.is('p')) {
        description = $prev.text().trim();
      }

      examples.push({
        language,
        code,
        description
      });
    });

    // Also look for inline code examples that might be significant
    this.$('p').each((_, element) => {
      const $p = this.$(element);
      const text = $p.text();
      
      // Pattern for SwiftUI/UIKit code mentions
      if (text.match(/\b(struct|class|View|UIView|@State|@Binding)\b/)) {
        const $codeElements = $p.find('code');
        if ($codeElements.length > 0) {
          $codeElements.each((_, codeEl) => {
            const code = this.$(codeEl).text().trim();
            if (code.length > 20) { // Only significant code snippets
              examples.push({
                language: 'swift',
                code,
                description: text.replace(code, '').trim()
              });
            }
          });
        }
      }
    });

    return examples;
  }

  /**
   * Extract design specifications
   */
  private extractDesignSpecifications(): DesignSpec[] {
    const specs: DesignSpec[] = [];
    
    // Look for specification tables
    this.$('table').each((_, table) => {
      const $table = this.$(table);
      const headers = $table.find('th').map((_, th) => this.$(th).text().trim()).get();
      
      if (headers.some(h => h.match(/size|spacing|color|dimension|margin|padding/i))) {
        $table.find('tbody tr').each((_, row) => {
          const cells = this.$(row).find('td').map((_, td) => this.$(td).text().trim()).get();
          
          if (cells.length >= 2) {
            specs.push({
              property: cells[0],
              value: cells[1],
              notes: cells[2] || ''
            });
          }
        });
      }
    });

    // Look for design token mentions in text
    const designPatterns = [
      /(\d+)(pt|px|points?|pixels?)/gi,
      /(small|medium|large|x-large|regular|bold)/gi,
      /#[0-9A-Fa-f]{6}|rgb\([^)]+\)/gi
    ];

    this.$('p, li').each((_, element) => {
      const text = this.$(element).text();
      
      designPatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => {
            // Extract context around the match
            const index = text.indexOf(match);
            const start = Math.max(0, index - 20);
            const end = Math.min(text.length, index + match.length + 20);
            const context = text.substring(start, end).trim();
            
            specs.push({
              property: 'Design Token',
              value: match,
              notes: context
            });
          });
        }
      });
    });

    // Remove duplicates
    const uniqueSpecs = specs.filter((spec, index, self) =>
      index === self.findIndex(s => s.property === spec.property && s.value === spec.value)
    );

    return uniqueSpecs;
  }

  /**
   * Extract Do's and Don'ts
   */
  private extractDosAndDonts(): DosAndDonts {
    const dos: string[] = [];
    const donts: string[] = [];
    
    // Look for explicit do/don't sections
    this.$('h2, h3, h4').each((_, heading) => {
      const headingText = this.$(heading).text().toLowerCase();
      const isDo = headingText.includes('do') && !headingText.includes("don't");
      const isDont = headingText.includes("don't") || headingText.includes('avoid');
      
      if (isDo || isDont) {
        let $current = this.$(heading).next();
        
        while ($current.length && !$current.is('h2, h3, h4')) {
          if ($current.is('ul, ol')) {
            $current.find('li').each((_, li) => {
              const text = this.$(li).text().trim();
              if (text) {
                (isDo ? dos : donts).push(text);
              }
            });
          }
          $current = $current.next();
        }
      }
    });

    // Look for implicit patterns in text
    this.$('p, li').each((_, element) => {
      const text = this.$(element).text();
      
      // Positive patterns
      if (text.match(/\b(should|must|recommended|best practice|always)\b/i)) {
        dos.push(text.trim());
      }
      
      // Negative patterns
      if (text.match(/\b(shouldn't|should not|must not|avoid|never|don't)\b/i)) {
        donts.push(text.trim());
      }
    });

    return { dos, donts };
  }

  /**
   * Extract related links and cross-references
   */
  private extractRelatedLinks(): RelatedLink[] {
    const links: RelatedLink[] = [];
    const baseUrl = 'https://developer.apple.com';
    
    // Look for "See Also" or "Related" sections
    const relatedSections = this.$('h2, h3').filter((_, el) => {
      const text = this.$(el).text();
      return text.match(/see also|related|learn more|resources/i) !== null;
    });

    relatedSections.each((_, heading) => {
      let $current = this.$(heading).next();
      
      while ($current.length && !$current.is('h2, h3')) {
        $current.find('a').each((_, link) => {
          const $link = this.$(link);
          const href = $link.attr('href');
          const text = $link.text().trim();
          
          if (href && text && !href.startsWith('#')) {
            links.push({
              title: text,
              url: href.startsWith('http') ? href : baseUrl + href,
              type: this.categorizeLink(href, text)
            });
          }
        });
        $current = $current.next();
      }
    });

    // Also get links from main content that reference other guidelines
    this.$('main a, article a').each((_, link) => {
      const $link = this.$(link);
      const href = $link.attr('href');
      const text = $link.text().trim();
      
      if (href && text && href.includes('/design/human-interface-guidelines/')) {
        // Check if already added
        if (!links.some(l => l.url === href)) {
          links.push({
            title: text,
            url: href.startsWith('http') ? href : baseUrl + href,
            type: this.categorizeLink(href, text)
          });
        }
      }
    });

    return links;
  }

  /**
   * Categorize a link based on its URL and text
   */
  private categorizeLink(href: string, text: string): LinkType {
    if (href.includes('/components/')) return 'component';
    if (href.includes('/foundations/')) return 'foundation';
    if (href.includes('/patterns/')) return 'pattern';
    if (href.includes('/technologies/')) return 'technology';
    if (href.includes('/documentation/')) return 'documentation';
    return 'other';
  }
}

// Type definitions for the parser
export interface ParsedGuideline {
  title: string;
  platform: ApplePlatform;
  url: string;
  summary: string;
  mainContent: ContentSection[];
  bestPractices: string[];
  codeExamples: CodeExample[];
  designSpecs: DesignSpec[];
  dosAndDonts: DosAndDonts;
  relatedLinks: RelatedLink[];
  lastUpdated: string;
}

export interface ContentSection {
  title: string;
  content: string;
}

export interface CodeExample {
  language: CodeLanguage;
  code: string;
  description?: string;
}

export type CodeLanguage = 'swift' | 'swiftui' | 'objc';

export interface DesignSpec {
  property: string;
  value: string;
  notes?: string;
}

export interface DosAndDonts {
  dos: string[];
  donts: string[];
}

export interface RelatedLink {
  title: string;
  url: string;
  type: LinkType;
}

export type LinkType = 'component' | 'foundation' | 'pattern' | 'technology' | 'documentation' | 'other';