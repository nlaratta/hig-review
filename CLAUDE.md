# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
```bash
# Install dependencies
npm install

# Run TypeScript in development mode
npm run dev:mcp

# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run watch
```

### Testing
```bash
# Test MCP protocol implementation
npm run test:mcp

# Test content parser
npm run test-parser
```

### Production
```bash
# Build and run production server
npm run build
npm run start:mcp
```

### Search Index Management
```bash
# Build initial search index
npm run index

# Update index incrementally
npm run index:incremental

# Rebuild entire index from scratch
npm run index:rebuild

# Test indexing without saving
npm run index:test
```

## Architecture Overview

This is an MCP (Model Context Protocol) server that provides programmatic access to Apple's Human Interface Guidelines. The architecture follows a modular design with clear separation of concerns:

### Core Flow
1. **MCP Protocol Layer** (`src/server.ts`, `src/index.ts`): Handles JSON-RPC communication with Claude Desktop
2. **Tools Layer** (`src/tools/`): Implements 4 MCP tools - searchHIG, getGuideline, browseSection, getServerInfo
3. **Data Flow**: Request → Tool → Scraper/Parser/Search → Cache → Response

### Key Components

**Web Scraping Pipeline**:
- `BrowserManager`: Manages Playwright browser instances with connection pooling
- `HIGScraper`: Scrapes Apple documentation with rate limiting (max 10 concurrent requests)
- `RateLimiter`: Prevents overwhelming Apple's servers

**Content Processing**:
- `GuidelineParser`: Extracts structured content (title, content, best practices, dos/don'ts)
- `CodeExtractor`: Extracts SwiftUI/UIKit code examples with syntax highlighting
- `ContentExtractor`: Processes main content sections and navigation

**Search System**:
- `SearchEngine`: Uses Fuse.js for fuzzy search with weighted scoring
- `IndexBuilder`: Creates searchable index from URL mappings and scraped content
- Pre-indexed content from `url-mappings.json` for instant results

**Caching Strategy**:
- In-memory cache (node-cache) for frequently accessed data
- Disk cache for persistent storage with TTL
- Cache warming for popular sections on startup

### Configuration

The server uses environment variables with sensible defaults:
- `CACHE_ENABLED` (default: true)
- `CACHE_TTL` (default: 3600000ms / 1 hour)
- `MAX_CONCURRENT_REQUESTS` (default: 10)
- `SCRAPING_ENABLED` (default: true)
- `DEBUG` (default: false)

### MCP Tools Implementation

Each tool has specific responsibilities:
- **searchHIG**: Fuzzy search with platform/category filtering
- **getGuideline**: Fetch and parse specific guidelines with code examples
- **browseSection**: Navigate documentation hierarchy
- **getServerInfo**: Health checks and statistics

Tools validate inputs using Zod schemas and handle errors gracefully with custom error types.

## Claude Desktop Integration

To use this server with Claude Desktop, add to `claude_desktop_config.json`:
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

Config file locations:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

## TypeScript Configuration

The project uses strict TypeScript with:
- Target: ES2022
- Module: ESNext (for native ES modules)
- Strict mode enabled
- Source maps for debugging
- Declaration files generated

## Key Implementation Details

- All async operations use proper error handling with try-catch blocks
- Rate limiting prevents more than 10 concurrent requests to Apple's servers
- Browser instances are reused via connection pooling for performance
- Search results are cached to reduce repeated scraping
- Content parsing preserves code formatting and handles edge cases
- The server gracefully handles shutdown signals (SIGINT, SIGTERM)