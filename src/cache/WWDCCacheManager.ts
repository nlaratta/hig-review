/**
 * Cache manager specifically for WWDC content
 */

import NodeCache from 'node-cache';
import { CacheManager } from './CacheManager.js';
import { CacheOptions } from './types.js';
import { WWDCSession, WWDCTranscript, WWDCCodeExample } from '../types/wwdc.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';

interface WWDCCacheConfig extends CacheOptions {
  baseDir?: string;
  sessionTTL?: number;
  transcriptTTL?: number;
  codeTTL?: number;
}

export class WWDCCacheManager extends CacheManager {
  private sessionCache: NodeCache;
  private transcriptCache: NodeCache;
  private codeCache: NodeCache;
  private readonly cacheDir: string;

  constructor(config: WWDCCacheConfig = {}) {
    // Call parent constructor with base options
    super({
      ...config,
      baseDir: config.baseDir || './cache/wwdc',
    });

    this.cacheDir = config.baseDir || './cache/wwdc';

    // Initialize specialized caches for different content types
    this.sessionCache = new NodeCache({
      stdTTL: config.sessionTTL || 604800, // 1 week for session metadata
      checkperiod: 3600, // Check every hour
      useClones: false, // Don't clone for performance
    });

    this.transcriptCache = new NodeCache({
      stdTTL: config.transcriptTTL || 2592000, // 30 days for transcripts
      checkperiod: 86400, // Check daily
      useClones: false,
    });

    this.codeCache = new NodeCache({
      stdTTL: config.codeTTL || 1209600, // 2 weeks for code examples
      checkperiod: 43200, // Check twice daily
      useClones: false,
    });

    // Set up cache statistics logging
    this.setupStatsLogging();
  }

  /**
   * Store a WWDC session
   */
  async storeSession(session: WWDCSession): Promise<void> {
    const key = this.getSessionKey(session.id);
    
    // Store in memory cache
    this.sessionCache.set(key, session);
    
    // Store to disk
    await this.persistToDisk('sessions', session.id, session);
    
    logger.debug(`Cached session: ${session.id}`);
  }

  /**
   * Get a WWDC session
   */
  async getSession(sessionId: string): Promise<WWDCSession | null> {
    const key = this.getSessionKey(sessionId);
    
    // Check memory cache first
    const cached = this.sessionCache.get<WWDCSession>(key);
    if (cached) {
      return cached;
    }
    
    // Check disk cache
    const diskData = await this.loadFromDisk<WWDCSession>('sessions', sessionId);
    if (diskData) {
      // Restore to memory cache
      this.sessionCache.set(key, diskData);
      return diskData;
    }
    
    return null;
  }

  /**
   * Store a transcript
   */
  async storeTranscript(transcript: WWDCTranscript): Promise<void> {
    const key = this.getTranscriptKey(transcript.sessionId);
    
    // Store in memory cache
    this.transcriptCache.set(key, transcript);
    
    // Store to disk
    await this.persistToDisk('transcripts', transcript.sessionId, transcript);
    
    logger.debug(`Cached transcript: ${transcript.sessionId}`);
  }

  /**
   * Get a transcript
   */
  async getTranscript(sessionId: string): Promise<WWDCTranscript | null> {
    const key = this.getTranscriptKey(sessionId);
    
    // Check memory cache first
    const cached = this.transcriptCache.get<WWDCTranscript>(key);
    if (cached) {
      return cached;
    }
    
    // Check disk cache
    const diskData = await this.loadFromDisk<WWDCTranscript>('transcripts', sessionId);
    if (diskData) {
      // Restore to memory cache
      this.transcriptCache.set(key, diskData);
      return diskData;
    }
    
    return null;
  }

  /**
   * Store code examples for a session
   */
  async storeCodeExamples(sessionId: string, examples: WWDCCodeExample[]): Promise<void> {
    const key = this.getCodeKey(sessionId);
    
    // Store in memory cache
    this.codeCache.set(key, examples);
    
    // Store to disk
    await this.persistToDisk('code', sessionId, examples);
    
    logger.debug(`Cached ${examples.length} code examples for: ${sessionId}`);
  }

  /**
   * Get code examples for a session
   */
  async getCodeExamples(sessionId: string): Promise<WWDCCodeExample[] | null> {
    const key = this.getCodeKey(sessionId);
    
    // Check memory cache first
    const cached = this.codeCache.get<WWDCCodeExample[]>(key);
    if (cached) {
      return cached;
    }
    
    // Check disk cache
    const diskData = await this.loadFromDisk<WWDCCodeExample[]>('code', sessionId);
    if (diskData) {
      // Restore to memory cache
      this.codeCache.set(key, diskData);
      return diskData;
    }
    
    return null;
  }

  /**
   * Get all sessions by year
   */
  async getSessionsByYear(year: number): Promise<WWDCSession[]> {
    const sessions: WWDCSession[] = [];
    
    // First check memory cache
    const allKeys = this.sessionCache.keys();
    for (const key of allKeys) {
      const session = this.sessionCache.get<WWDCSession>(key);
      if (session?.year === year) {
        sessions.push(session);
      }
    }
    
    // If we don't have many in memory, check disk
    if (sessions.length < 10) {
      const diskSessions = await this.loadSessionsFromDisk(year);
      for (const session of diskSessions) {
        if (!sessions.find(s => s.id === session.id)) {
          sessions.push(session);
          // Add to memory cache
          this.sessionCache.set(this.getSessionKey(session.id), session);
        }
      }
    }
    
    return sessions;
  }

