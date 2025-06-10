/**
 * Test file for the WWDC CodeExtractor component
 */

import { CodeExtractor } from './CodeExtractor.js';
import { TranscriptParser } from './TranscriptParser.js';
import { WWDCTranscript, TranscriptSegment } from '../types/wwdc.js';

// Sample VTT content with code examples
const sampleVTT = `WEBVTT

00:00:00.000 --> 00:00:05.000
Welcome to Building SwiftUI Views. Today we'll explore how to create custom views.

00:00:05.000 --> 00:00:10.000
Let's start by looking at a simple SwiftUI view. Here's the code:

00:00:10.000 --> 00:00:15.000
struct ContentView: View {
    @State private var count = 0
    
    var body: some View {
        VStack {
            Text("Count: \(count)")
            Button("Increment") {
                count += 1
            }
        }
    }
}

00:00:15.000 --> 00:00:20.000
This creates a simple counter view with a text label and button.

00:00:20.000 --> 00:00:25.000
Now let's add some animation. We can modify our button action like this:

00:00:25.000 --> 00:00:30.000
Button("Increment") {
    withAnimation(.spring()) {
        count += 1
    }
}

00:00:30.000 --> 00:00:35.000
For more complex state management, you might want to use ObservableObject:

00:00:35.000 --> 00:00:45.000
class CounterViewModel: ObservableObject {
    @Published var count = 0
    
    func increment() {
        count += 1
    }
}

00:00:45.000 --> 00:00:50.000
And then use it in your view with @StateObject or @ObservedObject.

00:00:50.000 --> 00:00:55.000
Here's how you'd integrate it:

00:00:55.000 --> 00:01:00.000
struct ContentView: View {
    @StateObject private var viewModel = CounterViewModel()
    
    var body: some View {
        VStack {
            Text("Count: \(viewModel.count)")
            Button("Increment") {
                viewModel.increment()
            }
        }
    }
}

00:01:00.000 --> 00:01:05.000
Let's also look at some Objective-C code for comparison:

00:01:05.000 --> 00:01:15.000
@interface CounterViewController : UIViewController
@property (nonatomic, assign) NSInteger count;
@property (nonatomic, strong) UILabel *countLabel;
@end

@implementation CounterViewController
- (void)incrementCount {
    self.count++;
    self.countLabel.text = [NSString stringWithFormat:@"Count: %ld", (long)self.count];
}
@end

00:01:15.000 --> 00:01:20.000
And that's the basics of creating interactive views!
`;

// Test function
async function testCodeExtractor() {
  console.log('Testing WWDC CodeExtractor...\n');
  
  // Create instances
  const parser = new TranscriptParser();
  const extractor = new CodeExtractor();
  
  // Parse the VTT content
  const transcript = parser.parseVTT(sampleVTT, 'wwdc2023-example');
  
  console.log(`Parsed ${transcript.segments.length} segments from transcript\n`);
  
  // Show segments with code
  const codeSegments = transcript.segments.filter(s => s.hasCode);
  console.log(`Found ${codeSegments.length} segments with code indicators:\n`);
  
  codeSegments.forEach((segment, index) => {
    console.log(`Segment ${index + 1} (${segment.startTime}s - ${segment.endTime}s):`);
    console.log(`Text: ${segment.text.substring(0, 100)}...`);
    console.log(`Has Code: ${segment.hasCode}\n`);
  });
  
  // Extract code examples
  const codeExamples = extractor.extractFromTranscript(transcript);
  
  console.log(`\nExtracted ${codeExamples.length} code examples:\n`);
  
  // Display extracted code
  codeExamples.forEach((example, index) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Code Example ${index + 1}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Timestamp: ${example.timestamp}s`);
    console.log(`Language: ${example.language}`);
    console.log(`Title: ${example.title || 'N/A'}`);
    console.log(`Is Complete: ${example.isComplete}`);
    console.log(`\nCode:`);
    console.log(`${'`'.repeat(3)}${example.language}`);
    console.log(example.code);
    console.log(`${'`'.repeat(3)}`);
    console.log(`\nContext: ${example.context.substring(0, 150)}...`);
  });
  
  // Test specific extraction methods
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('Testing Language Detection');
  console.log(`${'='.repeat(60)}\n`);
  
  const testSnippets = [
    'struct MyView: View { var body: some View { Text("Hello") } }',
    '@interface MyClass : NSObject\n@property NSString *name;\n@end',
    'const handleClick = () => { console.log("clicked"); }',
    'func calculateSum(a: Int, b: Int) -> Int { return a + b }'
  ];
  
  testSnippets.forEach(snippet => {
    // We'll need to make detectLanguage public or test through the full extraction
    console.log(`Snippet: ${snippet.substring(0, 50)}...`);
    // This would show detected language if the method was public
  });
  
  // Test validation of Swift/SwiftUI patterns
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('Code Completeness Analysis');
  console.log(`${'='.repeat(60)}\n`);
  
  const completeCode = `struct ContentView: View {
    var body: some View {
        Text("Hello, World!")
    }
}`;
  
  const fragmentCode = `struct ContentView: View {
    var body: some View {`;
  
  console.log('Complete code example:');
  console.log(completeCode);
  console.log(`Is complete: Would be tested if method was public\n`);
  
  console.log('Fragment code example:');
  console.log(fragmentCode);
  console.log(`Is complete: Would be tested if method was public\n`);
}

// Run the test
testCodeExtractor().catch(console.error);