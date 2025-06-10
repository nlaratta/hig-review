#!/usr/bin/env node

/**
 * WWDC Session Scraper Script
 * 
 * This script scrapes WWDC sessions for specified years, downloads transcripts,
 * extracts code examples, stores everything in cache, and builds search indexes.
 * 
 * Usage:
 *   npm run scrape:wwdc -- [options]
 * 
 * Options:
 *   --years <years>       Comma-separated years (default: 2022,2023,2024)
 *   --incremental         Only scrape new/updated sessions
 *   --rebuild-index       Force rebuild of search index
 *   --max-concurrent <n>  Max concurrent scraping operations (default: 3)
 *   --session <id>        Scrape a specific session ID
 *   --dry-run            Show what would be scraped without actually doing it
 *   --verbose            Enable verbose logging
 */

import { Command } from 'commander';
import { BrowserManager } from '../src/scraper/BrowserManager.js';
import { WWDCScraper } from '../src/wwdc/WWDCScraper.js';
import { TranscriptParser } from '../src/wwdc/TranscriptParser.js';
import { CodeExtractor } from '../src/wwdc/CodeExtractor.js';
import { SessionIndexer } from '../src/wwdc/SessionIndexer.js';
import { WWDCCacheManager } from '../src/cache/WWDCCacheManager.js';
import { logger } from '../src/utils/logger.js';
import { WWDCSession, WWDCTranscript, WWDCCodeExample } from '../src/types/wwdc.js';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

interface ScraperOptions {
  years: number[];
  incremental: boolean;
  rebuildIndex: boolean;
  maxConcurrent: number;
  session?: string;
  dryRun: boolean;
  verbose: boolean;
}

interface ScraperProgress {
  totalSessions: number;
  scrapedSessions: number;
  failedSessions: number;
  totalTranscripts: number;
  downloadedTranscripts: number;
  failedTranscripts: number;
  totalCodeExamples: number;
  startTime: number;
  errors: Array<{ sessionId: string; error: string; phase: string }>;
}

class WWDCScraperCLI {
  private browserManager: BrowserManager;
  private scraper: WWDCScraper;
  private parser: TranscriptParser;
  private codeExtractor: CodeExtractor;
  private indexer: SessionIndexer;
  private cache: WWDCCacheManager;
  private progress: ScraperProgress;
  private progressFile: string;
  private options: ScraperOptions;

  constructor(options: ScraperOptions) {
    this.options = options;
    this.browserManager = new BrowserManager({ headless: !options.verbose });
    this.scraper = new WWDCScraper(this.browserManager);
    this.parser = new TranscriptParser();
    this.codeExtractor = new CodeExtractor();
    this.indexer = new SessionIndexer();
    this.cache = new WWDCCacheManager({ baseDir: './cache/wwdc' });
    
    this.progressFile = './cache/wwdc/scraper-progress.json';
    this.progress = {
      totalSessions: 0,
      scrapedSessions: 0,
      failedSessions: 0,
      totalTranscripts: 0,
      downloadedTranscripts: 0,
      failedTranscripts: 0,
      totalCodeExamples: 0,
      startTime: Date.now(),
      errors: []
    };

    // Set up graceful shutdown
    process.on('SIGINT', () => this.handleShutdown());
    process.on('SIGTERM', () => this.handleShutdown());
  }

