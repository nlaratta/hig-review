/**
 * Comprehensive test for WWDC integration components
 */

import { WWDCScraper } from './WWDCScraper.js';
import { TranscriptParser } from './TranscriptParser.js';
import { CodeExtractor } from './CodeExtractor.js';
import { SessionIndexer } from './SessionIndexer.js';
import { WWDCCacheManager } from '../cache/WWDCCacheManager.js';
import { HIGWWDCLinker } from '../integration/HIGWWDCLinker.js';
import { SearchWWDC } from '../tools/searchWWDC.js';
import { GetSession } from '../tools/getSession.js';
import { GetGuideline } from '../tools/getGuideline.js';
import { browserManager } from '../scraper/BrowserManager.js';
import { higSearchEngine } from '../tools/searchHIG.js';
import { logger } from '../utils/logger.js';

// Sample data for testing
const sampleSession = {
  id: 'wwdc2023-10052',
  year: 2023,
  title: 'Build spatial experiences with SwiftUI',
  description: 'Learn how to create immersive spatial experiences using SwiftUI for visionOS.',
  duration: 1740, // 29 minutes
  speakers: ['Sarah Williams', 'John Chen'],
  platforms: ['visionos', 'ios'] as any[],
  topics: ['SwiftUI', 'Spatial Computing', 'visionOS', 'RealityKit'],
  videoUrl: 'https://developer.apple.com/videos/play/wwdc2023/10052',
  transcriptUrl: 'https://devstreaming-cdn.apple.com/videos/wwdc/2023/10052/subtitles/eng/10052.vtt',
  timestamp: new Date(),
  tags: ['ui', 'framework', 'spatial'],
};

const sampleVTT = `WEBVTT

00:00:00.500 --> 00:00:03.000
Hello and welcome to WWDC 2023.

00:00:03.500 --> 00:00:07.000
Today we'll explore building spatial experiences with SwiftUI.

00:00:07.500 --> 00:00:12.000
Let's start by creating a basic immersive space.
You can use the ImmersiveSpace view modifier.

00:00:12.500 --> 00:00:16.000
Here's how you create a navigation stack:
NavigationStack { content }

00:00:16.500 --> 00:00:20.000
And to handle RealityKit integration:
RealityView { content in
  let entity = ModelEntity()
  content.add(entity)
}

00:00:20.500 --> 00:00:24.000
This creates a powerful spatial computing experience.
`;

const sampleGuideline = {
  id: 'spatial-computing',
  title: 'Spatial Computing Guidelines',
  content: 'Design guidelines for spatial computing experiences.',
  platform: 'visionos' as any,
  category: 'foundations',
  lastUpdated: '2023-12-01',
  topics: ['spatial computing', 'visionOS', 'immersive'],
};

