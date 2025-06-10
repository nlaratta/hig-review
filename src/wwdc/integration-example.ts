/**
 * Integration example showing how CodeExtractor works with other WWDC components
 */

import { CodeExtractor } from './CodeExtractor.js';
import { TranscriptParser } from './TranscriptParser.js';
import { WWDCCodeExample, WWDCTranscript } from '../types/wwdc.js';
import { logger } from '../utils/logger.js';

/**
 * Service that integrates transcript parsing and code extraction
 */
export class WWDCCodeService {
  private transcriptParser: TranscriptParser;
  private codeExtractor: CodeExtractor;
  
  constructor() {
    this.transcriptParser = new TranscriptParser();
    this.codeExtractor = new CodeExtractor();
  }
  
  /**
   * Process a WWDC session transcript and extract all code examples
   */
  async processSession(
    transcriptContent: string, 
    sessionId: string, 
    format: 'vtt' | 'srt' = 'vtt'
  ): Promise<{
    transcript: WWDCTranscript;
    codeExamples: WWDCCodeExample[];
    statistics: CodeStatistics;
  }> {
    logger.info(`Processing session ${sessionId}...`);
    
    // Parse transcript
    const transcript = format === 'vtt' 
      ? this.transcriptParser.parseVTT(transcriptContent, sessionId)
      : this.transcriptParser.parseSRT(transcriptContent, sessionId);
    
    // Extract code examples
    const codeExamples = this.codeExtractor.extractFromTranscript(transcript);
    
    // Generate statistics
    const statistics = this.generateStatistics(codeExamples);
    
    logger.info(`Extracted ${codeExamples.length} code examples from ${sessionId}`);
    
    return {
      transcript,
      codeExamples,
      statistics
    };
  }
  
  /**
   * Search for code examples by language
   */
  filterByLanguage(
    examples: WWDCCodeExample[], 
    language: 'swift' | 'objc' | 'javascript'
  ): WWDCCodeExample[] {
    return examples.filter(example => example.language === language);
  }
  
  /**
   * Search for code examples by keyword
   */
  searchCodeExamples(
    examples: WWDCCodeExample[], 
    keywords: string[]
  ): WWDCCodeExample[] {
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    
    return examples.filter(example => {
      const searchText = `${example.code} ${example.context} ${example.title || ''}`.toLowerCase();
      return lowerKeywords.some(keyword => searchText.includes(keyword));
    });
  }
  
  /**
   * Get code examples at specific timestamps
   */
  getCodeAtTimestamp(
    examples: WWDCCodeExample[], 
    timestamp: number, 
    tolerance: number = 5
  ): WWDCCodeExample[] {
    return examples.filter(example => 
      Math.abs(example.timestamp - timestamp) <= tolerance
    );
  }
  
  /**
   * Group code examples by completeness
   */
  groupByCompleteness(examples: WWDCCodeExample[]): {
    complete: WWDCCodeExample[];
    fragments: WWDCCodeExample[];
  } {
    return {
      complete: examples.filter(e => e.isComplete),
      fragments: examples.filter(e => !e.isComplete)
    };
  }
  
  /**
   * Generate statistics about extracted code
   */
  private generateStatistics(examples: WWDCCodeExample[]): CodeStatistics {
    const languages = examples.reduce((acc, example) => {
      acc[example.language] = (acc[example.language] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const { complete, fragments } = this.groupByCompleteness(examples);
    
    const avgCodeLength = examples.reduce((sum, e) => sum + e.code.length, 0) / examples.length || 0;
    
    return {
      totalExamples: examples.length,
      byLanguage: languages,
      completeExamples: complete.length,
      fragmentExamples: fragments.length,
      averageCodeLength: Math.round(avgCodeLength),
      examplesWithTitles: examples.filter(e => e.title).length
    };
  }
  
  /**
   * Format code examples for display
   */
  formatCodeExample(example: WWDCCodeExample): string {
    const parts: string[] = [];
    
    // Header
    parts.push(`## ${example.title || 'Code Example'}`);
    parts.push(`**Language:** ${example.language}`);
    parts.push(`**Timestamp:** ${this.formatTimestamp(example.timestamp)}`);
    parts.push(`**Complete:** ${example.isComplete ? 'Yes' : 'No (fragment)'}`);
    
    // Code
    parts.push('');
    parts.push(`\`\`\`${example.language}`);
    parts.push(example.code);
    parts.push('```');
    
    // Context
    if (example.context) {
      parts.push('');
      parts.push('**Context:**');
      parts.push(`> ${example.context}`);
    }
    
    return parts.join('\n');
  }
  
  /**
   * Format timestamp for display
   */
  private formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
  
  /**
   * Export code examples to different formats
   */
  exportExamples(examples: WWDCCodeExample[], format: 'json' | 'markdown'): string {
    if (format === 'json') {
      return JSON.stringify(examples, null, 2);
    }
    
    // Markdown format
    const parts: string[] = [
      '# WWDC Code Examples',
      '',
      `Generated from ${examples.length} code examples`,
      '',
      '---',
      ''
    ];
    
    examples.forEach((example, index) => {
      parts.push(this.formatCodeExample(example));
      if (index < examples.length - 1) {
        parts.push('', '---', '');
      }
    });
    
    return parts.join('\n');
  }
}

/**
 * Statistics about extracted code
 */
interface CodeStatistics {
  totalExamples: number;
  byLanguage: Record<string, number>;
  completeExamples: number;
  fragmentExamples: number;
  averageCodeLength: number;
  examplesWithTitles: number;
}

/**
 * Example usage
 */
async function demonstrateIntegration() {
  const service = new WWDCCodeService();
  
  // Sample VTT content
  const vttContent = `WEBVTT

00:00:10.000 --> 00:00:15.000
Let's create a custom SwiftUI button with haptic feedback:

00:00:15.000 --> 00:00:25.000
struct HapticButton: View {
    let title: String
    let action: () -> Void
    @State private var isPressed = false
    
    var body: some View {
        Button(action: {
            let impactFeedback = UIImpactFeedbackGenerator(style: .medium)
            impactFeedback.impactOccurred()
            action()
        }) {
            Text(title)
                .scaleEffect(isPressed ? 0.95 : 1.0)
        }
        .onLongPressGesture(minimumDuration: 0, maximumDistance: .infinity, pressing: { pressing in
            withAnimation(.easeInOut(duration: 0.1)) {
                isPressed = pressing
            }
        }, perform: {})
    }
}

00:00:25.000 --> 00:00:30.000
This button provides visual and haptic feedback when tapped.`;
  
  // Process the session
  const result = await service.processSession(vttContent, 'wwdc2023-haptics');
  
  console.log('Processing Results:');
  console.log(`- Total segments: ${result.transcript.segments.length}`);
  console.log(`- Code examples found: ${result.codeExamples.length}`);
  console.log(`- Statistics:`, result.statistics);
  
  // Filter Swift examples
  const swiftExamples = service.filterByLanguage(result.codeExamples, 'swift');
  console.log(`\nSwift examples: ${swiftExamples.length}`);
  
  // Search for specific keywords
  const hapticExamples = service.searchCodeExamples(result.codeExamples, ['haptic', 'feedback']);
  console.log(`Examples with haptic feedback: ${hapticExamples.length}`);
  
  // Export to markdown
  const markdown = service.exportExamples(result.codeExamples, 'markdown');
  console.log('\nMarkdown Export Preview:');
  console.log(markdown.substring(0, 500) + '...');
}

// Run demonstration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateIntegration().catch(console.error);
}