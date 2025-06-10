import { BrowseSectionParams } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { HIGServerError } from '../types/index.js';
import urlMappings from '../scraper/url-mappings.json' with { type: 'json' };

interface SectionInfo {
  title: string;
  description: string;
  url: string;
  subsections?: SectionItem[];
  items?: SectionItem[];
}

interface SectionItem {
  name: string;
  path: string;
  description?: string;
}

export class BrowseSection {
  private baseUrl: string;

  constructor() {
    this.baseUrl = urlMappings.base_url;
  }

  /**
   * Browse a specific section of the Apple HIG documentation
   */
  public async execute(params: BrowseSectionParams): Promise<string> {
    try {
      logger.info('Browsing section', { section: params.section, platform: params.platform });

      // Validate inputs
      if (!params.section || params.section.trim() === '') {
        throw new HIGServerError('INVALID_SECTION', 'Section path cannot be empty');
      }

      // Parse section path
      const sectionParts = params.section.toLowerCase().split('/').filter(p => p);
      const mainSection = sectionParts[0];
      const subSection = sectionParts[1];

      // Get section info
      const sectionInfo = this.getSectionInfo(mainSection, subSection, params.platform);
      
      if (!sectionInfo) {
        throw new HIGServerError('SECTION_NOT_FOUND', `Section '${params.section}' not found`);
      }

      // Format the response
      return this.formatSectionInfo(sectionInfo, params.platform);
    } catch (error) {
      logger.error('Error browsing section', error);
      throw error;
    }
  }

  /**
   * Get information about a specific section
   */
  private getSectionInfo(mainSection: string, subSection?: string, platform?: string): SectionInfo | null {
    // Handle platform-specific sections
    const platforms = urlMappings.platforms as Record<string, any>;
    if (mainSection === 'platforms' || platforms[mainSection]) {
      return this.getPlatformInfo(platform || mainSection);
    }

    // Handle main sections
    const sections = urlMappings.sections as Record<string, any>;
    const section = sections[mainSection];
    if (!section) {
      return null;
    }

    // If no subsection specified, return main section info
    if (!subSection) {
      return this.getMainSectionInfo(mainSection, section);
    }

    // Handle subsections
    if (mainSection === 'components' && 'categories' in section) {
      return this.getComponentCategoryInfo(subSection, section.categories);
    }

    return null;
  }

  /**
   * Get platform-specific information
   */
  private getPlatformInfo(platform: string): SectionInfo | null {
    const platforms = urlMappings.platforms as Record<string, any>;
    const platformData = platforms[platform];
    if (!platformData) {
      return null;
    }

    const items: SectionItem[] = [];

    // Add main platform page
    items.push({
      name: `Designing for ${platform.toUpperCase()}`,
      path: platformData.main,
      description: platformData.description
    });

    // Add platform-specific sections
    if (platformData.sections) {
      for (const [key, value] of Object.entries(platformData.sections)) {
        if (typeof value === 'string') {
          items.push({
            name: this.titleCase(key.replace(/-/g, ' ')),
            path: value,
            description: `${platform.toUpperCase()} ${key} guidelines`
          });
        }
      }
    }

    return {
      title: `${platform.toUpperCase()} Design Guidelines`,
      description: platformData.description,
      url: `${this.baseUrl}${platformData.main}`,
      items
    };
  }

  /**
   * Get main section information
   */
  private getMainSectionInfo(sectionId: string, section: any): SectionInfo {
    const sectionInfo: SectionInfo = {
      title: this.titleCase(sectionId),
      description: section.description,
      url: `${this.baseUrl}${section.main}`,
      subsections: []
    };

    // Add subcategories
    if ('subcategories' in section && Array.isArray(section.subcategories)) {
      for (const subcategory of section.subcategories) {
        const name = subcategory.split('/').pop() || '';
        sectionInfo.subsections!.push({
          name: this.titleCase(name.replace(/-/g, ' ')),
          path: subcategory,
          description: `${section.description} - ${this.titleCase(name.replace(/-/g, ' '))}`
        });
      }
    }

    // Add items (for technologies)
    if ('items' in section && Array.isArray(section.items)) {
      sectionInfo.items = [];
      for (const item of section.items) {
        const name = item.split('/').pop() || '';
        sectionInfo.items.push({
          name: this.titleCase(name.replace(/-/g, ' ')),
          path: item,
          description: `Technology guide for ${this.titleCase(name.replace(/-/g, ' '))}`
        });
      }
    }

    // Add categories (for components)
    if ('categories' in section) {
      for (const [categoryId, category] of Object.entries(section.categories)) {
        if (typeof category === 'object' && category !== null && 'description' in category) {
          sectionInfo.subsections!.push({
            name: this.titleCase(categoryId.replace(/-/g, ' ')),
            path: categoryId,
            description: String(category.description)
          });
        }
      }
    }

    return sectionInfo;
  }

  /**
   * Get component category information
   */
  private getComponentCategoryInfo(categoryId: string, categories: any): SectionInfo | null {
    const category = categories[categoryId];
    if (!category || typeof category !== 'object') {
      return null;
    }

    const items: SectionItem[] = [];
    
    if ('items' in category && Array.isArray(category.items)) {
      for (const item of category.items) {
        const name = item.split('/').pop() || '';
        items.push({
          name: this.titleCase(name.replace(/-/g, ' ')),
          path: `/components${item}`,
          description: `UI component for ${this.titleCase(name.replace(/-/g, ' '))}`
        });
      }
    }

    return {
      title: this.titleCase(categoryId.replace(/-/g, ' ')),
      description: (category.description || `Components in the ${categoryId} category`) as string,
      url: `${this.baseUrl}/components/${categoryId}`,
      items
    };
  }

  /**
   * Format section information for display
   */
  private formatSectionInfo(info: SectionInfo, platform?: string): string {
    let output = `# ${info.title}\n\n`;
    output += `${info.description}\n\n`;
    output += `**URL**: ${info.url}\n\n`;

    if (platform) {
      output += `**Platform**: ${platform.toUpperCase()}\n\n`;
    }

    // Add subsections
    if (info.subsections && info.subsections.length > 0) {
      output += `## Subsections\n\n`;
      for (const subsection of info.subsections) {
        output += `### ${subsection.name}\n`;
        if (subsection.description) {
          output += `${subsection.description}\n`;
        }
        output += `Path: \`${subsection.path}\`\n\n`;
      }
    }

    // Add items
    if (info.items && info.items.length > 0) {
      output += `## Available Items\n\n`;
      for (const item of info.items) {
        output += `- **${item.name}**`;
        if (item.description) {
          output += `: ${item.description}`;
        }
        output += `\n  URL: ${this.baseUrl}${item.path}\n`;
      }
    }

    // Add navigation hints
    output += `\n## Navigation Tips\n\n`;
    output += `- Use \`getGuideline\` with specific paths to get detailed content\n`;
    output += `- Use \`searchHIG\` to find specific topics across all sections\n`;
    output += `- Available main sections: ${Object.keys(urlMappings.sections).join(', ')}\n`;
    output += `- Available platforms: ${Object.keys(urlMappings.platforms).join(', ')}\n`;

    return output;
  }

  /**
   * Convert kebab-case to Title Case
   */
  private titleCase(str: string): string {
    return str.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Get a list of all available sections
   */
  public getAvailableSections(): string[] {
    const sections: string[] = [];
    
    // Add main sections
    sections.push(...Object.keys(urlMappings.sections));
    
    // Add platforms
    sections.push(...Object.keys(urlMappings.platforms));
    
    return sections;
  }
}

// Export singleton instance
export const browseSection = new BrowseSection();