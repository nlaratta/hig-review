import { GetSessionParams, WWDCSession, WWDCTranscript, WWDCCodeExample, HIGSearchResult } from '../types/index.js';
import { WWDCCacheManager } from '../cache/WWDCCacheManager.js';
import { HIGWWDCLinker } from '../integration/HIGWWDCLinker.js';
import { HIGSearchEngine } from './searchHIG.js';
import { logger } from '../utils/logger.js';

/**
 * GetSession - Fetches and returns WWDC session details with optional related content
 */
export class GetSession {
  private cacheManager: WWDCCacheManager;
  private linker: HIGWWDCLinker;
  private searchEngine: HIGSearchEngine;

  constructor(cacheManager: WWDCCacheManager) {
    this.cacheManager = cacheManager;
    this.searchEngine = new HIGSearchEngine();
    this.linker = new HIGWWDCLinker(this.searchEngine);
  }

  /**
   * Execute the getSession tool
   */
  public async execute(params: GetSessionParams): Promise<any> {
    const {
      sessionId,
      includeTranscript = false,
      includeCode = false,
      timestamp,
      includeRelatedGuidelines = false
    } = params;

    logger.info('Fetching WWDC session', { 
      sessionId, 
      includeTranscript, 
      includeCode, 
      timestamp,
      includeRelatedGuidelines 
    });

    try {
      // Initialize search engine if needed for related guidelines
      if (includeRelatedGuidelines) {
        await this.searchEngine.initialize();
      }
      // Get session from cache or fetch if needed
      const session = await this.getSessionDetails(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Build response
      const response: any = {
        session: this.formatSessionMetadata(session)
      };

      // Add transcript if requested
      if (includeTranscript) {
        const transcript = await this.getTranscript(sessionId);
        if (transcript) {
          response.transcript = this.formatTranscript(transcript, timestamp);
        }
      }

      // Add code examples if requested
      if (includeCode) {
        const codeExamples = await this.getCodeExamples(sessionId);
        if (codeExamples && codeExamples.length > 0) {
          response.codeExamples = this.formatCodeExamples(codeExamples, timestamp);
        }
      }

      // Add related guidelines if requested
      if (includeRelatedGuidelines) {
        const relatedGuidelines = await this.getRelatedGuidelines(session);
        if (relatedGuidelines && relatedGuidelines.length > 0) {
          response.relatedGuidelines = relatedGuidelines;
        }
      }

      // Add direct video link with timestamp
      response.videoLink = this.buildVideoLink(session, timestamp);

      return {
        content: [
          {
            type: 'text',
            text: this.formatResponse(response)
          }
        ]
      };
    } catch (error) {
      logger.error('Failed to fetch session', { sessionId, error });
      throw new Error(`Failed to fetch session ${sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get session details from cache or fetch if needed
   */
  private async getSessionDetails(sessionId: string): Promise<WWDCSession | null> {
    // First try to get from cache
    let session = await this.cacheManager.getSession(sessionId);
    
    if (!session) {
      // If not in cache, we would need to fetch from WWDC site
      // For now, we'll return null as fetching logic would be complex
      logger.warn('Session not found in cache', { sessionId });
      return null;
    }

    return session;
  }

  /**
   * Get transcript from cache
   */
  private async getTranscript(sessionId: string): Promise<WWDCTranscript | null> {
    return await this.cacheManager.getTranscript(sessionId);
  }

  /**
   * Get code examples from cache
   */
  private async getCodeExamples(sessionId: string): Promise<WWDCCodeExample[] | null> {
    return await this.cacheManager.getCodeExamples(sessionId);
  }

  /**
   * Get related HIG guidelines for a session
   */
  private async getRelatedGuidelines(session: WWDCSession): Promise<HIGSearchResult[]> {
    try {
      return await this.linker.findRelatedGuidelines(session, 5);
    } catch (error) {
      logger.error('Failed to find related guidelines', { sessionId: session.id, error });
      return [];
    }
  }

  /**
   * Format session metadata for response
   */
  private formatSessionMetadata(session: WWDCSession): any {
    return {
      id: session.id,
      year: session.year,
      title: session.title,
      description: session.description,
      duration: this.formatDuration(session.duration),
      speakers: session.speakers,
      platforms: session.platforms,
      topics: session.topics,
      tags: session.tags || [],
      thumbnailUrl: session.thumbnailUrl,
      resources: {
        video: session.videoUrl,
        transcript: session.transcriptUrl,
        resources: session.resourcesUrl,
        sampleCode: session.sampleCodeUrl
      }
    };
  }

  /**
   * Format transcript for response
   */
  private formatTranscript(transcript: WWDCTranscript, timestamp?: number): any {
    if (timestamp !== undefined) {
      // Return segments around the timestamp
      const relevantSegments = transcript.segments.filter(segment => 
        Math.abs(segment.startTime - timestamp) <= 60 || // Within 60 seconds
        (segment.startTime <= timestamp && segment.endTime >= timestamp) // Contains timestamp
      );

      return {
        segments: relevantSegments.map(this.formatSegment),
        jumpToTimestamp: timestamp
      };
    }

    // Return all segments
    return {
      segments: transcript.segments.map(this.formatSegment),
      language: transcript.language,
      format: transcript.format
    };
  }

  /**
   * Format a single transcript segment
   */
  private formatSegment(segment: any): any {
    return {
      time: `${Math.floor(segment.startTime / 60)}:${(segment.startTime % 60).toString().padStart(2, '0')}`,
      duration: segment.endTime - segment.startTime,
      text: segment.text,
      speaker: segment.speaker,
      hasCode: segment.hasCode || false
    };
  }

  /**
   * Format code examples for response
   */
  private formatCodeExamples(examples: WWDCCodeExample[], timestamp?: number): any[] {
    let relevantExamples = examples;

    if (timestamp !== undefined) {
      // Filter examples near the timestamp
      relevantExamples = examples.filter(example =>
        Math.abs(example.timestamp - timestamp) <= 120 // Within 2 minutes
      );
    }

    return relevantExamples.map(example => ({
      title: example.title || 'Code Example',
      timestamp: example.timestamp,
      time: `${Math.floor(example.timestamp / 60)}:${(example.timestamp % 60).toString().padStart(2, '0')}`,
      language: example.language,
      code: example.code,
      context: example.context,
      isComplete: example.isComplete
    }));
  }

  /**
   * Build direct video link with optional timestamp
   */
  private buildVideoLink(session: WWDCSession, timestamp?: number): string {
    let link = session.videoUrl;
    
    if (timestamp !== undefined && link.includes('developer.apple.com')) {
      // Apple's video player supports time parameter
      const separator = link.includes('?') ? '&' : '?';
      link += `${separator}time=${timestamp}`;
    }

    return link;
  }

  /**
   * Format duration from seconds to human-readable string
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Format the complete response as text
   */
  private formatResponse(response: any): string {
    let output = `# ${response.session.title}\n\n`;
    
    // Session metadata
    output += `## Session Information\n`;
    output += `- **Year**: WWDC ${response.session.year}\n`;
    output += `- **Duration**: ${response.session.duration}\n`;
    output += `- **Speakers**: ${response.session.speakers.join(', ')}\n`;
    output += `- **Platforms**: ${response.session.platforms.join(', ')}\n`;
    
    if (response.session.topics.length > 0) {
      output += `- **Topics**: ${response.session.topics.join(', ')}\n`;
    }
    
    if (response.session.tags.length > 0) {
      output += `- **Tags**: ${response.session.tags.join(', ')}\n`;
    }
    
    output += `\n## Description\n${response.session.description}\n\n`;
    
    // Video link
    output += `## Watch Session\n[View Session Video](${response.videoLink})\n\n`;
    
    // Resources
    if (Object.values(response.session.resources).some(r => r)) {
      output += `## Resources\n`;
      if (response.session.resources.transcript) {
        output += `- [Transcript](${response.session.resources.transcript})\n`;
      }
      if (response.session.resources.sampleCode) {
        output += `- [Sample Code](${response.session.resources.sampleCode})\n`;
      }
      if (response.session.resources.resources) {
        output += `- [Additional Resources](${response.session.resources.resources})\n`;
      }
      output += '\n';
    }
    
    // Transcript segments
    if (response.transcript) {
      output += `## Transcript${response.transcript.jumpToTimestamp ? ` (at ${Math.floor(response.transcript.jumpToTimestamp / 60)}:${(response.transcript.jumpToTimestamp % 60).toString().padStart(2, '0')})` : ''}\n`;
      response.transcript.segments.forEach((segment: any) => {
        output += `\n**[${segment.time}]**${segment.speaker ? ` ${segment.speaker}:` : ''}\n${segment.text}\n`;
      });
      output += '\n';
    }
    
    // Code examples
    if (response.codeExamples && response.codeExamples.length > 0) {
      output += `## Code Examples\n`;
      response.codeExamples.forEach((example: any) => {
        output += `\n### ${example.title} [${example.time}]\n`;
        if (example.context) {
          output += `${example.context}\n\n`;
        }
        output += `\`\`\`${example.language}\n${example.code}\n\`\`\`\n`;
      });
      output += '\n';
    }
    
    // Related guidelines
    if (response.relatedGuidelines && response.relatedGuidelines.length > 0) {
      output += `## Related HIG Guidelines\n`;
      response.relatedGuidelines.forEach((guideline: HIGSearchResult) => {
        output += `- **[${guideline.title}](${guideline.url})** (${guideline.platform})\n`;
        output += `  ${guideline.description}\n`;
      });
    }
    
    return output;
  }
}

// Export a singleton instance
let getSessionInstance: GetSession | null = null;

export function initializeGetSession(cacheManager: WWDCCacheManager): GetSession {
  if (!getSessionInstance) {
    getSessionInstance = new GetSession(cacheManager);
  }
  return getSessionInstance;
}

export function getSession(): GetSession {
  if (!getSessionInstance) {
    throw new Error('GetSession tool not initialized. Call initializeGetSession first.');
  }
  return getSessionInstance;
}