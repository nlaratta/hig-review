# Apple HIG MCP Server

An MCP (Model Context Protocol) server that provides programmatic access to Apple's Human Interface Guidelines through Claude Desktop.

## Features

- 🔍 **Smart Search**: Fuzzy search across all Apple HIG documentation
- 📖 **Content Retrieval**: Fetch specific guidelines with code examples and best practices
- 🧭 **Navigation**: Browse documentation sections hierarchically
- 🎥 **WWDC Integration**: Access related WWDC sessions and video content
- ⚡ **Performance**: Multi-level caching for fast responses
- 🔄 **Rate Limiting**: Respectful scraping of Apple's servers

## Project Structure

```
HIGMcp/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server implementation
│   ├── tools/                # MCP tool implementations
│   ├── scraper/              # Web scraping with Playwright
│   ├── parser/               # Content parsing with Cheerio
│   ├── search/               # Fuzzy search with Fuse.js
│   ├── cache/                # Multi-level caching
│   ├── wwdc/                 # WWDC session integration
│   ├── integration/          # HIG-WWDC linking
│   └── types/                # TypeScript definitions
├── scripts/
│   ├── index-content.ts      # Search index builder
│   └── test-mcp.js           # MCP protocol tester
├── docs/                     # Implementation reports
├── CLAUDE.md                 # Guide for Claude instances
└── cache/                    # Cache storage
```

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/HIGMcp.git
   cd HIGMcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Build search index (optional but recommended):**
   ```bash
   npm run index
   ```

## Configuration

### Claude Desktop Setup

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-hig": {
      "command": "node",
      "args": ["/absolute/path/to/HIGMcp/dist/index.js"]
    }
  }
}
```

**Config file locations:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### Environment Variables (Optional)

- `CACHE_ENABLED`: Enable/disable caching (default: `true`)
- `CACHE_TTL`: Cache time-to-live in ms (default: `3600000`)
- `MAX_CONCURRENT_REQUESTS`: Max concurrent scraping requests (default: `10`)
- `SCRAPING_ENABLED`: Enable/disable web scraping (default: `true`)
- `DEBUG`: Enable debug logging (default: `false`)

## Available Tools

### 1. searchHIG
Search Apple's Human Interface Guidelines with fuzzy matching.

**Parameters:**
- `query` (required): Search term
- `platform` (optional): ios, macos, watchos, tvos, visionos
- `category` (optional): foundations, components, patterns

**Example:** "Search for button guidelines in iOS"

### 2. getGuideline
Retrieve specific guideline content with examples and code.

**Parameters:**
- `guidelineId` (required): Guideline ID or URL path
- `includeExamples` (optional): Include design examples (default: true)
- `includeCode` (optional): Include code samples (default: true)
- `includeWWDC` (optional): Include related WWDC sessions (default: true)

**Example:** "Get the color system guidelines for macOS"

### 3. browseSection
Navigate documentation sections hierarchically.

**Parameters:**
- `section` (required): Section path (e.g., "components/buttons")
- `platform` (required): Target platform

**Example:** "Browse the iOS components section"

### 4. searchWWDC
Search WWDC sessions related to HIG topics.

**Parameters:**
- `query` (required): Search query string
- `year` (optional): Filter by specific year (e.g., 2023)
- `platform` (optional): Filter by Apple platform
- `searchIn` (optional): Search scope (all, titles, transcripts, code)
- `includeCode` (optional): Include code examples (default: false)
- `limit` (optional): Maximum results (default: 20)

**Example:** "Find WWDC sessions about SwiftUI buttons"

### 5. getSession
Get detailed WWDC session information.

**Parameters:**
- `sessionId` (required): WWDC session ID
- `includeTranscript` (optional): Include full transcript (default: false)
- `includeCode` (optional): Include code examples (default: false)
- `timestamp` (optional): Jump to specific timestamp
- `includeRelatedGuidelines` (optional): Include related HIG guidelines (default: false)

**Example:** "Get details for WWDC 2023 session 10115"

### 6. getServerInfo
Get server status and statistics.

**Example:** "Show HIG server info"

## Development

```bash
# Development mode with auto-reload
npm run dev:mcp

# Build TypeScript
npm run build

# Run tests
npm run test:mcp

# Test content parser
npm run test-parser

# Watch mode
npm run watch

# Manage search index
npm run index              # Build initial index
npm run index:incremental  # Update incrementally
npm run index:rebuild      # Rebuild from scratch
```

## Implementation Status

- ✅ **Core MCP Server**: Full protocol implementation
- ✅ **All 6 Tools**: searchHIG, getGuideline, browseSection, searchWWDC, getSession, getServerInfo
- ✅ **Web Scraping**: Playwright-based scraper with rate limiting
- ✅ **Content Parsing**: Structured extraction of guidelines, code, examples
- ✅ **Search Engine**: Fuzzy search with Fuse.js
- ✅ **WWDC Integration**: Session search, transcript parsing, HIG-WWDC linking
- ✅ **Caching System**: Multi-level caching (memory + disk)
- ✅ **Error Handling**: Comprehensive error handling and logging
- ✅ **Testing Suite**: MCP protocol and component tests
- ✅ **Real Data**: No mocks - all tools fetch live content from Apple's servers

## Contributing

See [CLAUDE.md](CLAUDE.md) for architecture details and development guidelines.

## License

This project is for educational and development purposes. Please respect Apple's Human Interface Guidelines usage terms.