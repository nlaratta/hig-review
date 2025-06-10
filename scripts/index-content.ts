#!/usr/bin/env node
import { ContentIndexer, IndexProgress } from '../src/indexer/ContentIndexer.js';
import { IndexBuilder } from '../src/indexer/IndexBuilder.js';
import { browserManager } from '../src/scraper/BrowserManager.js';
import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';

// Command line arguments
const args = process.argv.slice(2);
const incremental = args.includes('--incremental') || args.includes('-i');
const rebuildIndex = args.includes('--rebuild-index');
const testMode = args.includes('--test');
const help = args.includes('--help') || args.includes('-h');

if (help) {
  console.log(`
${chalk.bold('HIG Content Indexer')}

Usage: npm run index [options]

Options:
  -i, --incremental     Only index new or updated content
  --rebuild-index       Rebuild search index from cached content
  --test               Index only a few test pages
  -h, --help           Show this help message

Examples:
  npm run index                    # Full indexing
  npm run index --incremental      # Incremental update
  npm run index --test             # Test with sample pages
  npm run index --rebuild-index    # Rebuild search index only
`);
  process.exit(0);
}

/**
 * Format time duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Display progress bar
 */
function displayProgress(progress: IndexProgress): void {
  const percentage = Math.round((progress.completed / progress.total) * 100);
  const barLength = 30;
  const filledLength = Math.round((percentage / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  
  // Clear current line and write progress
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  
  const status = chalk.cyan(`[${bar}] ${percentage}% `);
  const counts = chalk.gray(`(${progress.completed}/${progress.total})`);
  const current = progress.currentUrl ? chalk.dim(` ${progress.currentUrl.substring(0, 50)}...`) : '';
  
  process.stdout.write(status + counts + current);
}

/**
 * Main indexing function
 */
async function main() {
  console.log(chalk.bold.blue('\n🔍 Apple HIG Content Indexer\n'));

  // Handle index rebuild
  if (rebuildIndex) {
    const spinner = ora('Rebuilding search index...').start();
    try {
      const builder = new IndexBuilder();
      const index = await builder.buildIndex();
      spinner.succeed(`Search index rebuilt: ${index.metadata.totalDocuments} documents`);
      process.exit(0);
    } catch (error) {
      spinner.fail('Failed to rebuild index');
      console.error(error);
      process.exit(1);
    }
  }

  // Initialize browser
  const browserSpinner = ora('Initializing browser...').start();
  try {
    await browserManager.initialize();
    browserSpinner.succeed('Browser initialized');
  } catch (error) {
    browserSpinner.fail('Failed to initialize browser');
    console.error(error);
    process.exit(1);
  }

  // Create indexer
  const indexer = new ContentIndexer();
  const startTime = Date.now();

  // Progress tracking
  let lastProgressUpdate = Date.now();
  const progressCallback = (progress: IndexProgress) => {
    // Update progress bar every 500ms
    if (Date.now() - lastProgressUpdate > 500) {
      displayProgress(progress);
      lastProgressUpdate = Date.now();
    }
  };

  try {
    // Start indexing
    console.log(chalk.yellow(`\nStarting ${incremental ? 'incremental' : 'full'} indexing...\n`));

    const options = {
      incremental,
      onProgress: progressCallback
    };

    // In test mode, only index a few pages
    if (testMode) {
      console.log(chalk.yellow('Running in test mode - indexing sample pages only\n'));
      Object.assign(options, {
        categories: ['foundations'],
        platforms: ['ios']
      });
    }

    await indexer.indexAll(options);

    // Clear progress line
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Get final statistics
    const stats = indexer.getStats();
    const duration = Date.now() - startTime;

    // Display results
    console.log(chalk.green('\n✅ Indexing completed!\n'));
    
    console.log(chalk.bold('Summary:'));
    console.log(`  Total pages: ${stats.progress.total}`);
    console.log(`  Completed: ${chalk.green(stats.progress.completed.toString())}`);
    console.log(`  Skipped: ${chalk.yellow(stats.progress.skipped.toString())}`);
    console.log(`  Failed: ${chalk.red(stats.progress.failed.toString())}`);
    console.log(`  Duration: ${formatDuration(duration)}`);
    console.log(`  Rate: ${stats.performance.pagesPerMinute} pages/minute`);

    // Show errors if any
    if (stats.progress.errors.length > 0) {
      console.log(chalk.red('\n⚠️  Errors:'));
      stats.progress.errors.slice(0, 5).forEach(error => {
        console.log(`  - ${error.url}: ${error.error}`);
      });
      if (stats.progress.errors.length > 5) {
        console.log(`  ... and ${stats.progress.errors.length - 5} more`);
      }
    }

    // Build search index
    console.log(chalk.yellow('\n📚 Building search index...'));
    const indexSpinner = ora('Creating Fuse.js index...').start();
    
    try {
      const builder = new IndexBuilder();
      const searchIndex = await builder.buildIndex();
      indexSpinner.succeed(`Search index created: ${searchIndex.metadata.totalDocuments} documents`);
      
      // Show index statistics
      console.log('\nIndex Statistics:');
      console.log('  Categories:');
      Object.entries(searchIndex.metadata.categories).forEach(([cat, count]) => {
        console.log(`    - ${cat}: ${count}`);
      });
      
      if (Object.keys(searchIndex.metadata.platforms).length > 0) {
        console.log('  Platforms:');
        Object.entries(searchIndex.metadata.platforms).forEach(([platform, count]) => {
          console.log(`    - ${platform}: ${count}`);
        });
      }
    } catch (error) {
      indexSpinner.fail('Failed to build search index');
      console.error(error);
    }

    // Rate limiter stats
    console.log(chalk.dim('\nRate Limiter Stats:'));
    console.log(chalk.dim(`  Requests: ${stats.cacheStats.rateLimiterStats.totalRequests}`));
    console.log(chalk.dim(`  Rate limited: ${stats.cacheStats.rateLimiterStats.rateLimited}`));
    console.log(chalk.dim(`  Average delay: ${Math.round(stats.cacheStats.rateLimiterStats.averageDelay)}ms`));

  } catch (error) {
    console.error(chalk.red('\n❌ Indexing failed:'), error);
    process.exit(1);
  } finally {
    // Cleanup
    await browserManager.close();
  }

  console.log(chalk.green('\n✨ All done!\n'));
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n❌ Unhandled error:'), error);
  browserManager.close().then(() => process.exit(1));
});

// Run main function
main().catch(console.error);