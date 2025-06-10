# Apple HIG MCP Server

An MCP (Model Context Protocol) server that provides access to Apple's Human Interface Guidelines and documentation.

## Project Structure

```
apple-hig-mcp/
├── APPLE_HIG_MCP_PLAN.md      # Detailed implementation plan
├── IMPLEMENTATION_ROADMAP.md   # Technical roadmap with code examples
├── package.json               # Node.js dependencies
├── tsconfig.json             # TypeScript configuration
├── src/
│   ├── server.ts             # Main MCP server (starter implementation)
│   ├── tools/                # Tool implementations
│   ├── scraper/              # Web scraping logic
│   ├── parser/               # Content parsing
│   ├── search/               # Search engine
│   ├── cache/                # Caching layer
│   └── types/                # TypeScript types
└── tests/                    # Test suite (to be added)
```

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Configure Claude Desktop:**
   Add to your `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "apple-hig": {
         "command": "node",
         "args": ["/path/to/HIGMcp/dist/server.js"]
       }
     }
   }
   ```

## Available Tools

1. **searchHIG** - Search Apple Human Interface Guidelines
2. **getGuideline** - Get specific guideline with examples
3. **browseSection** - Browse documentation sections

## Implementation Status

- ✅ Project structure and planning documents
- ✅ Basic MCP server skeleton
- ⏳ Web scraping implementation
- ⏳ Content parsing and indexing
- ⏳ Search functionality
- ⏳ Caching system
- ⏳ Full tool implementations

## Next Steps

Follow the implementation roadmap in `IMPLEMENTATION_ROADMAP.md` for week-by-week development plan.

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```