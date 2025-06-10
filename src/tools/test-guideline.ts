#!/usr/bin/env node
/**
 * Test script for the GetGuideline tool
 * 
 * This script demonstrates how the getGuideline tool works with various Apple HIG URLs
 */

import { GetGuideline } from './getGuideline.js';
import { browserManager } from '../scraper/BrowserManager.js';

// Test URLs for different types of guidelines
const testUrls = [
  {
    name: 'Buttons Component',
    id: 'components/buttons',
    includeExamples: true,
    includeCode: true
  },
  {
    name: 'Color Foundation',
    id: 'foundations/color',
    includeExamples: true,
    includeCode: false
  },
  {
    name: 'Navigation Pattern',
    id: 'patterns/navigation',
    includeExamples: false,
    includeCode: true
  },
  {
    name: 'Full URL Test',
    id: 'https://developer.apple.com/design/human-interface-guidelines/components/menus-and-actions/buttons',
    includeExamples: true,
    includeCode: true
  }
];

async function testGetGuideline() {
  console.log('🔍 Testing GetGuideline Tool\n');
  console.log('=' .repeat(80));
  
  const guidelineTool = new GetGuideline(3600); // 1 hour cache
  
  for (const test of testUrls) {
    console.log(`\n📋 Testing: ${test.name}`);
    console.log(`   ID: ${test.id}`);
    console.log(`   Include Examples: ${test.includeExamples}`);
    console.log(`   Include Code: ${test.includeCode}`);
    console.log('-'.repeat(80));
    
    try {
      const startTime = Date.now();
      
      const result = await guidelineTool.execute({
        guidelineId: test.id,
        includeExamples: test.includeExamples,
        includeCode: test.includeCode
      });
      
      const duration = Date.now() - startTime;
      
      // Display results
      console.log(`\n✅ Success! (${duration}ms)`);
      console.log(`\nTitle: ${result.title}`);
      console.log(`Platform: ${result.platform}`);
      console.log(`Category: ${result.category}`);
      console.log(`Last Updated: ${result.lastUpdated}`);
      
      // Show content preview
      const contentPreview = result.content.substring(0, 500);
      console.log(`\nContent Preview:\n${contentPreview}...`);
      
      // Show code examples if any
      if (result.codeSnippets && result.codeSnippets.length > 0) {
        console.log(`\n💻 Code Examples: ${result.codeSnippets.length} found`);
        result.codeSnippets.slice(0, 2).forEach((snippet, index) => {
          console.log(`\n   Example ${index + 1} (${snippet.language}):`);
          if (snippet.description) {
            console.log(`   ${snippet.description}`);
          }
          const codePreview = snippet.code.substring(0, 200);
          console.log(`   ${codePreview}${snippet.code.length > 200 ? '...' : ''}`);
        });
      }
      
      // Show design examples if any
      if (result.examples && result.examples.length > 0) {
        console.log(`\n🎨 Design Examples: ${result.examples.length} found`);
        result.examples.slice(0, 2).forEach((example, index) => {
          console.log(`\n   ${example.title}`);
          if (example.description) {
            console.log(`   ${example.description}`);
          }
        });
      }
      
      // Show related guidelines
      if (result.relatedGuidelines && result.relatedGuidelines.length > 0) {
        console.log(`\n🔗 Related Guidelines: ${result.relatedGuidelines.join(', ')}`);
      }
      
    } catch (error) {
      console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (error instanceof Error && error.stack) {
        console.error('\nStack trace:', error.stack);
      }
    }
    
    console.log('\n' + '='.repeat(80));
  }
  
  // Show cache statistics
  const cacheStats = guidelineTool.getCacheStats();
  console.log('\n📊 Cache Statistics:');
  console.log(`   Hits: ${cacheStats.hits}`);
  console.log(`   Misses: ${cacheStats.misses}`);
  console.log(`   Cached Items: ${cacheStats.keys}`);
  
  // Test caching by re-fetching the first URL
  if (testUrls.length > 0) {
    console.log('\n🔄 Testing Cache (re-fetching first URL)...');
    const startTime = Date.now();
    
    await guidelineTool.execute({
      guidelineId: testUrls[0].id,
      includeExamples: testUrls[0].includeExamples,
      includeCode: testUrls[0].includeCode
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Cached response retrieved in ${duration}ms`);
    
    const newStats = guidelineTool.getCacheStats();
    console.log(`   Cache hits increased: ${cacheStats.hits} → ${newStats.hits}`);
  }
}

// Run the test
(async () => {
  try {
    await testGetGuideline();
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    // Clean up
    await browserManager.close();
    process.exit(0);
  }
})();