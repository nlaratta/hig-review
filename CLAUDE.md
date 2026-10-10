# CLAUDE.md

Unofficial MCP server for Apple's Human Interface Guidelines. See `docs/ARCHITECTURE.md` for the
design and `README.md` for usage.

## Commands

```bash
npm install
npm run build    # tsc -> dist/
npm test         # vitest unit tests, no network
npm run smoke    # builds, then calls every tool over stdio against the live Apple site
```

## Rules

- stdout belongs to the MCP stdio transport. Log only through `src/utils/logger.ts` (stderr).
- Content is fetched from Apple at runtime. Never commit Apple's text or cache files; fixtures in
  `tests/fixtures/` must stay tiny and synthetic.
- Keep requests to Apple polite: go through `HIGClient` (rate limit, User-Agent, cache).
- `SERVER_VERSION` in `src/utils/config.ts` must match `package.json` (a test checks this).
