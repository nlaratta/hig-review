# GetGuideline Tool Implementation Report

## Overview
I've successfully implemented the `getGuideline` tool for retrieving and parsing specific Apple HIG content. The implementation includes a robust parser and a tool that handles caching, content extraction, and formatting.

## Implementation Details

### 1. **GuidelineParser** (`src/parser/GuidelineParser.ts`)
A comprehensive parser that extracts structured content from Apple HIG pages.

#### Parsing Strategy:
- **Title Extraction**: Multiple fallback selectors including meta tags
- **Platform Detection**: URL pattern matching and content analysis
- **Summary Extraction**: Intro text, lead paragraphs, or first substantial content
- **Content Sectioning**: H2/H3 based content organization
- **Code Example Detection**: Pre/code blocks with language identification
- **Design Specifications**: Tables and inline design token mentions
- **Best Practices**: Pattern matching for recommendation language
- **Do's and Don'ts**: Explicit sections and implicit pattern detection
- **Related Links**: Cross-reference extraction with categorization

#### Key Features:
- Resilient parsing with multiple fallback strategies
- Language detection for code examples (Swift, SwiftUI, Objective-C)
- Design token extraction (spacing, colors, dimensions)
- Smart content categorization

### 2. **GetGuideline Tool** (`src/tools/getGuideline.ts`)
The main tool implementation that fetches and processes guidelines.

#### Features:
- **URL Handling**: Supports guideline IDs, relative paths, and full URLs
- **Caching**: NodeCache implementation with configurable TTL
- **Playwright Integration**: Dynamic content loading with proper wait strategies
- **Parameter Support**: 
  - `includeExamples`: Toggle design examples
  - `includeCode`: Toggle code snippets
- **Error Handling**: Comprehensive error messages and logging

### 3. **Server Integration** (`src/server.ts`)
Updated the server to use the real implementation instead of placeholders.

#### Integration Points:
- Tool initialization in constructor
- Response formatting with code highlighting
- Proper error propagation
- MCP-compliant response structure

## Sample Parsed Output Structure

```typescript
{
  title: "Buttons",
  platform: "ios",
  url: "https://developer.apple.com/design/human-interface-guidelines/components/buttons",
  summary: "Buttons initiate app-specific actions...",
  mainContent: [
    {
      title: "Best Practices",
      content: "When using buttons in your app..."
    }
  ],
  bestPractices: [
    "Use verbs in titles",
    "Keep titles short",
    "Make buttons look interactive"
  ],
  codeExamples: [
    {
      language: "swiftui",
      code: "Button(\"Sign In\") { signIn() }",
      description: "Basic button in SwiftUI"
    }
  ],
  designSpecs: [
    {
      property: "Minimum height",
      value: "44pt",
      notes: "For touch targets"
    }
  ],
  dosAndDonts: {
    dos: ["Make buttons look interactive"],
    donts: ["Don't make buttons too small"]
  },
  relatedLinks: [
    {
      title: "Menus",
      url: "https://developer.apple.com/.../menus",
      type: "component"
    }
  ]
}
```

## Code Example Identification

The parser identifies code examples through:
1. **Pre/Code blocks**: `<pre><code>` elements with language classes
2. **Language Detection**: 
   - `language-swift`, `language-swiftui`, `language-objc` classes
   - Content analysis for Swift/SwiftUI keywords
3. **Context Extraction**: Previous paragraph used as description
4. **Inline Code**: Significant code snippets in paragraphs

## Content Extraction Challenges & Solutions

### Challenge 1: Dynamic Content Loading
**Solution**: Playwright with proper wait strategies and timeout handling

### Challenge 2: Inconsistent HTML Structure
**Solution**: Multiple fallback selectors and flexible parsing logic

### Challenge 3: Language Detection
**Solution**: Class attribute analysis with content-based fallbacks

### Challenge 4: Design Token Extraction
**Solution**: Regex patterns for common design values (pt, px, colors)

### Challenge 5: Related Content Categorization
**Solution**: URL pattern matching for guideline types

## Test Scripts

### 1. **Parser Test** (`src/parser/test-parser.ts`)
Tests the parser with sample HTML mimicking Apple HIG structure.

### 2. **Tool Test** (`src/tools/test-guideline.ts`)
End-to-end test with real URLs and cache verification.

## Usage Example

```typescript
const guidelineTool = new GetGuideline(3600); // 1 hour cache

const result = await guidelineTool.execute({
  guidelineId: 'components/buttons',
  includeExamples: true,
  includeCode: true
});

console.log(result.title); // "Buttons"
console.log(result.codeSnippets); // Array of code examples
```

## Next Steps

1. **Search Integration**: Integrate with search functionality for cross-referencing
2. **Batch Processing**: Add support for fetching multiple guidelines
3. **Offline Mode**: Cache persistence across sessions
4. **Enhanced Parsing**: 
   - Video content extraction
   - Interactive example detection
   - Accessibility guideline extraction
5. **Performance Optimization**: 
   - Parallel fetching for related guidelines
   - Smarter cache warming strategies

## Technical Notes

- The parser is designed to be resilient and handle various HTML structures
- Cheerio is used for HTML parsing due to its jQuery-like API
- Playwright handles JavaScript-rendered content
- The implementation follows MCP tool standards with proper error handling
- All file paths in responses are absolute as required