# Architecture

## Data source

Apple's HIG site (a DocC single-page app) loads each page from
`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<slug>.json`
(the top-level index is `.../human-interface-guidelines.json`). Pages are flat: every page is
addressed by one slug (`buttons`, `color`, `designing-for-ios`), whatever section it sits in.
Unknown slugs return 404 (or an HTML app shell), which the client treats as "not found".

A page document contains:

- `metadata.title` and `metadata.customMetadata["supported-platforms"]` (comma-separated)
- `abstract` and `primaryContentSections[].content[]`: blocks of type `heading`, `paragraph`,
  `unorderedList`/`orderedList`, `table`, `aside`, `row`, `video`, ...
- `references`: lookup table for titles, URLs and image alt text, keyed by DocC identifier
- `topicSections[].identifiers`: for section ("collectionGroup") pages, the child pages
- `hierarchy.paths`: the ancestor chain

There is no site-wide index endpoint, so the catalog is built by walking `topicSections` from the
top-level index and every group page. Titles and abstracts come from the `references` of those
group pages, so leaf pages are fetched only when read (or when a platform filter needs their
metadata).

## Modules

- `hig/client.ts`: `HIGClient.getDoc(slug)`. Validates the slug, rate limits (`RateLimiter`:
  one request at a time, 600 ms minimum gap, 60/min cap), retries with backoff, caches in memory
  and on disk (default 24 h), serves a stale copy on network failure, de-duplicates in-flight
  requests.
- `hig/catalog.ts`: breadth-first crawl into `Map<slug, CatalogEntry>`; the pure
  `entriesFromGroupDoc` is unit tested.
- `hig/search.ts`: tiered lexical score on the title (exact, prefix, all words, substring), then
  slug and abstract matches, then Fuse.js fuzzy matches ranked below those. Plural folding on tokens.
- `hig/render.ts`: DocC JSON to Markdown, with an attribution footer.
- `hig/service.ts`: composes the above into the four tool behaviours. The platform filter fetches
  candidate pages (cached) and checks `supported-platforms`; pages that declare no platforms are
  kept.
- `server.ts`: MCP `Server` over stdio. Invalid parameters raise MCP errors; runtime failures
  (not found, network) come back as `isError` tool results so the model can read them.

## Logging

The stdio transport owns stdout. All logging goes to stderr via `utils/logger.ts`; never use
`console.log` in server code.

## Testing

- `npm test`: vitest with tiny hand-written fixtures in `tests/fixtures/`. Do not add copies of
  Apple's content.
- `npm run smoke`: spawns `dist/index.js`, connects with the MCP SDK client and exercises every
  tool against the live site (about 25 requests, throwaway cache directory).
