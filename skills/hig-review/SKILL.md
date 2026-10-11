---
name: hig-review
description: Review Apple-platform UI (iOS, iPadOS, macOS, watchOS, tvOS, visionOS) against Apple's Human Interface Guidelines, citing the exact HIG rule. Use for a screenshot, simulator capture, Xcode preview, design mock or SwiftUI code when someone asks whether it follows the HIG, wants a design or accessibility review, or asks "what's wrong with this screen".
when_to_use: Triggers include "review this screen against the HIG", "is this HIG compliant", "check my SwiftUI view", "does this pass accessibility contrast", or a pasted iPhone/iPad/Mac screenshot with a request for design feedback.
---

# HIG review

You do the looking and judging. The `hig-review` MCP tools give you curated rules with live citations from Apple's HIG, plus deterministic checks for code and colors. The tools never see images.

## Procedure

1. **Establish the platform.** Use what the person says, or infer it from the screenshot (status bar, window chrome, Digital Crown UI) and say what you inferred. If you can't tell, pass no platform and say so.
2. **Look at the screenshot yourself.** List the components and topics that are actually visible, such as "tab bar", "navigation bar", "list", "button", "sheet", "alert", "text field", "toggle", "segmented control" and "app icon". Always add "typography", "color", "accessibility" and "layout" for a full screen. Add "dark mode" if the capture is dark or the person asks about it.
3. **Call `hig_checklist`** with those components and the platform. If a component comes back under `unknown`, retry with one of its suggestions or use `search_hig`.
4. **Judge each rule against what is visible.** For each rule, decide whether it passes, fails or can't be judged from this image. Can't be judged includes VoiceOver labels, Dynamic Type behavior and hit areas larger than the drawn glyph. Estimate sizes only when you have a reference. On a 3x iPhone screenshot, 1 pt is 3 px; say which scale you assumed.
5. **Code.** If SwiftUI source is available (pasted, or a file path), call `review_swiftui` with `code`, or with `path` as an **absolute** path, and the platform. Read each finding's snippet before you repeat it. Its findings are heuristics with a confidence level, so confirm them in the code and drop the ones that are wrong.
6. **Colors.** For text or icons whose contrast looks doubtful, sample or estimate the two colors and call `check_contrast` with the text size and weight. Say whether you sampled the colors from code or estimated them from pixels, because JPEG and scaling shift colors. Check both appearances when you have both.
7. **Report.** Use the format below.

## Report format

Group findings by severity (high, then medium, then low). For each finding give:

- **What and where**: the element, its location on screen, or the file and line.
- **Rule**: the rule id and the citation link (`citation.url`). Quote at most the one sentence from `citation.quote`.
- **Basis**: label each finding with exactly one of:
  - **Verified rule**: the cited HIG sentence directly supports the finding, and you can see the violation.
  - **Heuristic**: it came from `review_swiftui`. Include its confidence and say whether you confirmed it.
  - **Judgment call**: the finding is your design opinion or an inference beyond the cited text. Still link the closest rule, or say there is none.
- **Fix**: one concrete change.

End with what you could not check from the given material, for example "VoiceOver labels can't be verified from a screenshot" or "dark appearance not provided".

## What not to claim

- Don't present this review as Apple's or as official approval. HIG conformance isn't App Store review.
- Don't quote HIG text that didn't come from a tool result. Don't invent rule numbers, pixel sizes or contrast ratios. If you estimated a value, say so.
- If a rule's citation has `verified: false`, say the rule could not be verified against the current HIG. Don't treat it as authoritative; read the page with `get_guideline` if it matters.
- An empty `review_swiftui` result does not mean the code follows the HIG.
- Measure contrast with `check_contrast`, not by eye, before calling it a failure.
