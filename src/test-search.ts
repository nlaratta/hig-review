#!/usr/bin/env node
import { higSearchEngine } from './tools/searchHIG.js';
import { logger } from './utils/logger.js';

async function testSearch() {
  console.log('=== Testing HIG Search Engine ===\n');

  try {
    // Initialize the search engine
    console.log('Initializing search engine...');
    await higSearchEngine.initialize();
    
    const stats = higSearchEngine.getStats();
    console.log(`Search index initialized with ${stats.totalDocuments} documents\n`);
    console.log('Category breakdown:');
    Object.entries(stats.categories).forEach(([category, count]) => {
      console.log(`  ${category}: ${count}`);
    });
    console.log('');

    // Test queries
    const testQueries: Array<{query: string; platform?: 'ios' | 'macos' | 'watchos' | 'tvos' | 'visionos'; category?: string}> = [
      { query: 'button' },
      { query: 'navigation ios', platform: 'ios' },
      { query: 'color schemes' },
      { query: 'accessibility', category: 'foundations' },
      { query: 'sheet', platform: 'ios' },
      { query: 'widget', category: 'technologies' },
      { query: 'typo test buttn' }, // Test fuzzy matching
    ];

    for (const params of testQueries) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Query: "${params.query}"${params.platform ? ` | Platform: ${params.platform}` : ''}${params.category ? ` | Category: ${params.category}` : ''}`);
      console.log('='.repeat(60));

      const results = await higSearchEngine.search(params);
      
      if (results.length === 0) {
        console.log('No results found.');
      } else {
        console.log(`Found ${results.length} results:\n`);
        
        results.slice(0, 3).forEach((result, index) => {
          const relevance = Math.round((1 - (result.score || 0)) * 100);
          console.log(`${index + 1}. ${result.item.title}`);
          console.log(`   URL: ${result.item.url}`);
          console.log(`   Category: ${result.item.category}${result.item.platform ? ` | Platform: ${result.item.platform}` : ''}`);
          console.log(`   Relevance: ${relevance}%`);
          if (result.highlights && result.highlights.length > 0) {
            console.log(`   Preview: ${result.highlights[0]}`);
          }
          console.log('');
        });

        if (results.length > 3) {
          console.log(`... and ${results.length - 3} more results`);
        }
      }
    }

    console.log('\n=== Search Engine Test Complete ===');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testSearch().catch(console.error);