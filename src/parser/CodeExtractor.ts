import { CodeBlock } from './ContentParser.js';

export class CodeExtractor {
  // Language mappings for Apple documentation
  private readonly LANGUAGE_MAPPINGS: Record<string, string> = {
    'swift': 'swift',
    'objective-c': 'objectivec',
    'objc': 'objectivec',
    'javascript': 'javascript',
    'js': 'javascript',
    'typescript': 'typescript',
    'ts': 'typescript',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'xml': 'xml',
    'bash': 'bash',
    'shell': 'bash',
    'sh': 'bash'
  };

  // Platform indicators
  private readonly PLATFORM_INDICATORS = {
    swiftui: ['SwiftUI', 'View', '@State', '@Binding', '@Published', 'some View'],
    uikit: ['UIKit', 'UIView', 'UIViewController', 'UIButton', 'UILabel'],
    appkit: ['AppKit', 'NSView', 'NSViewController', 'NSButton', 'NSTextField']
  };

  extractCodeBlocks(mainContent: Element): CodeBlock[] {
    const codeBlocks: CodeBlock[] = [];

    // Extract from <pre><code> blocks
    const preCodeBlocks = mainContent.querySelectorAll('pre code');
    preCodeBlocks.forEach(codeElement => {
      const codeBlock = this.extractFromCodeElement(codeElement);
      if (codeBlock) {
        codeBlocks.push(codeBlock);
      }
    });

    // Extract from standalone <code> blocks that contain multiline content
    const standaloneCodeBlocks = mainContent.querySelectorAll('code');
    standaloneCodeBlocks.forEach(codeElement => {
      // Skip if already processed as part of pre>code
      if (codeElement.parentElement?.tagName === 'PRE') {
        return;
      }

      const code = codeElement.textContent || '';
      if (code.includes('\n') || code.length > 100) {
        const codeBlock = this.extractFromCodeElement(codeElement);
        if (codeBlock) {
          codeBlocks.push(codeBlock);
        }
      }
    });

    // Extract from divs with code-related classes
    const codeContainers = mainContent.querySelectorAll('[class*="code"], [class*="highlight"], [class*="syntax"]');
    codeContainers.forEach(container => {
      // Skip if it's a pre or code element (already processed)
      if (container.tagName === 'PRE' || container.tagName === 'CODE') {
        return;
      }

      const codeBlock = this.extractFromContainer(container);
      if (codeBlock) {
        codeBlocks.push(codeBlock);
      }
    });

    // Deduplicate code blocks
    return this.deduplicateCodeBlocks(codeBlocks);
  }

  private extractFromCodeElement(codeElement: Element): CodeBlock | null {
    const code = this.extractCodeText(codeElement);
    if (!code) return null;

    const language = this.detectLanguage(codeElement, code);
    const platform = this.detectPlatform(code);
    const title = this.extractCodeTitle(codeElement);

    return {
      language,
      code,
      platform,
      title
    };
  }

  private extractFromContainer(container: Element): CodeBlock | null {
    // Look for code elements within the container
    const codeElement = container.querySelector('code, pre');
    if (!codeElement) {
      // If no code element, check if the container itself contains code
      const text = container.textContent || '';
      if (!this.looksLikeCode(text)) {
        return null;
      }
      
      return {
        language: this.detectLanguageFromText(text),
        code: this.cleanCode(text),
        platform: this.detectPlatform(text)
      };
    }

    return this.extractFromCodeElement(codeElement);
  }

  private detectLanguage(element: Element, code: string): string {
    // Check class names
    const className = element.className || element.parentElement?.className || '';
    for (const [key, value] of Object.entries(this.LANGUAGE_MAPPINGS)) {
      if (className.toLowerCase().includes(key)) {
        return value;
      }
    }

    // Check data attributes
    const dataLang = element.getAttribute('data-language') || 
                     element.getAttribute('data-lang') ||
                     element.parentElement?.getAttribute('data-language') ||
                     element.parentElement?.getAttribute('data-lang');
    
    if (dataLang) {
      return this.LANGUAGE_MAPPINGS[dataLang.toLowerCase()] || dataLang.toLowerCase();
    }

    // Detect from code content
    return this.detectLanguageFromText(code);
  }

