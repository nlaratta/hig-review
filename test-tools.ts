import { higSearchEngine } from './src/tools/searchHIG.js';
import { browseSection } from './src/tools/browseSection.js';
import { GetGuideline } from './src/tools/getGuideline.js';
import { browserManager } from './src/scraper/BrowserManager.js';

async function testTools() {
  console.log('Testing Apple HIG MCP Tools\n');
  
  try {
    // Initialize browser
    console.log('1. Initializing browser manager...');
    await browserManager.initialize();
    console.log('✅ Browser manager initialized\n');
    
    // Test search engine
    console.log('2. Testing search engine...');
    await higSearchEngine.initialize();
    
    const searchResults = await higSearchEngine.search({
      query: 'button',
      platform: 'ios'
    });
    
    console.log(`✅ Search found ${searchResults.length} results`);
    console.log('Sample result:', searchResults[0]?.item.title || 'No results');
    console.log('');
    
    // Test browse section
    console.log('3. Testing browse section...');
    const sectionContent = await browseSection.execute({
      section: 'components',
      platform: 'ios'
    });
    
    console.log('✅ Browse section returned content');
    console.log('Content preview:', sectionContent.substring(0, 200) + '...\n');
    
    // Test get guideline
    console.log('4. Testing get guideline...');
    const guidelineTool = new GetGuideline();
    const guideline = await guidelineTool.execute({
      guidelineId: '/components/buttons',
      includeExamples: true,
      includeCode: true
    });
    
    console.log('✅ Get guideline returned content');
    console.log('Title:', guideline.title);
    console.log('Content length:', guideline.content.length);
    console.log('Code snippets:', guideline.codeSnippets?.length || 0);
    console.log('');
    
    // Test available sections
    console.log('5. Available sections:');
    const sections = browseSection.getAvailableSections();
    console.log(sections.join(', '));
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    await browserManager.close();
    console.log('✅ Cleanup complete');
  }
}

// Run tests
testTools().catch(console.error);