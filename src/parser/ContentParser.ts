import { JSDOM } from 'jsdom';
import { ContentExtractor } from './ContentExtractor.js';
import { CodeExtractor } from './CodeExtractor.js';

export interface ParsedContent {
  title: string;
  description: string;
  sections: ContentSection[];
  images: ImageData[];
  codeBlocks: CodeBlock[];
  tables: TableData[];
  metadata: PageMetadata;
}

export interface ContentSection {
  id: string;
  title: string;
  level: number;
  content: string;
  type: 'overview' | 'best-practices' | 'specifications' | 'platform-specific' | 'general';
}

export interface ImageData {
  src: string;
  alt: string;
  caption?: string;
  context?: string;
}

export interface CodeBlock {
  language: string;
  code: string;
  platform?: 'swiftui' | 'uikit' | 'appkit' | 'general';
  title?: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface PageMetadata {
  lastUpdated?: string;
  platforms?: string[];
  topics?: string[];
  breadcrumbs?: string[];
}

export class ContentParser {
  private contentExtractor: ContentExtractor;
  private codeExtractor: CodeExtractor;

  constructor() {
    this.contentExtractor = new ContentExtractor();
    this.codeExtractor = new CodeExtractor();
  }

  async parse(html: string, url: string): Promise<ParsedContent> {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    // Clean the document first
    this.cleanDocument(document);

    // Extract main content area
    const mainContent = this.contentExtractor.extractMainContent(document);
    if (!mainContent) {
      throw new Error('Could not find main content area');
    }

    // Extract metadata
    const metadata = this.extractMetadata(document);

    // Extract title and description
    const title = this.extractTitle(document, mainContent);
    const description = this.extractDescription(document, mainContent);

    // Extract sections
    const sections = this.contentExtractor.extractSections(mainContent);

    // Extract images
    const images = this.contentExtractor.extractImages(mainContent);

    // Extract code blocks
    const codeBlocks = this.codeExtractor.extractCodeBlocks(mainContent);

    // Extract tables
    const tables = this.contentExtractor.extractTables(mainContent);

    return {
      title,
      description,
      sections,
      images,
      codeBlocks,
      tables,
      metadata
    };
  }

  private cleanDocument(document: Document): void {
    // Remove script tags
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => script.remove());

    // Remove style tags
    const styles = document.querySelectorAll('style');
    styles.forEach(style => style.remove());

    // Remove navigation elements
    const navElements = document.querySelectorAll('nav, [role="navigation"]');
    navElements.forEach(nav => nav.remove());

    // Remove footer
    const footers = document.querySelectorAll('footer, [role="contentinfo"]');
    footers.forEach(footer => footer.remove());

    // Remove cookie banners and popups
    const popups = document.querySelectorAll('[class*="cookie"], [class*="banner"], [class*="popup"]');
    popups.forEach(popup => popup.remove());
  }

  private extractTitle(document: Document, mainContent: Element): string {
    // Try to find title in main content first
    const contentTitle = mainContent.querySelector('h1');
    if (contentTitle) {
      return contentTitle.textContent?.trim() || '';
    }

    // Fallback to page title
    const pageTitle = document.querySelector('title');
    return pageTitle?.textContent?.trim() || '';
  }

  private extractDescription(document: Document, mainContent: Element): string {
    // Check for meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      return metaDesc.getAttribute('content') || '';
    }

    // Look for lead paragraph
    const leadParagraph = mainContent.querySelector('.lead, .intro, [class*="introduction"]');
    if (leadParagraph) {
      return leadParagraph.textContent?.trim() || '';
    }

    // Get first paragraph after h1
    const firstParagraph = mainContent.querySelector('h1 + p');
    if (firstParagraph) {
      return firstParagraph.textContent?.trim() || '';
    }

