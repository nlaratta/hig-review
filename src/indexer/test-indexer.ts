import { ContentIndexer } from './ContentIndexer.js';
import { IndexBuilder } from './IndexBuilder.js';
import { browserManager } from '../scraper/BrowserManager.js';

async function testIndexer() {
  console.log('🧪 Testing Content Indexer\n');

  try {
    // Initialize browser
    console.log('1. Initializing browser...');
    await browserManager.initialize();
    console.log('✅ Browser initialized\n');

    // Create indexer
    const indexer = new ContentIndexer();
    
    // Test indexing a few sample pages
    console.log('2. Testing incremental indexing with sample pages...');
    await indexer.indexAll({
      incremental: true,
      platforms: ['ios'],
      categories: ['foundations'],
      onProgress: (progress) => {
        console.log(`Progress: ${progress.completed}/${progress.total} (${progress.skipped} skipped, ${progress.failed} failed)`);
      }
    });

    // Get statistics
    const stats = indexer.getStats();
    console.log('\n✅ Indexing completed');
    console.log('Stats:', JSON.stringify(stats, null, 2));

    // Test search index building
    console.log('\n3. Building search index...');
    const builder = new IndexBuilder();
    const searchIndex = await builder.buildIndex();
    console.log(`✅ Search index built with ${searchIndex.metadata.totalDocuments} documents`);
    console.log('Categories:', searchIndex.metadata.categories);

    // Test search
    console.log('\n4. Testing search functionality...');
    const searchResults = builder.search('button', { limit: 5 });
    console.log(`Found ${searchResults.length} results for "button":`);
    searchResults.forEach(result => {
      console.log(`  - ${result.title} (${result.url})`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browserManager.close();
  }
}

// Run the test
testIndexer().catch(console.error);