  async run(): Promise<void> {
    console.log(chalk.blue.bold('🎬 WWDC Session Scraper'));
    console.log(chalk.gray('─'.repeat(50)));

    try {
      // Initialize browser
      if (!this.options.dryRun) {
        await this.browserManager.initialize();
      }

      // Load previous progress if resuming
      if (this.options.incremental) {
        await this.loadProgress();
      }

      if (this.options.session) {
        // Scrape specific session
        await this.scrapeSpecificSession(this.options.session);
      } else {
        // Scrape by years
        await this.scrapeYears(this.options.years);
      }

      // Build search index
      if (!this.options.dryRun && (this.options.rebuildIndex || this.progress.scrapedSessions > 0)) {
        await this.buildSearchIndex();
      }

      // Print final summary
      this.printSummary();

    } catch (error) {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  private async scrapeYears(years: number[]): Promise<void> {
    for (const year of years) {
      console.log(chalk.yellow(`\n📅 Processing WWDC ${year}`));
      
      try {
        // Get session list for the year
        const spinner = ora(`Fetching session list for ${year}...`).start();
        
        let sessions: WWDCSession[];
        if (this.options.dryRun) {
          spinner.info('Dry run - would fetch session list');
          sessions = [];
        } else {
          sessions = await this.scraper.scrapeSessionList(year);
          spinner.succeed(`Found ${sessions.length} sessions for WWDC ${year}`);
        }

        this.progress.totalSessions += sessions.length;

        // Process each session
        for (let i = 0; i < sessions.length; i++) {
          const session = sessions[i];
          
          // Check if we should skip (incremental mode)
          if (this.options.incremental && await this.isSessionCached(session.id)) {
            if (this.options.verbose) {
              console.log(chalk.gray(`  ⏭️  Skipping cached session: ${session.id}`));
            }
            continue;
          }

          // Process session with progress indicator
          const sessionProgress = `[${i + 1}/${sessions.length}]`;
          await this.processSession(session, sessionProgress);

          // Save progress periodically
          if (i > 0 && i % 10 === 0) {
            await this.saveProgress();
          }
        }

      } catch (error) {
        logger.error(`Failed to process WWDC ${year}`, error);
        this.progress.errors.push({
          sessionId: `wwdc${year}`,
          error: error instanceof Error ? error.message : String(error),
          phase: 'year-listing'
        });
      }
    }

    // Final progress save
    await this.saveProgress();
  }

  private async scrapeSpecificSession(sessionId: string): Promise<void> {
    console.log(chalk.yellow(`\n🎯 Scraping specific session: ${sessionId}`));
    
    try {
      const spinner = ora('Fetching session details...').start();
      
      if (this.options.dryRun) {
        spinner.info('Dry run - would fetch session details');
        return;
      }

      const session = await this.scraper.scrapeSessionDetails(sessionId);
      spinner.succeed(`Found session: ${session.title}`);
      
      this.progress.totalSessions = 1;
      await this.processSession(session, '[1/1]');
      
    } catch (error) {
      console.error(chalk.red(`Failed to scrape session ${sessionId}:`), error);
      this.progress.errors.push({
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        phase: 'session-details'
      });
    }
  }

  private async processSession(session: WWDCSession, progressIndicator: string): Promise<void> {
    const sessionSpinner = ora(`${progressIndicator} Processing: ${session.title}`).start();

    try {
      if (this.options.dryRun) {
        sessionSpinner.info(`${progressIndicator} Would process: ${session.title}`);
        return;
      }

      // 1. Store session metadata
      await this.cache.storeSession(session);
      await this.indexer.indexSession(session);

      // 2. Download and parse transcript if available
      let transcript: WWDCTranscript | null = null;
      if (session.transcriptUrl) {
        this.progress.totalTranscripts++;
        
        try {
          // Check cache first
          transcript = await this.cache.getTranscript(session.id);
          
          if (!transcript) {
            sessionSpinner.text = `${progressIndicator} Downloading transcript...`;
            const rawTranscript = await this.scraper.scrapeTranscript(session.id);
            
            if (rawTranscript) {
              // Parse the transcript
              transcript = this.parser.parseVTT(rawTranscript.fullText, session.id);
              await this.cache.storeTranscript(transcript);
              await this.indexer.indexTranscript(session.id, transcript);
              this.progress.downloadedTranscripts++;
            }
          } else {
            this.progress.downloadedTranscripts++;
            await this.indexer.indexTranscript(session.id, transcript);
          }
        } catch (error) {
          logger.error(`Failed to process transcript for ${session.id}`, error);
          this.progress.failedTranscripts++;
          this.progress.errors.push({
            sessionId: session.id,
            error: error instanceof Error ? error.message : String(error),
            phase: 'transcript'
          });
        }
      }

      // 3. Extract code examples from transcript
      if (transcript) {
        sessionSpinner.text = `${progressIndicator} Extracting code examples...`;
        
        try {
          const codeExamples = await this.codeExtractor.extractFromTranscript(transcript);
          
          if (codeExamples.length > 0) {
            await this.cache.storeCodeExamples(session.id, codeExamples);
            this.progress.totalCodeExamples += codeExamples.length;
            
            if (this.options.verbose) {
              console.log(chalk.green(`\n    ✓ Found ${codeExamples.length} code examples`));
            }
          }
        } catch (error) {
          logger.error(`Failed to extract code for ${session.id}`, error);
          this.progress.errors.push({
            sessionId: session.id,
            error: error instanceof Error ? error.message : String(error),
            phase: 'code-extraction'
          });
        }
      }

      // 4. Download sample code if available
      if (session.sampleCodeUrl) {
        sessionSpinner.text = `${progressIndicator} Checking sample code...`;
        
        try {
          const sampleCodePath = await this.scraper.downloadSampleCode(session.id, session.sampleCodeUrl);
          if (sampleCodePath && this.options.verbose) {
            console.log(chalk.green(`\n    ✓ Sample code available: ${sampleCodePath}`));
          }
        } catch (error) {
          logger.error(`Failed to download sample code for ${session.id}`, error);
          // Non-critical error, don't add to error list
        }
      }

      this.progress.scrapedSessions++;
      sessionSpinner.succeed(`${progressIndicator} ✓ ${session.title}`);

    } catch (error) {
      this.progress.failedSessions++;
      sessionSpinner.fail(`${progressIndicator} ✗ ${session.title}`);
      
      logger.error(`Failed to process session ${session.id}`, error);
      this.progress.errors.push({
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
        phase: 'session-processing'
      });
    }
  }

  private async buildSearchIndex(): Promise<void> {
    console.log(chalk.yellow('\n🔍 Building search index...'));
    
    const spinner = ora('Building search indexes...').start();
    
    try {
      // Get all indexed sessions
      const stats = this.indexer.getStats();
      
      spinner.text = `Indexing ${stats.totalSessions} sessions and ${stats.sessionsWithTranscripts} transcripts...`;
      
      // The indexer already has everything in memory, just need to persist if needed
      // In a production system, you might want to save the index to disk here
      
      spinner.succeed(`Search index built: ${stats.totalSessions} sessions, ${stats.sessionsWithTranscripts} transcripts`);
      
      // Print year breakdown
      console.log(chalk.gray('\n  Sessions by year:'));
      for (const [year, count] of Object.entries(stats.sessionsByYear)) {
        console.log(chalk.gray(`    ${year}: ${count} sessions`));
      }
      
    } catch (error) {
      spinner.fail('Failed to build search index');
      logger.error('Index building failed', error);
    }
  }

  private async isSessionCached(sessionId: string): Promise<boolean> {
    const cached = await this.cache.getSession(sessionId);
    return cached !== null;
  }

  private async loadProgress(): Promise<void> {
    try {
      const data = await fs.readFile(this.progressFile, 'utf-8');
      const saved = JSON.parse(data);
      
      // Only restore if the previous session was recent (within 24 hours)
      if (Date.now() - saved.startTime < 24 * 60 * 60 * 1000) {
        this.progress = saved;
        console.log(chalk.blue('ℹ️  Resuming previous scraping session'));
        console.log(chalk.gray(`   Scraped: ${saved.scrapedSessions}/${saved.totalSessions} sessions`));
      }
    } catch (error) {
      // No previous progress, start fresh
      if (this.options.verbose) {
        console.log(chalk.gray('Starting fresh scraping session'));
      }
    }
  }

  private async saveProgress(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.progressFile), { recursive: true });
      await fs.writeFile(this.progressFile, JSON.stringify(this.progress, null, 2));
    } catch (error) {
      logger.error('Failed to save progress', error);
    }
  }

  private printSummary(): void {
    const duration = Date.now() - this.progress.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    console.log(chalk.blue('\n📊 Scraping Summary'));
    console.log(chalk.gray('─'.repeat(50)));
    
    console.log(`  Sessions:     ${chalk.green(this.progress.scrapedSessions)}/${this.progress.totalSessions} scraped`);
    if (this.progress.failedSessions > 0) {
      console.log(`                ${chalk.red(this.progress.failedSessions)} failed`);
    }
    
    console.log(`  Transcripts:  ${chalk.green(this.progress.downloadedTranscripts)}/${this.progress.totalTranscripts} downloaded`);
    if (this.progress.failedTranscripts > 0) {
      console.log(`                ${chalk.red(this.progress.failedTranscripts)} failed`);
    }
    
    console.log(`  Code Examples: ${chalk.green(this.progress.totalCodeExamples)} extracted`);
    console.log(`  Duration:     ${minutes}m ${seconds}s`);

    if (this.progress.errors.length > 0) {
      console.log(chalk.red(`\n⚠️  ${this.progress.errors.length} errors occurred:`));
      
      // Group errors by phase
      const errorsByPhase = this.progress.errors.reduce((acc, err) => {
        if (!acc[err.phase]) acc[err.phase] = [];
        acc[err.phase].push(err);
        return acc;
      }, {} as Record<string, typeof this.progress.errors>);

      for (const [phase, errors] of Object.entries(errorsByPhase)) {
        console.log(chalk.yellow(`\n  ${phase}:`));
        errors.slice(0, 5).forEach(err => {
          console.log(chalk.gray(`    - ${err.sessionId}: ${err.error.substring(0, 60)}...`));
        });
        if (errors.length > 5) {
          console.log(chalk.gray(`    ... and ${errors.length - 5} more`));
        }
      }
    }

    // Cache statistics
    this.cache.getWWDCStats().then(stats => {
      console.log(chalk.blue('\n💾 Cache Statistics'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`  Sessions cached:    ${stats.wwdc.sessions.cached}`);
      console.log(`  Transcripts cached: ${stats.wwdc.transcripts.cached}`);
      console.log(`  Code cached:        ${stats.wwdc.code.cached}`);
    });
  }

  private async handleShutdown(): Promise<void> {
    console.log(chalk.yellow('\n\n⚠️  Gracefully shutting down...'));
    
    // Save current progress
    await this.saveProgress();
    
    // Clean up
    await this.cleanup();
    
    console.log(chalk.green('✓ Shutdown complete'));
    process.exit(0);
  }

  private async cleanup(): Promise<void> {
    try {
      await this.browserManager.cleanup();
      await this.cache.close();
    } catch (error) {
      logger.error('Cleanup error', error);
    }
  }
}

