/**
 * Parser for WWDC video transcripts in WebVTT format
 */

import { WWDCTranscript, TranscriptSegment } from '../types/wwdc.js';
import { logger } from '../utils/logger.js';

export class TranscriptParser {
  /**
   * Parse WebVTT format into structured transcript
   */
  parseVTT(vttContent: string, sessionId: string): WWDCTranscript {
    const segments = this.parseVTTSegments(vttContent);
    const fullText = segments.map(s => s.text).join(' ');

    return {
      sessionId,
      segments,
      fullText,
      language: 'en',
      format: 'vtt',
    };
  }

  /**
   * Parse VTT content into segments
   */
  private parseVTTSegments(vttContent: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    const lines = vttContent.split('\n');
    
    let currentSegment: Partial<TranscriptSegment> = {};
    let isInCue = false;
    let textBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and headers
      if (!line || line === 'WEBVTT' || line.startsWith('NOTE')) {
        if (isInCue && textBuffer.length > 0) {
          // End of current cue
          currentSegment.text = textBuffer.join(' ').trim();
          if (currentSegment.startTime !== undefined && currentSegment.endTime !== undefined) {
            segments.push({
              ...currentSegment,
              hasCode: this.detectCode(currentSegment.text || ''),
            } as TranscriptSegment);
          }
          currentSegment = {};
          textBuffer = [];
          isInCue = false;
        }
        continue;
      }

      // Check for timestamp line (e.g., "00:00:12.500 --> 00:00:15.000")
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->').map(s => s.trim());
        currentSegment.startTime = this.parseTimestamp(startStr);
        currentSegment.endTime = this.parseTimestamp(endStr);
        isInCue = true;
        continue;
      }