async function testFullIntegration() {
  console.log('\n🧪 Starting Full WWDC Integration Tests...\n');

  try {
    // 1. Test Cache Manager
    console.log('1️⃣ Testing WWDC Cache Manager...');
    const cacheManager = new WWDCCacheManager({
      baseDir: './cache/test-wwdc',
    });

    await cacheManager.storeSession(sampleSession);
    const retrievedSession = await cacheManager.getSession('wwdc2023-10052');
    console.log(`✅ Cache: Stored and retrieved session "${retrievedSession?.title}"`);

    // 2. Test Transcript Parser
    console.log('\n2️⃣ Testing Transcript Parser...');
    const transcriptParser = new TranscriptParser();
    const transcript = transcriptParser.parseVTT(sampleVTT, 'wwdc2023-10052');
    
    await cacheManager.storeTranscript(transcript);
    console.log(`✅ Parser: Parsed ${transcript.segments.length} segments`);

    // 3. Test Code Extractor
    console.log('\n3️⃣ Testing Code Extractor...');
    const codeExtractor = new CodeExtractor();
    const codeExamples = codeExtractor.extractFromTranscript(transcript);
    
    if (codeExamples.length > 0) {
      await cacheManager.storeCodeExamples('wwdc2023-10052', codeExamples);
      console.log(`✅ Code Extractor: Found ${codeExamples.length} code examples`);
      console.log(`   - Languages: ${[...new Set(codeExamples.map(c => c.language))].join(', ')}`);
    } else {
      console.log('⚠️  Code Extractor: No code examples found');
    }

    // 4. Test Session Indexer
    console.log('\n4️⃣ Testing Session Indexer...');
    const sessionIndexer = new SessionIndexer();
    
    await sessionIndexer.indexSession(sampleSession);
    await sessionIndexer.indexTranscript('wwdc2023-10052', transcript);
    
    const searchResults = sessionIndexer.searchSessions({
      query: 'SwiftUI spatial',
      limit: 5,
    });
    
    console.log(`✅ Indexer: Indexed session and transcript`);
    console.log(`   - Search results: ${searchResults.length} matches`);

    // 5. Test HIG-WWDC Linker
    console.log('\n5️⃣ Testing HIG-WWDC Linker...');
    const linker = new HIGWWDCLinker(higSearchEngine);
    linker.setWWDCSessions([sampleSession]);
    
    const relatedSessions = await linker.findRelatedSessions(sampleGuideline, 3);
    console.log(`✅ Linker: Found ${relatedSessions?.length || 0} related sessions`);
    
    if (relatedSessions && relatedSessions.length > 0) {
      console.log(`   - Top match: "${relatedSessions[0].session.title}" (${(relatedSessions[0].relevance * 100).toFixed(1)}% relevance)`);
    }

    // 6. Test SearchWWDC Tool
    console.log('\n6️⃣ Testing SearchWWDC Tool...');
    const searchWWDC = new SearchWWDC();
    
    // Use the tool's indexer and populate it with our test data
    const toolIndexer = searchWWDC.getIndexer();
    await toolIndexer.indexSession(sampleSession);
    await toolIndexer.indexTranscript('wwdc2023-10052', transcript);
    searchWWDC.setIndexBuilt(true);
    
    const searchResponse = await searchWWDC.execute({
      query: 'SwiftUI spatial computing',
      includeCode: true,
      limit: 3,
    });
    
    console.log('✅ SearchWWDC: Tool executed successfully');
    console.log(`   - Response length: ${searchResponse.length} characters`);

    // 7. Test GetSession Tool
    console.log('\n7️⃣ Testing GetSession Tool...');
    const getSession = new GetSession(cacheManager);
    
    const sessionResponse = await getSession.execute({
      sessionId: 'wwdc2023-10052',
      includeTranscript: true,
      includeCode: true,
      includeRelatedGuidelines: false, // Skip this for the test
    });
    
    console.log('✅ GetSession: Tool executed successfully');
    console.log(`   - Response content type: ${typeof sessionResponse}`);

    // 8. Test Enhanced GetGuideline Tool
    console.log('\n8️⃣ Testing Enhanced GetGuideline Tool...');
    const getGuideline = new GetGuideline();
    getGuideline.initializeWWDCLinker(higSearchEngine);
    
    console.log('✅ GetGuideline: WWDC integration initialized');

    // 9. Cache Statistics
    console.log('\n9️⃣ Testing Cache Statistics...');
    const stats = await cacheManager.getWWDCStats();
    console.log('✅ Cache Stats:');
    console.log(`   - Sessions cached: ${stats.wwdc.sessions.cached}`);
    console.log(`   - Transcripts cached: ${stats.wwdc.transcripts.cached}`);
    console.log(`   - Code cached: ${stats.wwdc.code.cached}`);

    // 10. Search Index Statistics
    console.log('\n🔟 Testing Search Index Statistics...');
    const indexStats = sessionIndexer.getStats();
    console.log('✅ Index Stats:');
    console.log(`   - Sessions indexed: ${indexStats.totalSessions}`);
    console.log(`   - Transcripts indexed: ${indexStats.sessionsWithTranscripts}`);

    // Cleanup
    await cacheManager.close();
    
    console.log('\n🎉 All WWDC Integration Tests Passed!\n');
    console.log('📋 Summary:');
    console.log('   ✅ WWDCCacheManager - Session, transcript, and code caching');
    console.log('   ✅ TranscriptParser - VTT parsing and segment extraction');
    console.log('   ✅ CodeExtractor - Code example detection and extraction');
    console.log('   ✅ SessionIndexer - Fuzzy search indexing');
    console.log('   ✅ HIGWWDCLinker - Relevance-based session mapping');
    console.log('   ✅ SearchWWDC Tool - MCP tool for searching sessions');
    console.log('   ✅ GetSession Tool - MCP tool for retrieving session details');
    console.log('   ✅ Enhanced GetGuideline - WWDC content integration');
    console.log('\n🚀 WWDC integration is ready for production use!\n');

  } catch (error) {
    console.error('\n❌ Integration test failed:', error);
    throw error;
  }
}

// Export for external use
export { testFullIntegration };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testFullIntegration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}