// Command-line interface
const program = new Command();

program
  .name('scrape-wwdc-sessions')
  .description('Scrape WWDC sessions, transcripts, and code examples')
  .version('1.0.0');

program
  .option('-y, --years <years>', 'Comma-separated years to scrape', '2022,2023,2024')
  .option('-i, --incremental', 'Only scrape new/updated sessions', false)
  .option('-r, --rebuild-index', 'Force rebuild of search index', false)
  .option('-m, --max-concurrent <number>', 'Max concurrent operations', '3')
  .option('-s, --session <id>', 'Scrape a specific session ID')
  .option('-d, --dry-run', 'Show what would be scraped without doing it', false)
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    // Parse options
    const scraperOptions: ScraperOptions = {
      years: options.years.split(',').map((y: string) => parseInt(y.trim())),
      incremental: options.incremental,
      rebuildIndex: options.rebuildIndex,
      maxConcurrent: parseInt(options.maxConcurrent),
      session: options.session,
      dryRun: options.dryRun,
      verbose: options.verbose
    };

    // Validate years
    const currentYear = new Date().getFullYear();
    scraperOptions.years = scraperOptions.years.filter(year => {
      if (year < 2010 || year > currentYear) {
        console.error(chalk.red(`Invalid year: ${year}. Must be between 2010 and ${currentYear}`));
        return false;
      }
      return true;
    });

    if (scraperOptions.years.length === 0 && !scraperOptions.session) {
      console.error(chalk.red('No valid years specified and no specific session requested'));
      process.exit(1);
    }

    // Configure logger verbosity
    if (scraperOptions.verbose) {
      logger.level = 'debug';
    }

    // Run the scraper
    const scraper = new WWDCScraperCLI(scraperOptions);
    await scraper.run();
  });

// Parse command line arguments
program.parse(process.argv);