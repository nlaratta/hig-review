# Architecture

hig-review has two halves:

- **The lookup layer** (`src/hig/`) fetches and renders Apple's HIG pages.
- **The review layer** (`src/rules/`, `src/swift/`) turns them into cited checklists, SwiftUI heuristics and contrast checks.

Both are exposed by one MCP server (`src/server.ts`). The Claude Code plugin is that server bundled into `plugin/server.mjs`, plus a skill and a subagent that tell the model how to run a review. The model does all visual judgment, and no tool looks at an image.

## Data source

Apple's HIG site (a DocC single-page app) loads each page from
`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<slug>.json`.
The top-level index is `.../human-interface-guidelines.json`.

Pages are flat: every page is addressed by one slug (`buttons`, `color`, `designing-for-ios`), whatever section it sits in. Unknown slugs return 404, or an HTML app shell, which the client treats as "not found".

A page document contains:

- `metadata.title` and `metadata.customMetadata["supported-platforms"]` (comma-separated)
- `abstract` and `primaryContentSections[].content[]`: blocks of type `heading` (with `anchor`), `paragraph`, `unorderedList`/`orderedList`, `table`, `aside`, `row`, `tabNavigator`, `video`, ...
- `references`: lookup table for titles, URLs and image alt text, keyed by DocC identifier
- `topicSections[].identifiers`: for section ("collectionGroup") pages, the child pages
- `hierarchy.paths`: the ancestor chain

## Lookup layer (`src/hig/`)

- `client.ts`: `HIGClient.getDoc(slug)`.
  - Validates the slug.
  - Rate limits with `RateLimiter`: one request at a time, a 600 ms minimum gap and a cap of 60 per minute.
  - Retries with backoff.
  - Caches in memory and on disk, for 24 h by default.
  - Serves a stale copy on network failure.
  - De-duplicates in-flight requests.
- `catalog.ts`: a breadth-first crawl of `topicSections` into `Map<slug, CatalogEntry>`. It is used only by `search_hig`, `browse_hig` and `get_guideline`, and costs about 20 requests once per cache lifetime.
- `search.ts`: a tiered lexical score on the title, then slug and abstract, then Fuse.js fuzzy matches.
- `render.ts`: converts DocC JSON to Markdown, with an attribution footer.
- `service.ts`: the behavior behind `search_hig`, `get_guideline` and `browse_hig`.

## Review layer

### Rules and citations (`src/rules/`)

- `registry.ts`: the rules. Each rule has:
  - `id`, `title`, `components` and `platforms`
  - `severity`
  - `check`, our own paraphrase
  - `source: { slug, phrase }`
  - `data`, the numbers used by deterministic checks (for example control sizes per platform)

  `COMPONENTS` maps canonical component ids to names and aliases. Platform variants are separate rules (`controls.size.ios`, `controls.size.macos`, ...); `ruleFor(prefix, platform)` picks one, and iPadOS falls back to the iOS rule.
- `citation.ts`:
  - `flattenDoc` turns a page into text units: sentences of paragraphs, list items and asides, and table rows joined with ` | ` plus their header row. Each unit is tagged with its heading path and anchor.
  - `normalize` folds curly quotes, dashes and odd spaces, so locator phrases survive typography.
  - `citeFromDoc` returns the first unit containing the phrase as `{ verified: true, page, url#anchor, section, quote }`. If no unit contains it, it returns `{ verified: false, note }` with no quote, so stale wording is never quoted from memory.
  - `Citer` wraps `HIGClient`. A fetch failure also produces `verified: false`.
- `checklist.ts`:
  - Resolves names to components: exact alias, then a multi-word partial match, then Fuse.js suggestions.
  - Selects the rules for those components and the platform, high severity first.
  - Cites each rule. A checklist only fetches the pages its rules cite (at most 21) and never triggers the catalog crawl.