  /**
   * Search sessions by topic
   */
  async searchSessionsByTopic(topic: string): Promise<WWDCSession[]> {
    const sessions: WWDCSession[] = [];
    const lowerTopic = topic.toLowerCase();
    
    // Search in memory cache
    const allKeys = this.sessionCache.keys();
    for (const key of allKeys) {
      const session = this.sessionCache.get<WWDCSession>(key);
      if (session && session.topics.some(t => t.toLowerCase().includes(lowerTopic))) {
        sessions.push(session);
      }
    }
    
    return sessions;
  }

  /**
   * Get cache statistics
   */
  async getWWDCStats(): Promise<any> {
    const baseStats = await this.getStats();
    
    return {
      ...baseStats,
      wwdc: {
        sessions: {
          cached: this.sessionCache.keys().length,
          hits: this.sessionCache.getStats().hits,
          misses: this.sessionCache.getStats().misses,
        },
        transcripts: {
          cached: this.transcriptCache.keys().length,
          hits: this.transcriptCache.getStats().hits,
          misses: this.transcriptCache.getStats().misses,
        },
        code: {
          cached: this.codeCache.keys().length,
          hits: this.codeCache.getStats().hits,
          misses: this.codeCache.getStats().misses,
        },
      },
    };
  }

  /**
   * Clear all WWDC caches
   */
  async clearWWDC(): Promise<void> {
    this.sessionCache.flushAll();
    this.transcriptCache.flushAll();
    this.codeCache.flushAll();
    
    // Also clear disk cache
    const dirs = ['sessions', 'transcripts', 'code'];
    for (const dir of dirs) {
      const dirPath = path.join(this.cacheDir, dir);
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
        await fs.mkdir(dirPath, { recursive: true });
      } catch (error) {
        logger.error(`Failed to clear ${dir} cache`, error);
      }
    }
  }

  /**
   * Warm the cache with recent WWDC content
   */
  async warmWWDCCache(years: number[]): Promise<void> {
    logger.info(`Warming WWDC cache for years: ${years.join(', ')}`);
    
    for (const year of years) {
      try {
        const sessions = await this.loadSessionsFromDisk(year);
        for (const session of sessions) {
          this.sessionCache.set(this.getSessionKey(session.id), session);
        }
        logger.info(`Loaded ${sessions.length} sessions from ${year} into cache`);
      } catch (error) {
        logger.error(`Failed to warm cache for year ${year}`, error);
      }
    }
  }

  /**
   * Persist data to disk
   */
  private async persistToDisk<T>(
    category: string,
    id: string,
    data: T
  ): Promise<void> {
    const dir = path.join(this.cacheDir, category);
    const filePath = path.join(dir, `${id}.json`);
    
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error(`Failed to persist ${category}/${id} to disk`, error);
    }
  }

  /**
   * Load data from disk
   */
  private async loadFromDisk<T>(
    category: string,
    id: string
  ): Promise<T | null> {
    const filePath = path.join(this.cacheDir, category, `${id}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.error(`Failed to load ${category}/${id} from disk`, error);
      }
      return null;
    }
  }

  /**
   * Load sessions from disk for a specific year
   */
  private async loadSessionsFromDisk(year: number): Promise<WWDCSession[]> {
    const sessions: WWDCSession[] = [];
    const dir = path.join(this.cacheDir, 'sessions');
    
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.includes(`wwdc${year}`) && file.endsWith('.json')) {
          const data = await fs.readFile(path.join(dir, file), 'utf-8');
          const session = JSON.parse(data) as WWDCSession;
          sessions.push(session);
        }
      }
    } catch (error) {
      logger.error(`Failed to load sessions from disk for year ${year}`, error);
    }
    
    return sessions;
  }

  /**
   * Generate cache keys
   */
  private getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private getTranscriptKey(sessionId: string): string {
    return `transcript:${sessionId}`;
  }

  private getCodeKey(sessionId: string): string {
    return `code:${sessionId}`;
  }

  /**
   * Set up periodic stats logging
   */
  private setupStatsLogging(): void {
    setInterval(async () => {
      const stats = await this.getWWDCStats();
      logger.debug('WWDC Cache Stats', stats);
    }, 300000); // Log every 5 minutes
  }

  /**
   * Close and cleanup
   */
  async close(): Promise<void> {
    // Flush all caches to disk before closing
    const allSessionKeys = this.sessionCache.keys();
    for (const key of allSessionKeys) {
      const session = this.sessionCache.get<WWDCSession>(key);
      if (session) {
        await this.persistToDisk('sessions', session.id, session);
      }
    }

    const allTranscriptKeys = this.transcriptCache.keys();
    for (const key of allTranscriptKeys) {
      const transcript = this.transcriptCache.get<WWDCTranscript>(key);
      if (transcript) {
        await this.persistToDisk('transcripts', transcript.sessionId, transcript);
      }
    }

    // Call parent close
    await super.close();
  }
}