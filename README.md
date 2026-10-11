<p align="center">
  <img src=".github/banner.png" alt="HIG Review" width="100%">
</p>

<p align="center">
  <a href="https://github.com/nlaratta/hig-review/actions/workflows/ci.yml"><img src="https://github.com/nlaratta/hig-review/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2D6A4F" alt="MIT license"></a>
</p>

Review Apple-platform UI against the Human Interface Guidelines from Claude: cited checklists, SwiftUI heuristics, contrast checks.

Show Claude a screenshot, simulator capture or SwiftUI view and ask what breaks the HIG. Claude does the looking. hig-review supplies the rules: 107 curated checks across 21 HIG pages, each cited with a link and a one-sentence quote fetched live from Apple. It also runs deterministic checks on code and colors. It ships as an MCP server and as a Claude Code plugin with a review skill and a reviewer subagent.

Unofficial: not affiliated with or endorsed by Apple. See [Content and copyright](#content-and-copyright).

## Quick start

Requires Node.js 20 or newer.

**Claude Code plugin.** This installs the MCP server, the `hig-review` skill and the `hig-reviewer` agent:

```
/plugin marketplace add nlaratta/hig-review
/plugin install hig-review@hig-review
```

Then paste a screenshot and ask "Review this screen against the HIG", or run `/hig-review:hig-review`.

The plugin runs the self-contained `plugin/server.mjs`. Because the repository root also has a `package.json` and `package-lock.json`, Claude Code installs the npm dependencies into its plugin cache on install. It does this for every such plugin and can't be turned off. The server doesn't need them.

**MCP server only (Claude Code).** The bundled server needs no `npm install`:

```bash
git clone https://github.com/nlaratta/hig-review.git
claude mcp add hig-review -- node "$(pwd)/hig-review/plugin/server.mjs"
```

**Claude Desktop.** Add this to `claude_desktop_config.json` and restart Claude Desktop. The file is at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS and `%APPDATA%\Claude\claude_desktop_config.json` on Windows. Use the absolute path to your clone:

```json
{
  "mcpServers": {
    "hig-review": {
      "command": "node",
      "args": ["/absolute/path/to/hig-review/plugin/server.mjs"]
    }
  }
}
```

## How a review works

1. **Claude looks** at the screenshot and lists what it sees: platform, tab bar, list, buttons, sheet, text, colors.
2. **`hig_checklist`** returns the rules for those components and that platform. Each rule has an id, a severity and a short check, plus a citation: page title, section link, and the sentence that backs it, fetched from Apple at call time.
3. **Claude judges** each rule against the image: fails, passes, or can't be judged from a screenshot.
4. **`review_swiftui`** runs lexical heuristics on SwiftUI source when you have it, and reports line numbers, snippets, confidence and citations.
5. **`check_contrast`** computes exact WCAG contrast ratios for color pairs and applies the HIG's own thresholds.
6. Claude reports findings grouped by severity, each labeled as a **verified rule**, a **heuristic** or a **judgment call**.

The server never analyzes images. All visual judgment is the model's, and the tools keep that judgment tied to the actual guideline text.

## Tools

| Tool | What it does |
| --- | --- |
| `hig_checklist` | `components: string[]` (for example `"tab bar"`, `"button"`, `"sheet"`, `"list"`, `"navigation bar"`, `"alert"`, `"typography"`, `"color"`, `"dark mode"`, `"accessibility"`, `"safe area"`, `"app icon"`, `"SF Symbols"`, `"onboarding"`) plus an optional `platform`. Returns the applicable rules with live citations. Unknown names come back with suggestions. |
| `review_swiftui` | `code` or `path` (a `.swift` file, up to 200 KB; prefer absolute paths, because relative ones resolve against the server's working directory) plus `platform` (default `ios`). Returns heuristic findings with rule id, lines, snippet, message, severity, confidence and citation, plus a summary. |
| `check_contrast` | `foreground`, `background` (`#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()`/`rgba()`), plus optional `backdrop`, `fontSizePt` and `bold`. Returns the WCAG 2.x ratio and AA/AAA results. Separately, it returns the HIG Accessibility table verdict for that text and the Dark Mode minimum (4.5:1) and preferred (7:1) results, with citations. A translucent background needs an opaque `backdrop`; without one the result is `compliance: "unknown"`. |
| `search_hig` | Ranked search over HIG page titles and summaries. |
| `get_guideline` | A full HIG page as Markdown, by id (`buttons`), path or URL. |
| `browse_hig` | The HIG table of contents, or the pages in a section. |
| `server_info` | Version, cache location, rule and heuristic counts, and known component names. |

## What it checks

The full list, with every rule's paraphrase and source page, is in [docs/RULES.md](docs/RULES.md).

| Area | Rule ids | Verified on |
| --- | --- | --- |
| Hit targets and spacing | `controls.size.{ios,macos,tvos,visionos,watchos}`, `controls.spacing.{bezeled,borderless}`, `buttons.hit-region` | [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) |
| Buttons | `buttons.press-state`, `buttons.purpose`, `buttons.prominent-style`, `buttons.destructive-not-primary`, `buttons.familiar-icons` | [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) |
| Typography and Dynamic Type | `type.dynamic-type`, `type.layout-adapts`, `type.truncation`, `type.light-weights`, `type.size.<platform>`, `a11y.larger-text`, `symbols.scale-with-text` | [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) |
| Contrast and color | `contrast.text`, `contrast.large-text`, `contrast.bold-text`, `contrast.all-appearances`, `contrast.preferred`, `color.not-alone`, `color.system-colors`, `color.all-contexts`, `color.consistent-meaning`, `color.semantic-meaning` | [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) |
| Dark Mode | `dark.adaptive-colors`, `dark.both-modes`, `dark.no-app-setting`, `dark.label-colors`, `dark.system-backgrounds` | [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) |
| VoiceOver and gestures | `a11y.labels`, `a11y.custom-elements`, `a11y.meaningful-images`, `a11y.decorative-images`, `a11y.gesture-alternatives`, `gestures.*` | [VoiceOver](https://developer.apple.com/design/human-interface-guidelines/voiceover), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) |
| Layout | `layout.safe-area`, `layout.full-bleed-backgrounds`, `layout.size-classes`, `layout.adapts`, `layout.text-size-changes`, `layout.controls-vs-content` | [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) |
| Bars | `tabbar.*` (7), `toolbar.*` (5) | [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) |
| Alerts, action sheets, sheets | `alert.*` (7), `actionsheet.*` (3), `sheet.*` (4) | [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts), [Action sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets), [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) |
| Lists and controls | `list.*`, `toggle.*`, `segmented.*`, `textfield.*` | [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables), [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles), [Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls), [Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields) |
| Icons, symbols, onboarding, launch | `icon.*`, `symbols.*`, `onboarding.*`, `launch.*` | [App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons), [SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols), [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [Launching](https://developer.apple.com/design/human-interface-guidelines/launching) |

`review_swiftui` runs 11 heuristics:

- `hit-target-size`
- `fixed-font-size`
- `font-below-minimum`
- `hard-coded-color`
- `icon-only-button-label`
- `tap-gesture-as-button`
- `ignores-safe-area-content`
- `screen-bounds-layout`
- `alert-button-count`
- `segmented-count`
- `light-font-weight`

[docs/RULES.md](docs/RULES.md) lists what each one flags and its known false positives.

## Limits

- **Heuristics misfire.** `review_swiftui` does lexical analysis, not compilation. It can't see custom styles, wrapper views or runtime values, and it misses anything not written literally. Treat findings as leads, and don't read an empty result as a pass.
- **The model does the visual judgment.** Sizes and colors estimated from a screenshot are approximations; the skill tells Claude to say so. `check_contrast` is exact only for the colors you give it.
- **Curated, not complete.** The rules cover common review points, not the whole HIG. Use `get_guideline` to read the full page.
- **Rules can go stale.** Each citation is re-fetched and matched at call time. A rule whose sentence Apple has changed, or whose locator now matches more than one sentence, is returned as `verified: false` with no quote. If Apple can't be reached and only an expired cached copy exists, citations are marked `source: "stale-cache"` with the copy's date and are not reported as verified.
- **Platform scope follows Apple's pages.** A rule only claims the platforms its source page lists. For example, the Dark Mode rules don't apply to watchOS or visionOS.
- **Not affiliated with Apple.** HIG conformance is not App Store approval.

For general Apple developer documentation, a docs-lookup tool such as [sosumi.ai](https://sosumi.ai) pairs well with this one. Xcode's own documentation search is another option. hig-review focuses on design review.

## How it works

- **Data source:** each HIG page is backed by a JSON document (`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`), the same data the site renders. The server fetches it directly. No browser is needed.
- **Citations:** a page is flattened into sentences and table rows, each tagged with its section. A rule's short locator phrase finds the sentence to quote and the `#anchor` to link.
- **Polite fetching:** the server sends a descriptive `User-Agent` and makes one request at a time with a minimum gap. It retries with backoff and caches responses for 24 hours, in memory and on disk at `~/.cache/hig-review`, outside the repository. A full checklist touches at most 21 pages.
- **Offline:** if Apple is unreachable, a stale cached copy is served when one exists, and citations from it are marked unverified with their date. Otherwise citations come back unverified, and contrast and SwiftUI checks still work.

Environment variables (all optional):

| Variable | Default | Meaning |
| --- | --- | --- |
| `CACHE_ENABLED` | `true` | Set `false` to disable the disk cache |
| `CACHE_TTL` | `86400000` | Cache lifetime in milliseconds |
| `HIG_CACHE_DIR` | `~/.cache/hig-review` | Where cached responses are stored |
| `DEBUG` | `false` | Verbose logging to stderr |

## Development

```bash
npm install
npm run build            # tsc -> dist/
npm test                 # unit tests (vitest), offline
npm run bundle           # esbuild -> plugin/server.mjs (commit the result)
npm run smoke            # every tool over stdio against the live site, plus live re-verification of every rule phrase
npm run smoke:bundle     # the same, against an isolated copy of plugin/server.mjs
npm run validate:plugin  # offline check of the plugin and marketplace files
npm run docs:rules       # regenerate docs/RULES.md from the registry (a test checks it)
claude plugin validate --strict .
```

`plugin/server.mjs` is **committed build output on purpose**. The plugin must run from a plain git clone without `npm install`, so the server is bundled into one dependency-free file with its third-party licenses in `plugin/THIRD_PARTY_LICENSES.txt`. Don't edit it by hand: change `src/`, run `npm run bundle` and commit both. CI rebuilds the bundle and fails if the committed copy is stale.

## Project structure

```
.claude-plugin/     plugin.json and marketplace.json (the repo is a plugin and a one-plugin marketplace)
skills/hig-review/  the review procedure Claude follows
agents/             hig-reviewer subagent
plugin/server.mjs   bundled MCP server (committed build output)
src/
  server.ts         MCP tool definitions
  hig/              fetching, cache, catalog, search, Markdown rendering
  rules/            registry, live citations, checklist, contrast, phrase verification
  swift/            Swift lexer, shallow syntax helpers, heuristics, review_swiftui
tests/              unit tests with synthetic fixtures
scripts/            bundle, smoke test, plugin validation
docs/               ARCHITECTURE.md, RULES.md
```

## Content and copyright

All guideline text and imagery belong to Apple Inc. This repository bundles none of it. Rules are written in our own words, and each stores only a short locator fragment, a few words long, used to find its sentence. Pages are fetched from Apple when a tool runs and cached locally on your machine. Quotes are limited to one sentence or table row, with a link to the source. Please follow [Apple's terms of use](https://www.apple.com/legal/internet-services/terms/site.html). The tests use small synthetic fixtures. "Apple" and related marks are trademarks of Apple Inc.

## License

[MIT](LICENSE) © Noah Laratta
