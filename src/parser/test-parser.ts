#!/usr/bin/env node
/**
 * Test script for the GuidelineParser
 * 
 * This tests the parser with sample HTML to verify extraction logic
 */

import { GuidelineParser } from './GuidelineParser.js';

// Sample HTML that mimics Apple HIG structure
const sampleHTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Buttons - Apple Human Interface Guidelines</title>
  <meta property="og:title" content="Buttons - Human Interface Guidelines">
</head>
<body>
  <main>
    <h1 class="page-title">Buttons</h1>
    
    <div class="intro-text">
      <p>Buttons initiate app-specific actions, have customizable backgrounds, and can include a title or an icon. The system provides a number of predefined button styles for most use cases. You can also design fully custom buttons.</p>
    </div>
    
    <h2>Best Practices</h2>
    <p>When using buttons in your app, follow these guidelines:</p>
    <ul>
      <li>Use verbs in titles. An action-specific title shows that a button is interactive and says what happens when you tap it.</li>
      <li>Use title-case for titles with four or fewer words. Capitalize every word except articles, coordinating conjunctions, and prepositions of four or fewer letters.</li>
      <li>Keep titles short. Overly long text can crowd your interface and may get truncated on smaller screens.</li>
    </ul>
    
    <h2>Design Specifications</h2>
    <table>
      <thead>
        <tr>
          <th>Property</th>
          <th>Value</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Minimum height</td>
          <td>44pt</td>
          <td>For touch targets</td>
        </tr>
        <tr>
          <td>Corner radius</td>
          <td>8pt</td>
          <td>Standard button style</td>
        </tr>
        <tr>
          <td>Padding</td>
          <td>16pt horizontal</td>
          <td>Minimum padding</td>
        </tr>
      </tbody>
    </table>
    
    <h2>SwiftUI Examples</h2>
    <p>Here's how to create a basic button in SwiftUI:</p>
    <pre><code class="language-swiftui">
Button("Sign In") {
    // Handle sign in
    signIn()
}
.buttonStyle(.borderedProminent)
    </code></pre>
    
    <p>For more complex buttons with custom styling:</p>
    <pre><code class="language-swift">
struct CustomButton: View {
    var body: some View {
        Button(action: {
            performAction()
        }) {
            HStack {
                Image(systemName: "star.fill")
                Text("Favorite")
            }
            .padding()
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(8)
        }
    }
}
    </code></pre>
    
    <h3>Do</h3>
    <ul>
      <li>Make buttons look interactive and tappable</li>
      <li>Ensure buttons have sufficient contrast</li>
      <li>Provide visual feedback when tapped</li>
    </ul>
    
    <h3>Don't</h3>
    <ul>
      <li>Don't make buttons too small to tap comfortably</li>
      <li>Avoid using buttons for navigation - use links instead</li>
      <li>Don't use too many button styles in one screen</li>
    </ul>
    
    <h2>See Also</h2>
    <ul>
      <li><a href="/design/human-interface-guidelines/components/menus-and-actions/menus">Menus</a></li>
      <li><a href="/design/human-interface-guidelines/components/menus-and-actions/toolbars">Toolbars</a></li>
      <li><a href="/design/human-interface-guidelines/foundations/color">Color</a></li>
    </ul>
  </main>
</body>
</html>
`;

async function testParser() {
  console.log('🧪 Testing GuidelineParser\n');
  console.log('='.repeat(80));
  
  const parser = new GuidelineParser(sampleHTML, 'https://developer.apple.com/design/human-interface-guidelines/components/menus-and-actions/buttons');
  
  try {
    const result = parser.parse();
    
    console.log('\n📋 Parsed Guideline:');
    console.log(`Title: ${result.title}`);
    console.log(`Platform: ${result.platform}`);
    console.log(`URL: ${result.url}`);
    console.log(`\nSummary:\n${result.summary}`);
    
    console.log('\n📚 Main Content Sections:');
    result.mainContent.forEach(section => {
      console.log(`\n- ${section.title}`);
      console.log(`  ${section.content.substring(0, 100)}...`);
    });
    
    console.log('\n✅ Best Practices:');
    result.bestPractices.slice(0, 3).forEach(practice => {
      console.log(`- ${practice}`);
    });
    
    console.log('\n💻 Code Examples:');
    result.codeExamples.forEach((example, index) => {
      console.log(`\nExample ${index + 1} (${example.language}):`);
      if (example.description) {
        console.log(`Description: ${example.description}`);
      }
      console.log(`Code preview: ${example.code.substring(0, 50)}...`);
    });
    
    console.log('\n📐 Design Specifications:');
    result.designSpecs.forEach(spec => {
      console.log(`- ${spec.property}: ${spec.value}${spec.notes ? ` (${spec.notes})` : ''}`);
    });
    
    console.log('\n✅ Do\'s:');
    result.dosAndDonts.dos.slice(0, 3).forEach(item => {
      console.log(`- ${item}`);
    });
    
    console.log('\n❌ Don\'ts:');
    result.dosAndDonts.donts.slice(0, 3).forEach(item => {
      console.log(`- ${item}`);
    });
    
    console.log('\n🔗 Related Links:');
    result.relatedLinks.forEach(link => {
      console.log(`- ${link.title} (${link.type}): ${link.url}`);
    });
    
    console.log('\n✅ Parser test completed successfully!');
    
    // Test edge cases
    console.log('\n\n🧪 Testing Edge Cases:');
    
    // Test with minimal HTML
    const minimalHTML = '<html><body><h1>Test</h1><p>Simple content</p></body></html>';
    const minimalParser = new GuidelineParser(minimalHTML, 'test-url');
    const minimalResult = minimalParser.parse();
    console.log('\nMinimal HTML test:');
    console.log(`- Title: ${minimalResult.title}`);
    console.log(`- Summary: ${minimalResult.summary}`);
    console.log(`- Content sections: ${minimalResult.mainContent.length}`);
    
    // Test with no code examples
    const noCodeHTML = '<html><body><h1>No Code</h1><p>This page has no code examples.</p></body></html>';
    const noCodeParser = new GuidelineParser(noCodeHTML, 'test-url-2');
    const noCodeResult = noCodeParser.parse();
    console.log('\nNo code examples test:');
    console.log(`- Code examples found: ${noCodeResult.codeExamples.length}`);
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Parser test failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

// Run the test
testParser().catch(console.error);