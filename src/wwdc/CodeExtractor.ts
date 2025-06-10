/**
 * Code extractor for WWDC transcripts
 * Extracts and validates code examples from transcript segments
 */

import { TranscriptSegment, WWDCCodeExample, WWDCTranscript } from '../types/wwdc.js';
import { logger } from '../utils/logger.js';

interface CodePattern {
  pattern: RegExp;
  language: 'swift' | 'objc' | 'javascript' | 'other';
  priority: number;
}

interface ExtractedCode {
  code: string;
  language: 'swift' | 'objc' | 'javascript' | 'other';
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export class CodeExtractor {
  // Code detection patterns with priority
  private readonly codePatterns: CodePattern[] = [
    // Swift patterns
    { pattern: /\b(import\s+(SwiftUI|UIKit|Foundation|Combine|CoreData))\b/, language: 'swift', priority: 10 },
    { pattern: /\b(struct|class|enum|protocol|extension)\s+\w+\s*(:|\{)/, language: 'swift', priority: 9 },
    { pattern: /@(State|Binding|Published|ObservedObject|StateObject|Environment|EnvironmentObject)/, language: 'swift', priority: 9 },
    { pattern: /\bfunc\s+\w+\s*\([^)]*\)\s*(->|\{)/, language: 'swift', priority: 8 },
    { pattern: /\b(let|var)\s+\w+\s*:\s*\w+/, language: 'swift', priority: 7 },
    { pattern: /\b(View|ObservableObject|Publisher)\s*\{/, language: 'swift', priority: 7 },
    { pattern: /\.onAppear\s*\{|\.onChange\s*\(|\.task\s*\{/, language: 'swift', priority: 7 },
    
    // Objective-C patterns
    { pattern: /#import\s*[<"].*[>"]/, language: 'objc', priority: 10 },
    { pattern: /@(interface|implementation|protocol)\s+\w+/, language: 'objc', priority: 9 },
    { pattern: /@property\s*\([^)]+\)/, language: 'objc', priority: 8 },
    { pattern: /\[\s*\w+\s+\w+\s*\]/, language: 'objc', priority: 7 },
    { pattern: /NS(String|Array|Dictionary|Number)\s*\*/, language: 'objc', priority: 7 },
    
    // JavaScript patterns
    { pattern: /\b(const|let|var)\s+\w+\s*=\s*(function|\(|async)/, language: 'javascript', priority: 8 },
    { pattern: /\b(function|async\s+function)\s+\w+\s*\(/, language: 'javascript', priority: 8 },
    { pattern: /\b(class|export|import)\s+\w+/, language: 'javascript', priority: 7 },
    { pattern: /=>\s*\{/, language: 'javascript', priority: 6 },
  ];

  // Swift/SwiftUI specific validation patterns
  private readonly swiftValidationPatterns = {
    imports: /^import\s+(SwiftUI|UIKit|Foundation|Combine|CoreData|AVFoundation|MapKit|StoreKit)/m,
    structDeclaration: /struct\s+\w+(\s*:\s*\w+)?(\s*,\s*\w+)*\s*\{/,
    classDeclaration: /class\s+\w+(\s*:\s*\w+)?(\s*,\s*\w+)*\s*\{/,
    protocolDeclaration: /protocol\s+\w+(\s*:\s*\w+)?(\s*,\s*\w+)*\s*\{/,
    functionDeclaration: /func\s+\w+\s*\([^)]*\)(\s*->\s*\w+)?\s*\{/,
    propertyWrapper: /@(State|Binding|Published|ObservedObject|StateObject|Environment|EnvironmentObject|AppStorage|SceneStorage)/,
    viewBody: /var\s+body\s*:\s*some\s+View\s*\{/,
    closureSyntax: /\{\s*(\w+\s*(,\s*\w+)*\s+)?in\s/,
    trailingClosure: /\}\s*\w+\s*\{/,
  };

  // Code boundary markers
  private readonly codeBoundaryMarkers = {
    start: [
      'let me show you', 'here\'s the code', 'for example', 'like this',
      'you can write', 'here\'s how', 'the code looks like', 'in code',
      'let\'s look at', 'here we have', 'starting with', 'begins with'
    ],
    end: [
      'and that\'s', 'so that\'s', 'this gives us', 'the result',
      'moving on', 'next', 'now', 'let\'s', 'this way', 'as you can see'
    ]
  };

  /**
   * Extract code examples from a full transcript
   */
  extractFromTranscript(transcript: WWDCTranscript): WWDCCodeExample[] {
    const codeExamples: WWDCCodeExample[] = [];
    
    // First pass: Find segments with code indicators
    const codeSegments = this.findCodeSegments(transcript.segments);
    
    // Second pass: Extract and validate code from segments
    for (const segment of codeSegments) {
      const extractedCodes = this.extractCodeFromSegment(segment);
      
      for (const extracted of extractedCodes) {
        // Get context from surrounding segments
        const context = this.getCodeContext(transcript, segment, extracted.code);
        
        codeExamples.push({
          sessionId: transcript.sessionId,
          timestamp: segment.startTime,
          code: this.cleanupCode(extracted.code),
          language: extracted.language,
          context: context,
          title: this.inferCodeTitle(context, extracted.code),
          isComplete: this.isCompleteCode(extracted.code, extracted.language)
        });
      }
    }
    
    // Third pass: Merge related code fragments
    const mergedExamples = this.mergeRelatedCode(codeExamples);
    
    logger.info(`Extracted ${mergedExamples.length} code examples from session ${transcript.sessionId}`);
    return mergedExamples;
  }

  /**
   * Find segments that likely contain code
   */
  private findCodeSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
    return segments.filter(segment => {
      // Use the hasCode flag if available
      if (segment.hasCode !== undefined) {
        return segment.hasCode;
      }
      
      // Otherwise, detect code patterns
      return this.detectCodeInText(segment.text);
    });
  }

  /**
   * Extract code from a single segment
   */
  private extractCodeFromSegment(segment: TranscriptSegment): ExtractedCode[] {
    const text = segment.text;
    const extractedCodes: ExtractedCode[] = [];
    
    // Look for explicit code blocks (e.g., between quotes or specific markers)
    const codeBlocks = this.findExplicitCodeBlocks(text);
    
    if (codeBlocks.length > 0) {
      return codeBlocks;
    }
    
    // If no explicit blocks, try to extract based on patterns
    return this.extractByPatterns(text);
  }

  /**
   * Find explicitly marked code blocks
   */
  private findExplicitCodeBlocks(text: string): ExtractedCode[] {
    const blocks: ExtractedCode[] = [];
    
    // Pattern 1: Code between backticks (common in transcripts)
    const backtickPattern = /`([^`]+)`/g;
    let match;
    
    while ((match = backtickPattern.exec(text)) !== null) {
      const code = match[1];
      if (this.looksLikeCode(code)) {
        blocks.push({
          code: code,
          language: this.detectLanguage(code),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 0.9
        });
      }
    }
    
    // Pattern 2: Indented blocks (multiple lines starting with spaces)
    const lines = text.split('\n');
    let codeBlock = '';
    let startIndex = 0;
    let inCodeBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isIndented = line.startsWith('    ') || line.startsWith('\t');
      
      if (isIndented && this.looksLikeCode(line.trim())) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          startIndex = text.indexOf(line);
        }
        codeBlock += line.trim() + '\n';
      } else if (inCodeBlock) {
        // End of code block
        if (codeBlock.trim()) {
          blocks.push({
            code: codeBlock.trim(),
            language: this.detectLanguage(codeBlock),
            startIndex: startIndex,
            endIndex: startIndex + codeBlock.length,
            confidence: 0.8
          });
        }
        codeBlock = '';
        inCodeBlock = false;
      }
    }
    
    return blocks;
  }

  /**
   * Extract code based on language patterns
   */
  private extractByPatterns(text: string): ExtractedCode[] {
    const extractedCodes: ExtractedCode[] = [];
    const processedRanges: Array<[number, number]> = [];
    
    // Sort patterns by priority
    const sortedPatterns = [...this.codePatterns].sort((a, b) => b.priority - a.priority);
    
    for (const { pattern, language } of sortedPatterns) {
      const matches = [...text.matchAll(new RegExp(pattern, 'g'))];
      
      for (const match of matches) {
        if (!match.index) continue;
        
        // Check if this range was already processed
        if (this.isRangeProcessed(match.index, processedRanges)) {
          continue;
        }
        
        // Extract code around the match
        const extractedCode = this.extractAroundMatch(text, match.index, language);
        
        if (extractedCode && extractedCode.code.length > 20) {
          processedRanges.push([extractedCode.startIndex, extractedCode.endIndex]);
          extractedCodes.push(extractedCode);
        }
      }
    }
    
    return extractedCodes;
  }

  /**
   * Extract code around a pattern match
   */
  private extractAroundMatch(text: string, matchIndex: number, language: 'swift' | 'objc' | 'javascript' | 'other'): ExtractedCode | null {
    // Find boundaries of the code
    let startIndex = matchIndex;
    let endIndex = matchIndex;
    
    // Look backward for code start
    for (let i = matchIndex - 1; i >= 0; i--) {
      const char = text[i];
      if (this.isCodeBoundary(text, i, 'start')) {
        startIndex = i;
        break;
      }
    }
    
    // Look forward for code end
    for (let i = matchIndex + 1; i < text.length; i++) {
      const char = text[i];
      if (this.isCodeBoundary(text, i, 'end')) {
        endIndex = i;
        break;
      }
    }
    
    // Extract and validate
    const code = text.substring(startIndex, endIndex).trim();
    
    if (this.validateCodeSnippet(code, language)) {
      return {
        code: code,
        language: language,
        startIndex: startIndex,
        endIndex: endIndex,
        confidence: 0.7
      };
    }
    
    return null;
  }

  /**
   * Check if a position is a code boundary
   */
  private isCodeBoundary(text: string, position: number, type: 'start' | 'end'): boolean {
    const markers = this.codeBoundaryMarkers[type];
    const context = text.substring(Math.max(0, position - 50), position + 50).toLowerCase();
    
    return markers.some(marker => context.includes(marker));
  }

  /**
   * Detect if text contains code patterns
   */
  private detectCodeInText(text: string): boolean {
    return this.codePatterns.some(({ pattern }) => pattern.test(text));
  }

  /**
   * Check if text looks like code
   */
  private looksLikeCode(text: string): boolean {
    // Minimum length check
    if (text.length < 10) return false;
    
    // Check for common code indicators
    const indicators = [
      /[{}()[\]]/,  // Brackets
      /[=<>!&|]/,   // Operators
      /\w+\.\w+/,   // Dot notation
      /\w+\(/,      // Function calls
      /:\s*\w+/,    // Type annotations
      /\/\/|\/\*/,  // Comments
    ];
    
    return indicators.some(pattern => pattern.test(text));
  }

  /**
   * Detect programming language
   */
  private detectLanguage(code: string): 'swift' | 'objc' | 'javascript' | 'other' {
    // Count matches for each language
    const scores: Record<string, number> = {
      swift: 0,
      objc: 0,
      javascript: 0
    };
    
    for (const { pattern, language, priority } of this.codePatterns) {
      if (pattern.test(code)) {
        scores[language] += priority;
      }
    }
    
    // Find highest scoring language
    let maxScore = 0;
    let detectedLanguage: 'swift' | 'objc' | 'javascript' | 'other' = 'other';
    
    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedLanguage = lang as 'swift' | 'objc' | 'javascript';
      }
    }
    
    return maxScore > 0 ? detectedLanguage : 'other';
  }

  /**
   * Get context around code
   */
  private getCodeContext(transcript: WWDCTranscript, codeSegment: TranscriptSegment, code: string): string {
    const segments = transcript.segments;
    const index = segments.indexOf(codeSegment);
    
    // Get 2 segments before and after
    const contextSegments: string[] = [];
    
    for (let i = Math.max(0, index - 2); i <= Math.min(segments.length - 1, index + 2); i++) {
      contextSegments.push(segments[i].text);
    }
    
    return contextSegments.join(' ');
  }

  /**
   * Infer a title for the code
   */
  private inferCodeTitle(context: string, code: string): string | undefined {
    // Look for common title patterns in context
    const titlePatterns = [
      /(?:example|demo|shows?|demonstrates?|creates?|implements?|defines?)\s+(?:a\s+)?(\w+(?:\s+\w+){0,3})/i,
      /(?:this|here)\s+is\s+(?:a\s+)?(\w+(?:\s+\w+){0,3})/i,
      /(\w+(?:\s+\w+){0,3})\s+(?:example|implementation|definition)/i,
    ];
    
    for (const pattern of titlePatterns) {
      const match = context.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Try to infer from code structure
    if (code.includes('struct') || code.includes('class')) {
      const structMatch = code.match(/(?:struct|class)\s+(\w+)/);
      if (structMatch) {
        return `${structMatch[1]} Implementation`;
      }
    }
    
    if (code.includes('func')) {
      const funcMatch = code.match(/func\s+(\w+)/);
      if (funcMatch) {
        return `${funcMatch[1]} Function`;
      }
    }
    
    return undefined;
  }

  /**
   * Check if code is complete or a fragment
   */
  private isCompleteCode(code: string, language: 'swift' | 'objc' | 'javascript' | 'other'): boolean {
    if (language === 'swift') {
      return this.isCompleteSwiftCode(code);
    } else if (language === 'objc') {
      return this.isCompleteObjectiveCCode(code);
    } else if (language === 'javascript') {
      return this.isCompleteJavaScriptCode(code);
    }
    
    // For other languages, check basic completeness
    return this.hasBalancedBrackets(code);
  }

  /**
   * Check if Swift code is complete
   */
  private isCompleteSwiftCode(code: string): boolean {
    // Check for balanced brackets
    if (!this.hasBalancedBrackets(code)) {
      return false;
    }
    
    // Check for complete struct/class/function definitions
    const hasCompleteStructure = 
      (code.includes('struct') && !!code.match(/struct\s+\w+.*\{[\s\S]*\}/)) ||
      (code.includes('class') && !!code.match(/class\s+\w+.*\{[\s\S]*\}/)) ||
      (code.includes('func') && !!code.match(/func\s+\w+.*\{[\s\S]*\}/)) ||
      (code.includes('var body') && !!code.match(/var\s+body.*\{[\s\S]*\}/));
    
    return hasCompleteStructure || this.looksLikeCompleteStatement(code);
  }

  /**
   * Check if Objective-C code is complete
   */
  private isCompleteObjectiveCCode(code: string): boolean {
    if (!this.hasBalancedBrackets(code)) {
      return false;
    }
    
    // Check for complete interface/implementation
    const hasCompleteStructure = 
      (code.includes('@interface') && code.includes('@end')) ||
      (code.includes('@implementation') && code.includes('@end')) ||
      !!code.match(/^[+-]\s*\([^)]+\).*\{[\s\S]*\}/m); // Method implementation
    
    return hasCompleteStructure || this.looksLikeCompleteStatement(code);
  }

  /**
   * Check if JavaScript code is complete
   */
  private isCompleteJavaScriptCode(code: string): boolean {
    if (!this.hasBalancedBrackets(code)) {
      return false;
    }
    
    // Check for complete function/class definitions
    const hasCompleteStructure = 
      !!code.match(/function\s+\w+.*\{[\s\S]*\}/) ||
      !!code.match(/class\s+\w+.*\{[\s\S]*\}/) ||
      !!code.match(/\w+\s*=\s*.*=>\s*\{[\s\S]*\}/) || // Arrow function
      !!code.match(/\w+\s*:\s*function.*\{[\s\S]*\}/); // Object method
    
    return hasCompleteStructure || this.looksLikeCompleteStatement(code);
  }

  /**
   * Check if brackets are balanced
   */
  private hasBalancedBrackets(code: string): boolean {
    const brackets = {
      '{': '}',
      '[': ']',
      '(': ')'
    };
    
    const stack: string[] = [];
    const inString = { single: false, double: false };
    
    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const prevChar = i > 0 ? code[i - 1] : '';
      
      // Track string boundaries
      if (char === "'" && prevChar !== '\\') {
        inString.single = !inString.single;
      } else if (char === '"' && prevChar !== '\\') {
        inString.double = !inString.double;
      }
      
      // Skip characters inside strings
      if (inString.single || inString.double) {
        continue;
      }
      
      // Track brackets
      if (char in brackets) {
        stack.push(char);
      } else if (Object.values(brackets).includes(char)) {
        const expected = Object.entries(brackets).find(([_, close]) => close === char)?.[0];
        if (stack.length === 0 || stack.pop() !== expected) {
          return false;
        }
      }
    }
    
    return stack.length === 0;
  }

  /**
   * Check if code looks like a complete statement
   */
  private looksLikeCompleteStatement(code: string): boolean {
    const lines = code.split('\n').filter(line => line.trim());
    if (lines.length === 0) return false;
    
    // Check if it's a single complete statement
    const singleStatementPatterns = [
      /^(let|var|const)\s+\w+\s*=\s*.*[;]?$/, // Variable declaration
      /^\w+\.\w+\([^)]*\)[;]?$/, // Method call
      /^return\s+.*[;]?$/, // Return statement
      /^import\s+.*$/, // Import statement
    ];
    
    return singleStatementPatterns.some(pattern => pattern.test(code.trim()));
  }

  /**
   * Clean up extracted code
   */
  private cleanupCode(code: string): string {
    // Remove common transcript artifacts
    let cleaned = code
      .replace(/\[inaudible.*?\]/gi, '') // Remove inaudible markers
      .replace(/\[.*?\]/g, '') // Remove other brackets
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Fix common formatting issues
    cleaned = this.fixIndentation(cleaned);
    cleaned = this.fixLineBreaks(cleaned);
    
    return cleaned;
  }

  /**
   * Fix indentation in code
   */
  private fixIndentation(code: string): string {
    const lines = code.split('\n');
    if (lines.length <= 1) return code;
    
    // Find minimum indentation
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim()) {
        const indent = line.match(/^\s*/)?.[0].length || 0;
        minIndent = Math.min(minIndent, indent);
      }
    }
    
    // Remove minimum indentation from all lines
    if (minIndent > 0 && minIndent < Infinity) {
      return lines.map(line => line.substring(minIndent)).join('\n');
    }
    
    return code;
  }

  /**
   * Fix line breaks in code
   */
  private fixLineBreaks(code: string): string {
    // Add line breaks after common patterns
    return code
      .replace(/\{/g, ' {\n')
      .replace(/\}/g, '\n}')
      .replace(/;/g, ';\n')
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive empty lines
      .trim();
  }

  /**
   * Check if a range was already processed
   */
  private isRangeProcessed(index: number, processedRanges: Array<[number, number]>): boolean {
    return processedRanges.some(([start, end]) => index >= start && index <= end);
  }

  /**
   * Validate a code snippet
   */
  private validateCodeSnippet(code: string, language: 'swift' | 'objc' | 'javascript' | 'other'): boolean {
    // Basic validation
    if (code.length < 20) return false;
    if (!this.hasBalancedBrackets(code)) return false;
    
    // Language-specific validation
    if (language === 'swift') {
      return this.validateSwiftCode(code);
    } else if (language === 'objc') {
      return this.validateObjectiveCCode(code);
    } else if (language === 'javascript') {
      return this.validateJavaScriptCode(code);
    }
    
    return true;
  }

  /**
   * Validate Swift code
   */
  private validateSwiftCode(code: string): boolean {
    // Check for at least one Swift-specific pattern
    return Object.values(this.swiftValidationPatterns).some(pattern => pattern.test(code));
  }

  /**
   * Validate Objective-C code
   */
  private validateObjectiveCCode(code: string): boolean {
    const objcPatterns = [
      /#import/, /@interface/, /@implementation/, /@property/,
      /\[\s*\w+\s+\w+/, /NS\w+\s*\*/, /@selector/
    ];
    
    return objcPatterns.some(pattern => pattern.test(code));
  }

  /**
   * Validate JavaScript code
   */
  private validateJavaScriptCode(code: string): boolean {
    const jsPatterns = [
      /function\s+\w+/, /const\s+\w+/, /let\s+\w+/, /var\s+\w+/,
      /=>\s*\{/, /class\s+\w+/, /export\s+/, /import\s+/
    ];
    
    return jsPatterns.some(pattern => pattern.test(code));
  }

  /**
   * Merge related code fragments
   */
  private mergeRelatedCode(examples: WWDCCodeExample[]): WWDCCodeExample[] {
    if (examples.length <= 1) return examples;
    
    const merged: WWDCCodeExample[] = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < examples.length; i++) {
      if (processed.has(i)) continue;
      
      const current = examples[i];
      const related: WWDCCodeExample[] = [current];
      
      // Find related code within 10 seconds
      for (let j = i + 1; j < examples.length; j++) {
        const candidate = examples[j];
        
        if (Math.abs(candidate.timestamp - current.timestamp) <= 10 &&
            candidate.language === current.language &&
            this.areCodeFragmentsRelated(current.code, candidate.code)) {
          related.push(candidate);
          processed.add(j);
        }
      }
      
      // Merge if multiple related fragments found
      if (related.length > 1) {
        merged.push(this.mergeCodeFragments(related));
      } else {
        merged.push(current);
      }
    }
    
    return merged;
  }

  /**
   * Check if two code fragments are related
   */
  private areCodeFragmentsRelated(code1: string, code2: string): boolean {
    // Check for shared identifiers
    const identifiers1 = this.extractIdentifiers(code1);
    const identifiers2 = this.extractIdentifiers(code2);
    
    const shared = identifiers1.filter(id => identifiers2.includes(id));
    
    // Related if they share significant identifiers
    return shared.length >= Math.min(identifiers1.length, identifiers2.length) * 0.3;
  }

  /**
   * Extract identifiers from code
   */
  private extractIdentifiers(code: string): string[] {
    const identifierPattern = /\b[A-Za-z_]\w+\b/g;
    const matches = code.match(identifierPattern) || [];
    
    // Filter out common keywords
    const keywords = new Set([
      'let', 'var', 'const', 'func', 'function', 'class', 'struct',
      'if', 'else', 'for', 'while', 'return', 'import', 'export'
    ]);
    
    return matches.filter(id => !keywords.has(id));
  }

  /**
   * Merge multiple code fragments
   */
  private mergeCodeFragments(fragments: WWDCCodeExample[]): WWDCCodeExample {
    // Sort by timestamp
    fragments.sort((a, b) => a.timestamp - b.timestamp);
    
    // Merge code
    const mergedCode = fragments.map(f => f.code).join('\n\n');
    
    // Merge context
    const contexts = fragments.map(f => f.context).filter(Boolean);
    const mergedContext = contexts.join(' ');
    
    return {
      sessionId: fragments[0].sessionId,
      timestamp: fragments[0].timestamp,
      code: mergedCode,
      language: fragments[0].language,
      context: mergedContext,
      title: fragments[0].title || this.inferCodeTitle(mergedContext, mergedCode),
      isComplete: this.isCompleteCode(mergedCode, fragments[0].language)
    };
  }
}