- `contrast.ts`:
  - Parses colors and computes WCAG 2.x relative luminance and contrast ratio.
  - A translucent foreground is composited over the background.
  - A translucent background is composited over both white and black, and the worse ratio is reported.
  - Pass/fail uses the unrounded ratio.
  - The HIG categories come from the Accessibility page's table: text up to 17 pt needs 4.5:1, and 18 pt or bold text needs 3:1.
- `verify.ts`: `checkRule` checks that the phrase is found. It also detects platform-scoped headings ("watchOS", "iOS, iPadOS"); a rule whose sentence sits under one must not claim other platforms. `npm run smoke` runs this for every rule against the live pages.

### SwiftUI heuristics (`src/swift/`)

- `lexer.ts`: `maskSwift` replaces comments with spaces and string contents with `x`. Offsets, line breaks and string delimiters are preserved. It handles nested block comments, multi-line strings, raw strings (`#"…"#`) and interpolation, including strings nested inside an interpolation. All pattern matching runs on the masked text.
- `syntax.ts`: shallow structure on masked text:
  - calls with arguments and trailing closures (including `label:` closures)
  - modifier chains
  - walking back from a modifier to the head of its expression
  - the call that encloses an offset (to tell a `.background { … }` argument from content)
  - literal `.frame(width:height:)` sizes
- `heuristics.ts`: eleven checks. Each one maps to a registry rule and assigns a severity and a confidence. `HEURISTICS` documents what each check flags and its known false positives; that list feeds `docs/RULES.md`.
- `review.ts`: input handling. It takes inline code or a `.swift` path, resolved against the server's working directory, with a 200 KB cap. It attaches citations and a summary, and adds a fixed note that heuristics can misfire.

## Server (`src/server.ts`)

The server is an MCP `Server` over stdio with seven snake_case tools:

- `hig_checklist`
- `review_swiftui`
- `check_contrast`
- `search_hig`
- `get_guideline`
- `browse_hig`
- `server_info`

The review tools return pretty-printed JSON. Invalid parameters raise MCP errors. Runtime failures (page not found, unreadable file, unparsable color) come back as `isError` tool results the model can read.

## Plugin packaging

- `.claude-plugin/plugin.json` declares the MCP server as `node ${CLAUDE_PLUGIN_ROOT}/plugin/server.mjs`.
- `.claude-plugin/marketplace.json` lists the plugin with `source: "./"`, so the repository is its own one-plugin marketplace.
- `skills/hig-review/SKILL.md` holds the review procedure and reporting rules.
- `agents/hig-reviewer.md` defines a subagent limited to `Read` and the server's tools. Tool names follow `mcp__plugin_<plugin>_<server>__<tool>`.
- `plugin/server.mjs` is built by `scripts/bundle.mjs`:
  - esbuild, platform node, ESM, target node20
  - a `createRequire` banner for the CommonJS dependencies
  - no sourcemap, and paths relative to the repo, so output is deterministic

  Bundled package licenses are written to `plugin/THIRD_PARTY_LICENSES.txt`. Both files are committed on purpose, and CI fails if they are stale.
- `CLAUDE.md` lives in `.claude/` because the validator rejects one at a plugin root.

## Logging

The stdio transport owns stdout. All logging goes to stderr via `utils/logger.ts`; never use `console.log` in server code.

## Testing

- `npm test` runs vitest offline:
  - registry integrity
  - citation extraction on a synthetic DocC-shaped page, including the not-found and fetch-failure paths
  - checklist resolution and aliases
  - contrast math against known WCAG values
  - a positive and a negative fixture set for every heuristic
  - version sync between `package.json`, `config.ts` and `plugin.json`
  - `docs/RULES.md` coverage
- `npm run smoke` drives every tool over stdio against the live site, then re-verifies every registry phrase and its platform scope. `--bundle` runs an isolated copy of `plugin/server.mjs` in an empty temp directory.
- CI runs the build and tests, checks that the bundle is not stale, validates the plugin files offline, and starts the bundle without `node_modules`.