  private detectLanguageFromText(code: string): string {
    // Swift detection
    if (code.includes('import SwiftUI') || 
        code.includes('import UIKit') ||
        code.includes('func ') ||
        code.includes('var ') ||
        code.includes('let ') ||
        code.includes('struct ') ||
        code.includes('class ') && code.includes('{')) {
      return 'swift';
    }

    // Objective-C detection
    if (code.includes('#import') ||
        code.includes('@interface') ||
        code.includes('@implementation') ||
        code.includes('NSString') ||
        code.includes('[[') && code.includes(']]')) {
      return 'objectivec';
    }

    // JavaScript/TypeScript detection
    if (code.includes('const ') ||
        code.includes('let ') && !code.includes('let ') ||
        code.includes('function ') ||
        code.includes('=>') ||
        code.includes('async ') ||
        code.includes('await ')) {
      return code.includes(': ') && code.includes('interface ') ? 'typescript' : 'javascript';
    }

    // HTML detection
    if (code.includes('<') && code.includes('>') && 
        (code.includes('</') || code.includes('/>'))) {
      return 'html';
    }

    // CSS detection
    if (code.includes('{') && code.includes('}') && 
        (code.includes(':') && code.includes(';'))) {
      return 'css';
    }

    // JSON detection
    if (code.trim().startsWith('{') && code.trim().endsWith('}') ||
        code.trim().startsWith('[') && code.trim().endsWith(']')) {
      try {
        JSON.parse(code);
        return 'json';
      } catch {
        // Not valid JSON
      }
    }

    return 'text';
  }

  private detectPlatform(code: string): CodeBlock['platform'] | undefined {
    for (const [platform, indicators] of Object.entries(this.PLATFORM_INDICATORS)) {
      for (const indicator of indicators) {
        if (code.includes(indicator)) {
          return platform as CodeBlock['platform'];
        }
      }
    }
    return undefined;
  }

  private extractCodeTitle(element: Element): string | undefined {
    // Look for a title or caption above the code block
    const previousElement = element.parentElement?.previousElementSibling;
    if (previousElement && 
        (previousElement.tagName === 'H3' || 
         previousElement.tagName === 'H4' ||
         previousElement.tagName === 'STRONG' ||
         previousElement.classList.contains('code-title'))) {
      return previousElement.textContent?.trim();
    }

    // Look for a comment at the beginning of the code
    const lines = element.textContent?.split('\n') || [];
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.startsWith('//') || firstLine.startsWith('#') || firstLine.startsWith('/*')) {
        return firstLine.replace(/^\/\/\s*|^#\s*|^\/\*\s*/, '').replace(/\*\/$/, '').trim();
      }
    }

    return undefined;
  }

  private extractCodeText(element: Element): string {
    // Get the raw text content
    let code = element.textContent || '';

    // Clean up the code
    code = this.cleanCode(code);

    return code;
  }

  private cleanCode(code: string): string {
    // Remove leading/trailing whitespace
    code = code.trim();

    // Remove common artifacts
    code = code.replace(/^\d+\s*/gm, ''); // Remove line numbers
    code = code.replace(/\u00A0/g, ' '); // Replace non-breaking spaces
    code = code.replace(/\t/g, '    '); // Replace tabs with spaces

    // Detect and remove common indentation
    const lines = code.split('\n');
    const minIndent = this.detectMinIndentation(lines);
    if (minIndent > 0) {
      code = lines.map(line => line.substring(minIndent)).join('\n');
    }

    return code;
  }

  private detectMinIndentation(lines: string[]): number {
    let minIndent = Infinity;
    
    for (const line of lines) {
      if (line.trim() === '') continue;
      
      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      minIndent = Math.min(minIndent, indent);
    }

    return minIndent === Infinity ? 0 : minIndent;
  }

  private looksLikeCode(text: string): boolean {
    // Check for common code patterns
    const codePatterns = [
      /\{[\s\S]*\}/, // Curly braces
      /\([\s\S]*\)/, // Parentheses
      /function\s+\w+/, // Function declarations
      /class\s+\w+/, // Class declarations
      /import\s+/, // Import statements
      /export\s+/, // Export statements
      /if\s*\(/, // If statements
      /for\s*\(/, // For loops
      /while\s*\(/, // While loops
      /=>/, // Arrow functions
      /\w+\s*=\s*/, // Assignments
    ];

    return codePatterns.some(pattern => pattern.test(text));
  }

  private deduplicateCodeBlocks(codeBlocks: CodeBlock[]): CodeBlock[] {
    const seen = new Set<string>();
    const unique: CodeBlock[] = [];

    for (const block of codeBlocks) {
      const key = block.code.trim();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(block);
      }
    }

    return unique;
  }

  extractInlineCode(text: string): string[] {
    const inlineCode: string[] = [];
    const regex = /`([^`]+)`/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      inlineCode.push(match[1]);
    }

    return inlineCode;
  }
}