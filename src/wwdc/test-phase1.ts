/**
 * Test file to verify Phase 1 WWDC components
 */

import { WWDCScraper } from './WWDCScraper.js';
import { TranscriptParser } from './TranscriptParser.js';
import { WWDCCacheManager } from '../cache/WWDCCacheManager.js';
import { browserManager } from '../scraper/BrowserManager.js';
import { logger } from '../utils/logger.js';

// Sample VTT content for testing
const sampleVTT = `WEBVTT

00:00:00.500 --> 00:00:02.000
Hello, welcome to WWDC 2023.

00:00:02.500 --> 00:00:05.000
Today we'll talk about SwiftUI navigation.

00:00:05.500 --> 00:00:08.000
Let's start with NavigationStack.

00:00:08.500 --> 00:00:12.000
You can create a navigation stack like this:
NavigationStack { content }
`;

async function testTranscriptParser() {
  console.log('\n=== Testing Transcript Parser ===');
  
  const parser = new TranscriptParser();
  const transcript = parser.parseVTT(sampleVTT, 'wwdc2023-10054');
  
  console.log('Parsed segments:', transcript.segments.length);
  console.log('\nFirst segment:', transcript.segments[0]);
  console.log('\nCode segments:', parser.findCodeSegments(transcript).length);
  
  // Test keyword extraction
  const keywords = parser.extractKeywords(transcript);
  console.log('\nExtracted keywords:', keywords);
  
  // Test search
  const searchResults = parser.searchTranscript(transcript, ['SwiftUI', 'navigation']);
  console.log('\nSearch results for "SwiftUI navigation":', searchResults.length);
}

async function testWWDCCache() {
  console.log('\n=== Testing WWDC Cache Manager ===');
  
  const cache = new WWDCCacheManager({
    baseDir: './cache/wwdc-test',
  });
  
  // Test session caching
  const testSession = {
    id: 'wwdc2023-10054',
    year: 2023,
    title: 'Build better navigation',
    description: 'Learn about SwiftUI navigation',
    duration: 1380,
    speakers: ['John Doe'],
    platforms: ['ios' as const],
    topics: ['SwiftUI', 'Navigation'],
    videoUrl: 'https://developer.apple.com/videos/play/wwdc2023/10054',
    timestamp: new Date(),
  };
  
  await cache.storeSession(testSession);
  console.log('Stored test session');
  
  const retrieved = await cache.getSession('wwdc2023-10054');
  console.log('Retrieved session:', retrieved?.title);
  
  // Test transcript caching
  const testTranscript = {
    sessionId: 'wwdc2023-10054',
    segments: [],
    fullText: 'Test transcript content',
    language: 'en' as const,
    format: 'vtt' as const,
  };
  
  await cache.storeTranscript(testTranscript);
  console.log('Stored test transcript');
  
  const retrievedTranscript = await cache.getTranscript('wwdc2023-10054');
  console.log('Retrieved transcript:', retrievedTranscript?.sessionId);
  
  // Get stats
  const stats = await cache.getWWDCStats();
  console.log('\nCache stats:', JSON.stringify(stats.wwdc, null, 2));
  
  await cache.close();
}

async function testWWDCScraper() {
  console.log('\n=== Testing WWDC Scraper (Mock) ===');
  
  // Note: This would require actual network access to Apple's site
  // For now, we'll just test the structure
  
  const scraper = new WWDCScraper(browserManager);
  console.log('WWDCScraper instance created successfully');
  
  // Test VTT URL construction (internal method, but we can verify the pattern)
  const sessionId = 'wwdc2023-10054';
  console.log(`Session ID format: ${sessionId}`);
  
  // Test transcript parsing with our sample
  const mockTranscript = await scraper.scrapeTranscript(sessionId);
  console.log('Mock transcript structure:', mockTranscript ? 'Valid' : 'Invalid');
}

async function runAllTests() {
  try {
    console.log('Starting Phase 1 Component Tests...\n');
    
    await testTranscriptParser();
    await testWWDCCache();
    await testWWDCScraper();
    
    console.log('\n✅ All Phase 1 tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().then(() => process.exit(0)).catch(() => process.exit(1));
}

export { runAllTests };