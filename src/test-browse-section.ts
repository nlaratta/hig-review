/**
 * Test browseSection functionality directly
 */

import { browseSection } from './tools/browseSection.js';

async function testBrowseSection() {
  console.log('Testing browseSection...\n');

  const testCases: Array<{ section: string; platform: 'ios' | 'macos' | 'watchos' | 'tvos' | 'visionos' }> = [
    { section: 'components', platform: 'ios' },
    { section: 'components/buttons', platform: 'ios' },
    { section: 'components/inputs', platform: 'ios' },
    { section: 'foundations', platform: 'ios' },
    { section: 'patterns', platform: 'macos' },
  ];

  for (const testCase of testCases) {
    try {
      console.log(`🧪 Testing: ${testCase.section} (${testCase.platform})`);
      const result = await browseSection.execute(testCase);
      console.log(`✅ Success: ${result.split('\n')[0]}`); // Show first line (title)
      console.log(`   Length: ${result.length} characters\n`);
    } catch (error) {
      console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }
  }

  console.log('Available sections:', browseSection.getAvailableSections());
}

testBrowseSection().catch(console.error);