# SearchWWDC Tool Documentation

## Overview

The `searchWWDC` tool provides powerful search capabilities for WWDC (Apple's Worldwide Developers Conference) session content. It allows searching through session titles, descriptions, transcripts, and code examples to find relevant information that complements Apple's Human Interface Guidelines.

## Tool Schema

```typescript
{
  name: 'searchWWDC',
  description: 'Search WWDC sessions for content related to Apple HIG guidelines',
  parameters: {
    query: string;          // Required: Search query string
    year?: number;          // Optional: Filter by specific year (e.g., 2023)
    platform?: Platform;    // Optional: Filter by platform (ios, macos, watchos, tvos, visionos)
    searchIn?: 'all' | 'titles' | 'transcripts' | 'code';  // Optional: Where to search (default: 'all')
    includeCode?: boolean;  // Optional: Include code examples in results (default: false)
    limit?: number;         // Optional: Maximum number of results (default: 20)
  }
}
```

## Features

### 1. Multi-Source Search
- **Session Metadata**: Search through session titles, descriptions, speakers, and tags
- **Transcripts**: Full-text search through session transcripts with timestamp references
- **Code Examples**: Find sessions with relevant code samples

### 2. Advanced Filtering
- Filter by conference year
- Filter by Apple platform (iOS, macOS, watchOS, tvOS, visionOS)
- Filter by content type (titles only, transcripts only, code examples)
- Control result limits

### 3. Rich Results
- Session details including title, year, duration, and speakers
- Direct links to video content
- Transcript excerpts with timestamps
- Code example references
- Relevance scoring

## Implementation Details

### Architecture

The tool is built with:
- **SessionIndexer**: Manages Fuse.js indexes for fuzzy search capabilities
- **Caching**: NodeCache integration for performance optimization
- **Type Safety**: Full TypeScript implementation with Zod validation

### Search Modes

1. **All** (default): Searches both session metadata and transcripts
2. **Titles**: Searches only session titles and descriptions
3. **Transcripts**: Searches only within transcript content
4. **Code**: Searches sessions that contain code examples

### Result Formatting

Results are formatted as markdown with:
- Hierarchical structure for easy reading
- Direct links to resources
- Highlighted matching segments
- Relevance percentages
- Timestamp references for transcript matches

## Usage Examples

### Basic Search
```javascript
{
  query: "SwiftUI navigation"
}
```

### Filtered Search
```javascript
{
  query: "accessibility",
  year: 2023,
  platform: "ios",
  includeCode: true
}
```

### Transcript-Specific Search
```javascript
{
  query: "dark mode implementation",
  searchIn: "transcripts",
  limit: 10
}
```

## Index Management

The tool requires a pre-built index of WWDC sessions. If the index is not available, it returns a helpful message explaining how to build the index.

### Index Status Methods
- `setIndexBuilt(built: boolean)`: Set index availability
- `getIndexStats()`: Get statistics about indexed content
- `clearCache()`: Clear the search cache

## Integration with HIG

The searchWWDC tool complements the HIG documentation by:
- Providing practical implementation examples
- Showing real-world usage of design patterns
- Linking theoretical guidelines to concrete demonstrations
- Offering code samples from Apple engineers

## Error Handling

The tool includes comprehensive error handling for:
- Missing indexes
- Invalid search parameters
- Network failures
- Cache errors

All errors are logged and return user-friendly messages.

## Performance Considerations

- Results are cached with configurable TTL
- Fuzzy search allows for typo tolerance
- Pagination support for large result sets
- Efficient index structures for fast searches