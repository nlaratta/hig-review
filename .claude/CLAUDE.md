# CLAUDE.md

hig-review: a design-review tool grounded in Apple's Human Interface Guidelines, shipped as an MCP
server and a Claude Code plugin. See `docs/ARCHITECTURE.md` for the design, `docs/RULES.md` for the
rule list and `README.md` for usage.

(This file lives in `.claude/` because the repo root is a plugin root, where `claude plugin
validate --strict` rejects a CLAUDE.md.)

## Commands

```bash
npm install
npm run build            # tsc -> dist/
npm test                 # vitest unit tests, no network
npm run bundle           # esbuild -> plugin/server.mjs; commit it (CI fails on a stale bundle)
npm run smoke            # all tools over stdio against the live site + live re-check of every rule phrase
npm run smoke:bundle     # same, against an isolated copy of plugin/server.mjs
npm run validate:plugin  # offline plugin/marketplace checks (CI)
claude plugin validate --strict .
```

## Rules

- The server never judges images. Tool descriptions, the skill and the README must not imply it does.
- Every rule in `src/rules/registry.ts` must cite a live HIG page and a locator phrase you have
  confirmed on that page (run `npm run smoke`). Paraphrase `check` in our own words; never paste
  Apple's sentences into the repo. Phrases are short locator fragments (a few words, max 60 chars, enforced by tests) and must match
  exactly one sentence on the page (smoke fails on ambiguous phrases).
- A rule sourced from a platform-specific section ("watchOS", "iOS, iPadOS") must be scoped to those
  platforms; the smoke test enforces it.
- Every SwiftUI heuristic needs positive and negative fixtures in `tests/fixtures/swiftui.ts`
  (synthetic code only) and a row in `docs/RULES.md` (a test checks both).
- After changing `src/`, run `npm run bundle` and commit `plugin/server.mjs` and
  `plugin/THIRD_PARTY_LICENSES.txt`.
- stdout belongs to the MCP stdio transport. Log only through `src/utils/logger.ts` (stderr).
- Content is fetched from Apple at runtime. Never commit Apple's text or cache files; fixtures in
  `tests/fixtures/` must stay tiny and synthetic.
- Keep requests to Apple polite: go through `HIGClient` (rate limit, User-Agent, cache).
- Versions in `package.json`, `src/utils/config.ts` and `.claude-plugin/plugin.json` must match
  (a test checks this). Don't set `version` in `marketplace.json`.
