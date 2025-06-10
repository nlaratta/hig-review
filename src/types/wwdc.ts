/**
 * WWDC-related type definitions for the Apple HIG MCP Server
 */

import { Platform } from './index.js';

/**
 * Represents a WWDC session
 */
export interface WWDCSession {
  /** Unique session ID (e.g., "wwdc2023-10052") */
  id: string;
  
  /** Year of the conference */
  year: number;
  
  /** Session title */
  title: string;
  
  /** Brief description of the session */
  description: string;
  
  /** Duration in seconds */
  duration: number;
  
  /** List of speaker names */
  speakers: string[];
  
  /** Related Apple platforms */
  platforms: Platform[];
  
  /** HIG topics covered in this session */
  topics: string[];
  
  /** Direct URL to the video */
  videoUrl: string;
  
  /** URL to the transcript file (optional) */
  transcriptUrl?: string;
  
  /** URL to additional resources (optional) */
  resourcesUrl?: string;
  
  /** URL to sample code (optional) */
  sampleCodeUrl?: string;
  
  /** When this session was indexed */
  timestamp: Date;
  
  /** Session thumbnail URL (optional) */
  thumbnailUrl?: string;
  
  /** Session tags for categorization */
  tags?: string[];
}

/**
 * Represents a WWDC session transcript
 */
export interface WWDCTranscript {
  /** Session ID this transcript belongs to */
  sessionId: string;
  
  /** Transcript segments */
  segments: TranscriptSegment[];
  
  /** Full transcript text for searching */
  fullText: string;
  
  /** Language of the transcript */
  language: string;
  
  /** Format of the original transcript file */
  format: 'vtt' | 'srt' | 'txt';
}

/**
 * Represents a segment of a transcript
 */
export interface TranscriptSegment {
  /** Start time in seconds */
  startTime: number;
  
  /** End time in seconds */
  endTime: number;
  
  /** Segment text content */
  text: string;
  
  /** Speaker name (if available) */
  speaker?: string;
  
  /** Whether this segment contains code */
  hasCode?: boolean;
  
  /** Confidence score for speech recognition (if available) */
  confidence?: number;
}

/**
 * Represents a code example extracted from a WWDC session
 */
export interface WWDCCodeExample {
  /** Session ID this code belongs to */
  sessionId: string;
  
  /** Timestamp in the video where this code appears */
  timestamp: number;
  
  /** The actual code snippet */
  code: string;
  
  /** Programming language */
  language: 'swift' | 'objc' | 'javascript' | 'other';
  
  /** Context or explanation around the code */
  context: string;
  
  /** Title or description of what this code demonstrates */
  title?: string;
  
  /** Whether this is a complete example or fragment */
  isComplete: boolean;
}

/**
 * Maps HIG guidelines to related WWDC sessions
 */
export interface HIGSessionMapping {
  /** HIG guideline ID */
  guidelineId: string;
  
  /** Related WWDC session IDs with relevance scores */
  sessions: RelatedSession[];
  
  /** When this mapping was last updated */
  lastUpdated: Date;
}

/**
 * Represents a related WWDC session with relevance score
 */
export interface RelatedSession {
  /** WWDC session */
  session: WWDCSession;
  
  /** Relevance score (0-1) */
  relevance: number;
  
  /** Reasons why this session is related */
  reasons?: string[];
  
  /** Specific timestamps that are relevant */
  relevantTimestamps?: number[];
}

/**
 * Search parameters for WWDC content
 */
export interface SearchWWDCParams {
  /** Search query */
  query: string;
  
  /** Filter by specific year */
  year?: number;
  
  /** Filter by platform */
  platform?: Platform;
  
  /** Where to search */
  searchIn?: 'all' | 'titles' | 'transcripts' | 'code';
  
  /** Include code examples in results */
  includeCode?: boolean;
  
  /** Maximum number of results */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
}

/**
 * Parameters for getting a specific session
 */
export interface GetSessionParams {
  /** Session ID */
  sessionId: string;
  
  /** Include full transcript */
  includeTranscript?: boolean;
  
  /** Include code examples */
  includeCode?: boolean;
  
  /** Jump to specific timestamp (in seconds) */
  timestamp?: number;
  
  /** Include related HIG guidelines */
  includeRelatedGuidelines?: boolean;
}

/**
 * Search result for WWDC content
 */
export interface WWDCSearchResult {
  /** The matching session */
  session: WWDCSession;
  
  /** Relevance score */
  score: number;
  
  /** Highlighted snippets from the match */
  highlights: string[];
  
  /** Matching transcript segments (if searching transcripts) */
  matchingSegments?: TranscriptSegment[];
  
  /** Matching code examples (if any) */
  matchingCode?: WWDCCodeExample[];
}

/**
 * Result from transcript search
 */
export interface TranscriptSearchResult {
  /** Session ID */
  sessionId: string;
  
  /** Matching segments with scores */
  matches: {
    segment: TranscriptSegment;
    score: number;
    highlightedText?: string;
  }[];
}

/**
 * Filters for WWDC search
 */
export interface WWDCSearchFilters {
  /** Filter by year(s) */
  year?: number | number[];
  
  /** Filter by platform(s) */
  platform?: Platform | Platform[];
  
  /** Filter by speaker(s) */
  speakers?: string[];
  
  /** Filter by tags */
  tags?: string[];
  
  /** Minimum duration in seconds */
  minDuration?: number;
  
  /** Maximum duration in seconds */
  maxDuration?: number;
  
  /** Only sessions with transcripts */
  hasTranscript?: boolean;
  
  /** Only sessions with code examples */
  hasCode?: boolean;
}

/**
 * Statistics for WWDC content
 */
export interface WWDCStats {
  /** Total number of indexed sessions */
  totalSessions: number;
  
  /** Sessions by year */
  sessionsByYear: Record<number, number>;
  
  /** Sessions with transcripts */
  sessionsWithTranscripts: number;
  
  /** Sessions with code examples */
  sessionsWithCode: number;
  
  /** Total code examples */
  totalCodeExamples: number;
  
  /** Last update timestamp */
  lastUpdated: Date;
}