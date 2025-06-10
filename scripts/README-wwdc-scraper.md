# WWDC Session Scraper

A comprehensive script for scraping WWDC (Apple Worldwide Developers Conference) sessions, transcripts, and code examples.

## Features

- **Session Metadata Scraping**: Extracts title, description, speakers, platforms, topics, and more
- **Transcript Download & Parsing**: Downloads WebVTT transcripts and parses them into searchable segments
- **Code Example Extraction**: Automatically identifies and extracts code snippets from transcripts
- **Incremental Updates**: Skip already scraped sessions to save time
- **Search Index Building**: Creates Fuse.js indexes for fast searching
- **Progress Tracking**: Saves progress to resume interrupted scraping sessions
- **Error Handling**: Comprehensive error tracking and reporting
- **Cache Management**: Efficient caching with TTL for different content types

## Usage

### Basic Usage

Scrape WWDC sessions for default years (2022-2024):
```bash
npm run scrape:wwdc
```

### Incremental Scraping

Only scrape new or updated sessions:
```bash
npm run scrape:wwdc:incremental
```

### Dry Run

See what would be scraped without actually doing it:
```bash
npm run scrape:wwdc:dry
```

### Verbose Mode

Enable detailed logging:
```bash
npm run scrape:wwdc:verbose
```

### Command Line Options

```bash
# Scrape specific years
npm run scrape:wwdc -- --years 2023,2024

# Scrape a specific session
npm run scrape:wwdc -- --session wwdc2024-10001

# Rebuild search index
npm run scrape:wwdc -- --rebuild-index

# Limit concurrent operations
npm run scrape:wwdc -- --max-concurrent 5

# Combine options
npm run scrape:wwdc -- --years 2023 --incremental --verbose
```

## How It Works

### 1. Session Discovery
- Fetches the session list for each specified year
- Extracts basic metadata from session cards

### 2. Session Details
- Navigates to each session page
- Extracts comprehensive metadata including:
  - Title and description
  - Speakers and duration
  - Platforms and topics
  - Video, transcript, and sample code URLs

### 3. Transcript Processing
- Downloads WebVTT transcript files
- Parses timestamps and text segments
- Identifies segments containing code

### 4. Code Extraction
- Analyzes transcript segments for code patterns
- Extracts Swift, Objective-C, and other code snippets
- Associates code with context and timestamps

### 5. Index Building
- Creates Fuse.js search indexes for:
  - Session metadata (title, description, topics)
  - Transcript segments (full-text search)
- Enables fast, fuzzy searching across all content

### 6. Caching
- **Session Cache**: 7 days TTL
- **Transcript Cache**: 30 days TTL
- **Code Cache**: 14 days TTL
- Persists to disk for durability

## Progress Tracking

The scraper saves progress to `./cache/wwdc/scraper-progress.json`:
- Tracks scraped/failed sessions
- Records download statistics
- Logs errors by phase
- Allows resuming interrupted sessions

## Error Handling

Errors are categorized by phase:
- `year-listing`: Failed to fetch session list
- `session-details`: Failed to scrape session page
- `transcript`: Failed to download/parse transcript
- `code-extraction`: Failed to extract code examples
- `session-processing`: General processing error

## Cache Structure

```
./cache/wwdc/
├── sessions/          # Session metadata JSON files
│   ├── wwdc2024-10001.json
│   └── ...
├── transcripts/       # Parsed transcript JSON files
│   ├── wwdc2024-10001.json
│   └── ...
├── code/             # Extracted code examples
│   ├── wwdc2024-10001.json
│   └── ...
└── scraper-progress.json
```

## Search Index Features

The built index supports:
- **Fuzzy search** across titles, descriptions, and topics
- **Filtering** by year, platform, speaker, or tags
- **Transcript search** with highlighted matches
- **Code search** to find specific programming patterns

## Performance

- Rate limited to respect Apple's servers
- Concurrent operations limited (default: 3)
- Efficient caching reduces redundant requests
- Progress saved every 10 sessions

## Examples

### Scrape Recent WWDC Sessions
```bash
# Scrape last 3 years incrementally
npm run scrape:wwdc -- --years 2022,2023,2024 --incremental
```

### Update Specific Year
```bash
# Force re-scrape of 2024 sessions
npm run scrape:wwdc -- --years 2024
```

### Debug Specific Session
```bash
# Verbose scraping of a single session
npm run scrape:wwdc -- --session wwdc2024-10145 --verbose
```

### Build Fresh Index
```bash
# Rebuild search index from cached data
npm run scrape:wwdc -- --rebuild-index --dry-run
```

## Integration with HIG MCP

The scraped WWDC content integrates with the HIG MCP server to:
- Link HIG guidelines to relevant WWDC sessions
- Provide code examples from real Apple engineers
- Offer video explanations for design patterns
- Enable cross-referencing between documentation and presentations

## Troubleshooting

### Browser Issues
- Ensure Playwright dependencies are installed: `npx playwright install`
- Use `--verbose` to see browser actions
- Check for browser crashes in logs

### Network Issues
- The scraper includes exponential backoff
- Automatic retries for transient failures
- Check your internet connection stability

### Cache Issues
- Clear cache: `rm -rf ./cache/wwdc`
- Verify disk space availability
- Check file permissions

### Memory Issues
- Reduce `--max-concurrent` value
- Process fewer years at once
- Monitor system resources

## Future Enhancements

- [ ] Download and process video files
- [ ] Extract slides and visual content
- [ ] Parse sample code projects
- [ ] Generate summaries using AI
- [ ] Create relationships between sessions
- [ ] Export to various formats (JSON, Markdown, etc.)