    return '';
  }

  private extractMetadata(document: Document): PageMetadata {
    const metadata: PageMetadata = {};

    // Extract breadcrumbs (try multiple selectors)
    const breadcrumbSelectors = [
      'nav[aria-label="Breadcrumb"]',
      'nav[aria-label="breadcrumb"]',
      '.breadcrumb',
      '[class*="breadcrumb"]'
    ];
    
    for (const selector of breadcrumbSelectors) {
      const breadcrumbNav = document.querySelector(selector);
      if (breadcrumbNav) {
        const breadcrumbItems = breadcrumbNav.querySelectorAll('a, span:not(:last-child)');
        if (breadcrumbItems.length > 0) {
          metadata.breadcrumbs = Array.from(breadcrumbItems).map(item => item.textContent?.trim() || '').filter(text => text);
          break;
        }
      }
    }

    // Extract platforms from tabs or content
    const platformTabs = document.querySelectorAll('[role="tab"], [role="tabpanel"]');
    const platformNames = new Set<string>();
    
    platformTabs.forEach(tab => {
      const ariaLabel = tab.getAttribute('aria-label') || '';
      const textContent = tab.textContent || '';
      
      ['iOS', 'iPadOS', 'macOS', 'watchOS', 'tvOS', 'visionOS'].forEach(platform => {
        if (ariaLabel.includes(platform) || textContent.includes(platform)) {
          platformNames.add(platform);
        }
      });
    });
    
    if (platformNames.size > 0) {
      metadata.platforms = Array.from(platformNames);
    }

    // Extract topics/tags
    const topics = document.querySelectorAll('[class*="topic"], [class*="tag"]');
    if (topics.length > 0) {
      metadata.topics = Array.from(topics).map(topic => topic.textContent?.trim() || '').filter(text => text);
    }

    return metadata;
  }

  async parseToMarkdown(html: string, url: string): Promise<string> {
    const parsed = await this.parse(html, url);
    return this.convertToMarkdown(parsed);
  }

  private convertToMarkdown(content: ParsedContent): string {
    let markdown = `# ${content.title}\n\n`;

    if (content.description) {
      markdown += `${content.description}\n\n`;
    }

    // Add metadata
    if (content.metadata.platforms && content.metadata.platforms.length > 0) {
      markdown += `**Platforms:** ${content.metadata.platforms.join(', ')}\n\n`;
    }

    // Track processed code blocks and images to avoid duplication
    const processedCodeBlocks = new Set<string>();
    const processedImages = new Set<string>();

    // Add sections
    for (const section of content.sections) {
      // Skip duplicate h1 (often the page title is repeated)
      if (section.level === 1 && section.title === content.title) {
        continue;
      }

      const headerLevel = '#'.repeat(Math.min(section.level, 6));
      markdown += `${headerLevel} ${section.title}\n\n`;
      
      if (section.content.trim()) {
        markdown += `${section.content}\n\n`;
      }

      // Add related images
      const sectionImages = content.images.filter(img => img.context === section.id);
      for (const image of sectionImages) {
        if (!processedImages.has(image.src)) {
          processedImages.add(image.src);
          markdown += `![${image.alt}](${image.src})`;
          if (image.caption) {
            markdown += `\n*${image.caption}*`;
          }
          markdown += '\n\n';
        }
      }
    }

    // Add standalone code blocks that weren't already included
    for (const code of content.codeBlocks) {
      const codeKey = code.code.trim();
      if (!processedCodeBlocks.has(codeKey)) {
        processedCodeBlocks.add(codeKey);
        
        if (code.title) {
          markdown += `### ${code.title}\n\n`;
        }
        
        if (code.platform) {
          markdown += `*Platform: ${code.platform}*\n\n`;
        }
        
        markdown += `\`\`\`${code.language}\n${code.code}\n\`\`\`\n\n`;
      }
    }

    // Add orphaned images (not associated with any section)
    for (const image of content.images) {
      if (!processedImages.has(image.src)) {
        markdown += `![${image.alt}](${image.src})`;
        if (image.caption) {
          markdown += `\n*${image.caption}*`;
        }
        markdown += '\n\n';
      }
    }

    // Add tables
    for (const table of content.tables) {
      if (table.caption) {
        markdown += `### ${table.caption}\n\n`;
      }
      
      // Headers
      markdown += `| ${table.headers.join(' | ')} |\n`;
      markdown += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
      
      // Rows
      for (const row of table.rows) {
        markdown += `| ${row.join(' | ')} |\n`;
      }
      markdown += '\n';
    }

    return markdown;
  }
}