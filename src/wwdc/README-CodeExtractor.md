# WWDC CodeExtractor Component

The CodeExtractor is a specialized component designed to extract, validate, and organize code examples from WWDC video transcripts. It works in conjunction with the TranscriptParser to identify code segments and provide rich metadata about each example.

## Features

### 1. **Multi-Language Support**
- **Swift/SwiftUI**: Detects Swift code including SwiftUI views, property wrappers, and modern Swift syntax
- **Objective-C**: Identifies Objective-C code with proper interface/implementation detection
- **JavaScript**: Recognizes JavaScript and web-related code examples
- **Automatic Detection**: Intelligently determines the programming language based on syntax patterns

### 2. **Code Extraction Methods**
- **Explicit Blocks**: Finds code wrapped in backticks or other markers
- **Pattern-Based**: Identifies code through language-specific patterns
- **Context-Aware**: Uses surrounding text to determine code boundaries
- **Indentation Detection**: Recognizes indented code blocks

### 3. **Code Validation**
- **Syntax Validation**: Validates code against language-specific patterns
- **Completeness Check**: Determines if code is a complete example or fragment
- **Bracket Balancing**: Ensures proper bracket/brace matching
- **Structure Validation**: Checks for complete class/function definitions

### 4. **Context Extraction**
- **Surrounding Context**: Captures explanatory text around code
- **Title Inference**: Automatically generates titles from context
- **Timestamp Tracking**: Links code to specific video timestamps
- **Speaker Attribution**: Associates code with presenters (when available)

### 5. **Code Cleanup**
- **Artifact Removal**: Removes transcript artifacts like [inaudible] markers
- **Indentation Fixing**: Normalizes code indentation
- **Whitespace Normalization**: Cleans up spacing issues
- **Line Break Correction**: Properly formats code structure

## Usage

### Basic Usage

```typescript
import { CodeExtractor } from './CodeExtractor.js';
import { TranscriptParser } from './TranscriptParser.js';

// Create instances
const parser = new TranscriptParser();
const extractor = new CodeExtractor();

// Parse transcript
const transcript = parser.parseVTT(vttContent, 'wwdc2023-10001');

// Extract code examples
const codeExamples = extractor.extractFromTranscript(transcript);

// Process results
codeExamples.forEach(example => {
  console.log(`Language: ${example.language}`);
  console.log(`Complete: ${example.isComplete}`);
  console.log(`Code:\n${example.code}`);
});
```

### Integration with WWDCCodeService

```typescript
import { WWDCCodeService } from './integration-example.js';

const service = new WWDCCodeService();

// Process entire session
const result = await service.processSession(
  transcriptContent, 
  'wwdc2023-10001', 
  'vtt'
);

// Filter by language
const swiftExamples = service.filterByLanguage(
  result.codeExamples, 
  'swift'
);

// Search by keywords
const uiExamples = service.searchCodeExamples(
  result.codeExamples, 
  ['SwiftUI', 'View']
);

// Export to markdown
const markdown = service.exportExamples(
  result.codeExamples, 
  'markdown'
);
```

## Code Detection Patterns

### Swift Detection
- Import statements: `import SwiftUI`, `import UIKit`
- Type declarations: `struct`, `class`, `enum`, `protocol`
- Property wrappers: `@State`, `@Binding`, `@Published`
- Function syntax: `func name() -> Type`
- SwiftUI specific: `var body: some View`

### Objective-C Detection
- Import syntax: `#import <Framework/Header.h>`
- Interface/Implementation: `@interface`, `@implementation`
- Properties: `@property (nonatomic, strong)`
- Method calls: `[object method]`
- Foundation types: `NSString *`, `NSArray *`

### JavaScript Detection
- Variable declarations: `const`, `let`, `var`
- Function syntax: `function name()`, `() => {}`
- ES6+ features: `class`, `export`, `import`
- Async patterns: `async`, `await`

## Output Format

Each extracted code example includes:

```typescript
interface WWDCCodeExample {
  sessionId: string;      // WWDC session identifier
  timestamp: number;      // Video timestamp in seconds
  code: string;          // The extracted code
  language: string;      // Detected language
  context: string;       // Surrounding explanation
  title?: string;        // Inferred or explicit title
  isComplete: boolean;   // Whether code is complete
}
```

## Advanced Features

### Code Fragment Merging
The extractor can identify and merge related code fragments that appear close together in the transcript:

```typescript
// Fragments within 10 seconds are analyzed for relationships
// Merged based on shared identifiers and context
```

### Validation Rules

#### Swift Validation
- Must contain Swift-specific keywords or patterns
- Property wrappers indicate SwiftUI code
- Checks for proper struct/class syntax

#### Completeness Detection
- Balanced brackets and braces
- Complete function/class definitions
- Proper statement termination

### Context Window
- Captures 2 segments before and after code
- Provides comprehensive understanding
- Helps with title inference

## Best Practices

1. **Transcript Quality**: Higher quality transcripts yield better extraction results
2. **Code Markers**: Transcripts with explicit code markers (backticks) work best
3. **Context Preservation**: Always include surrounding context for better understanding
4. **Language Hints**: Use language-specific patterns for accurate detection

## Testing

Run the test file to see the extractor in action:

```bash
npm run test:wwdc-code-extractor
```

Or directly:

```bash
npx tsx src/wwdc/test-code-extractor.ts
```

## Future Enhancements

1. **Sample Project Integration**: Extract code from downloadable sample projects
2. **Code Relationship Mapping**: Build dependency graphs between code examples
3. **Live Validation**: Validate Swift/SwiftUI code against actual compiler
4. **Enhanced Context**: Include slide content and visual demonstrations
5. **Code Evolution Tracking**: Track how code examples change across WWDC years