      // If we're in a cue and the line isn't a cue identifier (number), add to text
      if (isInCue && !/^\d+$/.test(line)) {
        textBuffer.push(line);
      }
    }

    // Handle last segment if exists
    if (isInCue && textBuffer.length > 0) {
      currentSegment.text = textBuffer.join(' ').trim();
      if (currentSegment.startTime !== undefined && currentSegment.endTime !== undefined) {
        segments.push({
          ...currentSegment,
          hasCode: this.detectCode(currentSegment.text || ''),
        } as TranscriptSegment);
      }
    }

    logger.info(`Parsed ${segments.length} segments from VTT`);
    return segments;
  }

  /**
   * Parse SRT format (alternative format)
   */
  parseSRT(srtContent: string, sessionId: string): WWDCTranscript {
    const segments = this.parseSRTSegments(srtContent);
    const fullText = segments.map(s => s.text).join(' ');

    return {
      sessionId,
      segments,
      fullText,
      language: 'en',
      format: 'srt',
    };
  }

  /**
   * Parse SRT content into segments
   */
  private parseSRTSegments(srtContent: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    const blocks = srtContent.split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;

      // Line 0: sequence number (skip)
      // Line 1: timestamps
      // Line 2+: text

      const timestampLine = lines[1];
      if (!timestampLine || !timestampLine.includes('-->')) continue;

      const [startStr, endStr] = timestampLine.split('-->').map(s => s.trim());
      const text = lines.slice(2).join(' ').trim();

      segments.push({
        startTime: this.parseSRTTimestamp(startStr),
        endTime: this.parseSRTTimestamp(endStr),
        text,
        hasCode: this.detectCode(text),
      });
    }

    return segments;
  }

  /**
   * Parse VTT timestamp format (HH:MM:SS.mmm or MM:SS.mmm)
   */
  private parseTimestamp(timestamp: string): number {
    const parts = timestamp.split(':');
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (parts.length === 3) {
      // HH:MM:SS.mmm
      hours = parseInt(parts[0]) || 0;
      minutes = parseInt(parts[1]) || 0;
      seconds = parseFloat(parts[2]) || 0;
    } else if (parts.length === 2) {
      // MM:SS.mmm
      minutes = parseInt(parts[0]) || 0;
      seconds = parseFloat(parts[1]) || 0;
    }

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Parse SRT timestamp format (HH:MM:SS,mmm)
   */
  private parseSRTTimestamp(timestamp: string): number {
    // Replace comma with period for parsing
    return this.parseTimestamp(timestamp.replace(',', '.'));
  }

  /**
   * Extract keywords from transcript for indexing
   */
  extractKeywords(transcript: WWDCTranscript): string[] {
    const text = transcript.fullText.toLowerCase();
    const words = text.split(/\s+/);
    
    // Common words to exclude
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'as', 'are',
      'been', 'by', 'for', 'from', 'has', 'have', 'in', 'of', 'or',
      'that', 'to', 'was', 'will', 'with', 'what', 'when', 'where',
      'who', 'why', 'how', 'this', 'that', 'these', 'those', 'it',
      'we', 'you', 'they', 'i', 'me', 'he', 'she', 'us', 'them',
    ]);

    // Technical keywords to prioritize
    const technicalPatterns = [
      /swift/i, /objc/i, /objective-c/i, /xcode/i,
      /uikit/i, /swiftui/i, /appkit/i, /watchkit/i,
      /combine/i, /coredata/i, /cloudkit/i,
      /widget/i, /extension/i, /framework/i,
      /api/i, /sdk/i, /protocol/i, /delegate/i,
      /navigation/i, /view/i, /controller/i,
      /animation/i, /gesture/i, /layout/i,
    ];

    const keywords = new Set<string>();

    // Extract technical terms
    for (const word of words) {
      if (word.length > 3 && !stopWords.has(word)) {
        for (const pattern of technicalPatterns) {
          if (pattern.test(word)) {
            keywords.add(word);
            break;
          }
        }
      }
    }

    // Also extract common technical terms
    const commonTerms = [
      'performance', 'optimization', 'memory', 'battery',
      'accessibility', 'localization', 'testing', 'debugging',
      'design', 'interface', 'user experience', 'guidelines',
      'best practices', 'architecture', 'patterns',
    ];

    for (const term of commonTerms) {
      if (text.includes(term.toLowerCase())) {
        keywords.add(term);
      }
    }

    return Array.from(keywords);
  }

  /**
   * Find code-related segments in the transcript
   */
  findCodeSegments(transcript: WWDCTranscript): TranscriptSegment[] {
    return transcript.segments.filter(segment => segment.hasCode === true);
  }

  /**
   * Detect if a text segment likely contains code
   */
  private detectCode(text: string): boolean {
    // Swift/ObjC code indicators
    const codePatterns = [
      // Variable declarations
      /\b(let|var|const)\s+\w+\s*[=:]/,
      
      // Function/method declarations
      /\b(func|function|method)\s+\w+/,
      
      // Class/struct/enum declarations
      /\b(class|struct|enum|protocol|interface)\s+\w+/,
      
      // Import statements
      /\b(import|#import)\s+\w+/,
      
      // Swift attributes
      /@\w+(\([^)]*\))?/,
      
      // Property wrappers
      /@(State|Binding|Published|ObservedObject|StateObject|Environment)/,
      
      // Common Swift/ObjC keywords
      /\b(if|else|for|while|switch|case|return|throw|try|catch)\b/,
      
      // Function calls with parentheses
      /\w+\([^)]*\)/,
      
      // Dot notation
      /\w+\.\w+/,
      
      // Array/Dictionary literals
      /\[[^\]]*\]/,
      
      // Type annotations
      /:\s*\w+[<>]?/,
      
      // Closures
      /\{\s*\w*\s*in\b/,
      
      // Comments
      /\/\/|\/\*|\*\//,
    ];

    // Check if text matches any code pattern
    return codePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Extract speaker information from cue settings if available
   */
  private extractSpeaker(cueSettings: string): string | undefined {
    // VTT can include speaker info in cue settings
    // Format: <v Speaker Name>
    const speakerMatch = cueSettings.match(/<v\s+([^>]+)>/);
    return speakerMatch ? speakerMatch[1].trim() : undefined;
  }

  /**
   * Search for specific terms in transcript
   */
  searchTranscript(transcript: WWDCTranscript, searchTerms: string[]): TranscriptSegment[] {
    const lowerTerms = searchTerms.map(term => term.toLowerCase());
    
    return transcript.segments.filter(segment => {
      const lowerText = segment.text.toLowerCase();
      return lowerTerms.some(term => lowerText.includes(term));
    });
  }

  /**
   * Get segments within a time range
   */
  getSegmentsInRange(
    transcript: WWDCTranscript, 
    startTime: number, 
    endTime: number
  ): TranscriptSegment[] {
    return transcript.segments.filter(
      segment => segment.startTime >= startTime && segment.endTime <= endTime
    );
  }

  /**
   * Merge adjacent segments for better readability
   */
  mergeSegments(
    segments: TranscriptSegment[], 
    maxGap: number = 2
  ): TranscriptSegment[] {
    if (segments.length === 0) return [];

    const merged: TranscriptSegment[] = [];
    let current = { ...segments[0] };

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i];
      
      // Check if segments are close enough to merge
      if (segment.startTime - current.endTime <= maxGap) {
        // Merge segments
        current.endTime = segment.endTime;
        current.text += ' ' + segment.text;
        current.hasCode = current.hasCode || segment.hasCode;
      } else {
        // Gap too large, save current and start new
        merged.push(current);
        current = { ...segment };
      }
    }

    // Don't forget the last segment
    merged.push(current);

    return merged;
  }
}