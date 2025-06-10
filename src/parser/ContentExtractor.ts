import { ContentSection, ImageData, TableData } from './ContentParser';

export class ContentExtractor {
  // Common selectors for Apple HIG pages
  private readonly MAIN_CONTENT_SELECTORS = [
    'main',
    '[role="main"]',
    '.content',
    '.main-content',
    '#main-content',
    'article',
    '.article-content'
  ];

  private readonly SECTION_TYPES = {
    overview: ['overview', 'introduction', 'intro'],
    'best-practices': ['best practice', 'guideline', 'recommendation'],
    specifications: ['specification', 'spec', 'requirement', 'dimension'],
    'platform-specific': ['ios', 'ipados', 'macos', 'watchos', 'tvos', 'visionos']
  };

  extractMainContent(document: Document): Element | null {
    // Try each selector until we find the main content
    for (const selector of this.MAIN_CONTENT_SELECTORS) {
      const element = document.querySelector(selector);
      if (element && element.textContent?.trim()) {
        return element;
      }
    }

    // Fallback: look for the largest content area
    const contentAreas = document.querySelectorAll('div[class*="content"], section');
    let largestArea: Element | null = null;
    let largestSize = 0;

    contentAreas.forEach(area => {
      const textLength = area.textContent?.length || 0;
      if (textLength > largestSize) {
        largestSize = textLength;
        largestArea = area;
      }
    });

    return largestArea;
  }

  extractSections(mainContent: Element): ContentSection[] {
    const sections: ContentSection[] = [];
    const headings = mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.substring(1));
      const title = heading.textContent?.trim() || '';
      const id = heading.id || `section-${index}`;

      // Get content between this heading and the next
      const content = this.extractSectionContent(heading, headings[index + 1]);

      // Determine section type
      const type = this.determineSectionType(title, content);

      sections.push({
        id,
        title,
        level,
        content,
        type
      });
    });

    return sections;
  }

  private extractSectionContent(startHeading: Element, nextHeading?: Element): string {
    const content: string[] = [];
    let currentElement = startHeading.nextElementSibling;

    while (currentElement && currentElement !== nextHeading) {
      // Skip if it's another heading
      if (/^h[1-6]$/i.test(currentElement.tagName)) {
        break;
      }

      // Extract text content from various elements
      if (currentElement.matches('p, li, div, span')) {
        const text = this.cleanText(currentElement.textContent || '');
        if (text) {
          content.push(text);
        }
      }

      currentElement = currentElement.nextElementSibling;
    }

    return content.join('\n\n');
  }

  private determineSectionType(title: string, content: string): ContentSection['type'] {
    const lowerTitle = title.toLowerCase();
    const lowerContent = content.toLowerCase();

    for (const [type, keywords] of Object.entries(this.SECTION_TYPES)) {
      for (const keyword of keywords) {
        if (lowerTitle.includes(keyword) || lowerContent.includes(keyword)) {
          return type as ContentSection['type'];
        }
      }
    }

    return 'general';
  }

  extractImages(mainContent: Element): ImageData[] {
    const images: ImageData[] = [];
    const imgElements = mainContent.querySelectorAll('img');

    imgElements.forEach(img => {
      const src = img.src || img.getAttribute('data-src') || '';
      const alt = img.alt || '';

      if (!src) return;

      const imageData: ImageData = {
        src,
        alt
      };

      // Look for caption
      const figure = img.closest('figure');
      if (figure) {
        const figcaption = figure.querySelector('figcaption');
        if (figcaption) {
          imageData.caption = this.cleanText(figcaption.textContent || '');
        }
      }

      // Determine context (which section this image belongs to)
      const section = img.closest('section, [class*="section"]');
      if (section) {
        const sectionId = section.id || section.className;
        imageData.context = sectionId;
      }

      images.push(imageData);
    });

    return images;
  }

  extractTables(mainContent: Element): TableData[] {
    const tables: TableData[] = [];
    const tableElements = mainContent.querySelectorAll('table');

    tableElements.forEach(table => {
      const headers: string[] = [];
      const rows: string[][] = [];

      // Extract headers
      const headerCells = table.querySelectorAll('thead th, thead td');
      if (headerCells.length === 0) {
        // Try first row as headers
        const firstRowCells = table.querySelectorAll('tr:first-child th, tr:first-child td');
        firstRowCells.forEach(cell => {
          headers.push(this.cleanText(cell.textContent || ''));
        });
      } else {
        headerCells.forEach(cell => {
          headers.push(this.cleanText(cell.textContent || ''));
        });
      }

      // Extract rows
      const bodyRows = table.querySelectorAll('tbody tr');
      if (bodyRows.length === 0) {
        // No tbody, get all rows except first if it's headers
        const allRows = table.querySelectorAll('tr');
        const startIndex = headers.length > 0 ? 1 : 0;
        for (let i = startIndex; i < allRows.length; i++) {
          const row = this.extractTableRow(allRows[i]);
          if (row.length > 0) {
            rows.push(row);
          }
        }
      } else {
        bodyRows.forEach(row => {
          const rowData = this.extractTableRow(row);
          if (rowData.length > 0) {
            rows.push(rowData);
          }
        });
      }

      // Look for caption
      let caption: string | undefined;
      const tableCaption = table.querySelector('caption');
      if (tableCaption) {
        caption = this.cleanText(tableCaption.textContent || '');
      }

      if (headers.length > 0 || rows.length > 0) {
        tables.push({
          headers,
          rows,
          caption
        });
      }
    });

    return tables;
  }

  private extractTableRow(row: Element): string[] {
    const cells: string[] = [];
    const cellElements = row.querySelectorAll('td, th');
    
    cellElements.forEach(cell => {
      cells.push(this.cleanText(cell.textContent || ''));
    });

    return cells;
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim();
  }
}