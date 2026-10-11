/**
 * SwiftUI heuristics: lexical checks over masked source. Each check maps to a registry rule whose
 * source sentence was verified on the live HIG. These are hints for a reviewer, not proofs: they
 * do not type-check, resolve custom views or see runtime values.
 */

import type { ApplePlatform } from '../types/index.js';
import { ruleFor, type Severity } from '../rules/registry.js';
import { SwiftSource, lineAt, linesText, matchForward } from './lexer.js';
import { Call, Modifier, enclosingCallName, findAll, frameSize, headOf, modifierChain, parseCall, slice } from './syntax.js';

export type Confidence = 'high' | 'medium' | 'low';

export interface RawFinding {
  check: string;
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  lines: [number, number];
  snippet: string;
  message: string;
}

export interface HeuristicInfo {
  id: string;
  ruleIds: string[];
  description: string;
  falsePositives: string;
}

/** Documentation of every heuristic, used by the README table and server_info. */
export const HEURISTICS: HeuristicInfo[] = [
  {
    id: 'hit-target-size',
    ruleIds: ['controls.size.<platform>'],
    description: 'Button, Link, Toggle, Menu or onTapGesture view with a literal .frame smaller than the platform\'s default (medium) or minimum (high) control size.',
    falsePositives: 'Hit area enlarged elsewhere (contentShape on a padded parent, a custom ButtonStyle); frames on decorative images are ignored.',
  },
  {
    id: 'fixed-font-size',
    ruleIds: ['type.dynamic-type'],
    description: '.system(size:), .custom(_, fixedSize:) or UIFont.systemFont(ofSize:) — sizes that do not follow Dynamic Type. .custom(_, size:) scales with body and is not flagged; @ScaledMetric sizes are skipped.',
    falsePositives: 'Deliberately fixed text (e.g. a large clock face) or sizes scaled manually elsewhere.',
  },
  {
    id: 'font-below-minimum',
    ruleIds: ['type.size.<platform>'],
    description: 'Literal font size below the platform minimum text size.',
    falsePositives: 'Tiny decorative glyphs that are not text.',
  },
  {
    id: 'hard-coded-color',
    ruleIds: ['dark.adaptive-colors'],
    description: 'Color(red:green:blue:), Color(hex:), Color(.sRGB, …), Color(white:), UIColor(red:…), #colorLiteral, and fixed .black/.white foregrounds/backgrounds.',
    falsePositives: 'Brand colors intentionally fixed and checked in both appearances; colors only used in previews.',
  },
  {
    id: 'icon-only-button-label',
    ruleIds: ['a11y.labels'],
    description: 'Button whose label is only an Image, with no Text/Label and no .accessibilityLabel.',
    falsePositives: 'Some SF Symbols provide a default VoiceOver description; labels set by a custom ButtonStyle or a wrapper view.',
  },
  {
    id: 'tap-gesture-as-button',
    ruleIds: ['buttons.press-state'],
    description: 'onTapGesture on a non-shape view without .accessibilityAddTraits(.isButton): acts as a button with no press state and no button trait.',
    falsePositives: 'Supplementary taps that duplicate a real control; views that implement their own pressed appearance.',
  },
  {
    id: 'ignores-safe-area-content',
    ruleIds: ['layout.safe-area'],
    description: '.ignoresSafeArea()/.edgesIgnoringSafeArea on a container or custom view rather than on a background (Color, gradient, Image, shape, Map, or inside .background).',
    falsePositives: 'Custom views that are themselves backgrounds; containers whose content handles insets itself.',
  },
  {
    id: 'screen-bounds-layout',
    ruleIds: ['layout.size-classes'],
    description: 'UIScreen.main.bounds, UIDevice.current.orientation or userInterfaceIdiom used in view code.',
    falsePositives: 'Non-layout uses (analytics, one-off sizing of offscreen rendering); idiom checks for behavior rather than layout.',
  },
  {
    id: 'alert-button-count',
    ruleIds: ['alert.max-buttons', 'actionsheet.max-buttons.watchos'],
    description: '.alert actions with more than three Buttons; on watchOS, .confirmationDialog with more than four including Cancel.',
    falsePositives: 'Buttons inside conditionals that never all show at once.',
  },
  {
    id: 'segmented-count',
    ruleIds: ['segmented.count'],
    description: 'Picker with .segmented style and more literal .tag() options than the HIG suggests (5 on iPhone, 7 in wide layouts).',
    falsePositives: 'iPad-only or Mac layouts reviewed with platform "ios"; pass the right platform.',
  },
  {
    id: 'light-font-weight',
    ruleIds: ['type.light-weights'],
    description: '.ultraLight, .thin or .light font weights.',
    falsePositives: 'Large display text where light weights stay legible.',
  },
];

interface Ctx {
  src: SwiftSource;
  m: string;
  platform: ApplePlatform;
  out: RawFinding[];
}

function add(ctx: Ctx, f: Omit<RawFinding, 'lines' | 'snippet'> & { from: number; to?: number }) {
  const a = lineAt(ctx.src, f.from);
  const b = lineAt(ctx.src, Math.max(f.from, (f.to ?? f.from + 1) - 1));
  const snippetEnd = Math.min(b, a + 2);
  const { from, to, ...rest } = f;
  void from;
  void to;
  ctx.out.push({ ...rest, lines: [a, b], snippet: linesText(ctx.src, a, snippetEnd) });
}

/** All top-level calls of the given names, with their modifier chains. */
function callsNamed(m: string, names: string[]): { call: Call; chain: Modifier[] }[] {
  const re = new RegExp(`(?<![.\\w])(${names.join('|')})(?=\\s*[({])`, 'g');
  return [...m.matchAll(re)].map((x) => {
    const call = parseCall(m, x[1], x.index!, x.index! + x[1].length);
    return { call, chain: modifierChain(m, call.end) };
  });
}

// ------------------------------------------------------------------ hit-target-size

const TAPPABLE = ['Button', 'Link', 'Toggle', 'Menu'];

function checkHitTargets(ctx: Ctx) {
  const rule = ruleFor('controls.size', ctx.platform);
  if (!rule?.data) return;
  const { defaultPt, minimumPt } = rule.data;

  const judge = (w: number | undefined, h: number | undefined, from: number, to: number, what: string, confidence: Confidence) => {
    const dims = [w, h].filter((v): v is number => v !== undefined);
    if (!dims.length) return;
    const smallest = Math.min(...dims);
    if (smallest >= defaultPt) return;
    const size = `${w ?? '?'}x${h ?? '?'} pt`;
    const below = smallest < minimumPt;
    add(ctx, {
      check: 'hit-target-size',
      ruleId: rule.id,
      severity: below ? 'high' : 'medium',
      confidence,
      from,
      to,
      message: `${what} has a ${size} frame, ${below ? `below the ${minimumPt}x${minimumPt} pt minimum` : `under the ${defaultPt}x${defaultPt} pt default`} control size for ${ctx.platform}. Enlarge the frame or the tappable area (padding plus .contentShape).`,
    });
  };

  for (const { call, chain } of callsNamed(ctx.m, TAPPABLE)) {
    const frames = chain.filter((x) => x.name === 'frame');
    const lastFrame = frames[frames.length - 1];
    if (lastFrame) {
      const size = frameSize(slice(ctx.m, lastFrame.args));
      if (size.flexible) continue;
      const after = chain.slice(chain.indexOf(lastFrame) + 1);
      const padded = after.some((x) => x.name === 'padding');
      judge(size.width, size.height, call.start, lastFrame.end, `${call.name}`, padded ? 'low' : 'medium');
      continue;
    }
    // No frame on the control itself: look at frames inside the label.
    const labelText = [slice(ctx.m, call.args), ...call.closures.map((c) => slice(ctx.m, c.body))].join('\n');
    if (/\.padding\b|\.contentShape\b|\b(min|max)(Width|Height)\s*:/.test(labelText)) continue;
    const sizes = findAll(labelText, /\.frame\s*\(([^()]*)\)/).map((x) => frameSize(x[1]));
    if (!sizes.length) continue;
    const w = Math.max(...sizes.map((s) => s.width ?? 0));
    const h = Math.max(...sizes.map((s) => s.height ?? 0));
    judge(w || undefined, h || undefined, call.start, call.end, `${call.name} label`, 'low');
  }

  for (const x of findAll(ctx.m, /\.onTapGesture\b/)) {
    const head = headOf(ctx.m, x.index!);
    if (!head) continue;
    const before = modifierChain(ctx.m, chainHeadEnd(ctx.m, head)).filter((mod) => mod.start < x.index!);
    const frames = before.filter((mod) => mod.name === 'frame');
    const lastFrame = frames[frames.length - 1];
    if (!lastFrame) continue;
    const size = frameSize(slice(ctx.m, lastFrame.args));
    if (size.flexible) continue;
    const padded = before.slice(before.indexOf(lastFrame) + 1).some((mod) => mod.name === 'padding');
    if (padded) continue;
    judge(size.width, size.height, head.start, x.index! + 13, `Tappable ${head.name}`, 'medium');
  }
}

/** Offset just after the head call (name + args + closures), where its modifier chain starts. */
function chainHeadEnd(m: string, head: { name: string; start: number }): number {
  let end = parseCall(m, head.name, head.start, head.start + head.name.length).end;
  // Member access like `Color.red` or `Image(systemName:).resizable` is part of the chain anyway.
  return end;
}

// ------------------------------------------------------------------ fonts

function scaledMetricNames(m: string): Set<string> {
  return new Set(findAll(m, /@ScaledMetric\b(?:\s*\([^)]*\))?\s*(?:private\s+|fileprivate\s+)?var\s+([A-Za-z_]\w*)/).map((x) => x[1]));
}

function checkFonts(ctx: Ctx) {
  const scaled = scaledMetricNames(ctx.m);
  const minRule = ruleFor('type.size', ctx.platform);
  const dynamicTypeApplies = ctx.platform !== 'macos';

  const tooSmall = (value: string, from: number, to: number) => {
    const n = Number(value);
    if (!minRule?.data || !Number.isFinite(n)) return;
    if (n < minRule.data.minimumPt) {
      add(ctx, {
        check: 'font-below-minimum',
        ruleId: minRule.id,
        severity: 'medium',
        confidence: 'high',
        from,
        to,
        message: `Font size ${n} pt is below the ${minRule.data.minimumPt} pt minimum text size for ${ctx.platform}.`,
      });
    }
  };

  for (const x of findAll(ctx.m, /\.system\s*\(\s*size\s*:\s*([^,)]+)/)) {
    const value = x[1].trim();
    const to = x.index! + x[0].length;
    tooSmall(value, x.index!, to);
    if (!dynamicTypeApplies || scaled.has(value)) continue;
    add(ctx, {
      check: 'fixed-font-size',
      ruleId: 'type.dynamic-type',
      severity: 'medium',
      confidence: 'medium',
      from: x.index!,
      to,
      message: '.system(size:) is a fixed size and does not follow Dynamic Type. Prefer a text style (.body, .headline …), or derive the size from @ScaledMetric.',
    });
  }
  for (const x of findAll(ctx.m, /\.custom\s*\(\s*[^,()]+,\s*(fixedSize|size)\s*:\s*([^,)]+)/)) {
    const value = x[2].trim();
    const to = x.index! + x[0].length;
    tooSmall(value, x.index!, to);
    if (x[1] !== 'fixedSize' || !dynamicTypeApplies) continue;
    add(ctx, {
      check: 'fixed-font-size',
      ruleId: 'type.dynamic-type',
      severity: 'medium',
      confidence: 'high',
      from: x.index!,
      to,
      message: '.custom(_:fixedSize:) does not scale with Dynamic Type. Use .custom(_:size:) (scales with body) or .custom(_:size:relativeTo:).',
    });
  }
  for (const x of findAll(ctx.m, /UIFont\s*\.\s*systemFont\s*\(\s*ofSize\s*:\s*([^,)]+)/)) {
    const lineStart = ctx.m.lastIndexOf('\n', x.index!) + 1;
    const lineEnd = ctx.m.indexOf('\n', x.index!);
    const line = ctx.m.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    tooSmall(x[1].trim(), x.index!, x.index! + x[0].length);
    if (!dynamicTypeApplies || /UIFontMetrics|adjustsFontForContentSizeCategory/.test(line)) continue;
    add(ctx, {
      check: 'fixed-font-size',
      ruleId: 'type.dynamic-type',
      severity: 'medium',
      confidence: 'medium',
      from: x.index!,
      to: x.index! + x[0].length,
      message: 'UIFont.systemFont(ofSize:) is fixed unless scaled with UIFontMetrics. Prefer UIFont.preferredFont(forTextStyle:).',
    });
  }
  for (const x of findAll(ctx.m, /(?:fontWeight\s*\(\s*|weight\s*:\s*)(?:Font\s*\.\s*Weight\s*)?\.(ultraLight|thin|light)\b/)) {
    add(ctx, {
      check: 'light-font-weight',
      ruleId: 'type.light-weights',
      severity: 'low',
      confidence: 'medium',
      from: x.index!,
      to: x.index! + x[0].length,
      message: `.${x[1]} weight is hard to read at text sizes; reserve it for large display text.`,
    });
  }
}

// ------------------------------------------------------------------ colors

const COLOR_PATTERNS: [RegExp, string][] = [
  [/(?<![.\w])Color\s*\(\s*(?:red|hue|white)\s*:/, 'a fixed RGB/HSB/white color'],
  [/(?<![.\w])Color\s*\(\s*\.(?:sRGB|sRGBLinear|displayP3)\b/, 'a fixed color-space color'],
  [/(?<![.\w])Color\s*\(\s*hex\s*:/, 'a hex color'],
  [/(?<![.\w])UIColor\s*\(\s*(?:red|white|hue|displayP3Red)\s*:/, 'a fixed UIColor'],
  [/(?<![.\w])NSColor\s*\(\s*(?:red|calibratedRed|srgbRed|white|calibratedWhite)\s*:/, 'a fixed NSColor'],
  [/#colorLiteral\s*\(/, 'a color literal'],
];

function checkColors(ctx: Ctx) {
  for (const [re, what] of COLOR_PATTERNS) {
    for (const x of findAll(ctx.m, re)) {
      const open = ctx.m.indexOf('(', x.index!);
      const close = matchForward(ctx.m, open);
      add(ctx, {
        check: 'hard-coded-color',
        ruleId: 'dark.adaptive-colors',
        severity: 'low',
        confidence: 'medium',
        from: x.index!,
        to: close > 0 ? close + 1 : x.index! + x[0].length,
        message: `Uses ${what}, which does not adapt to Dark Mode or Increase Contrast. Prefer a semantic color or an asset-catalog color set with light and dark variants.`,
      });
    }
  }
  const fixed = /\.(foregroundColor|foregroundStyle|background)\s*\(\s*(?:Color\s*)?\.(black|white)\s*\)/;
  for (const x of findAll(ctx.m, fixed)) {
    add(ctx, {
      check: 'hard-coded-color',
      ruleId: 'dark.adaptive-colors',
      severity: 'low',
      confidence: 'low',
      from: x.index!,
      to: x.index! + x[0].length,
      message: `.${x[1]}(.${x[2]}) is the same in light and dark appearance. If it sits on a system background it will lose contrast in one of them; prefer .primary or a semantic color.`,
    });
  }
}

// ------------------------------------------------------------------ icon-only buttons

const A11Y_LABEL = /\.accessibilityLabel\s*\(|\.accessibility\s*\(\s*label\s*:|\.accessibilityRepresentation\b/;

function checkIconButtons(ctx: Ctx) {
  for (const { call, chain } of callsNamed(ctx.m, ['Button'])) {
    const args = slice(ctx.m, call.args);
    // Button("Title") / Button(LocalizedStringKey) / Button("Title", systemImage:) have a text label.
    if (/^\s*"/.test(args) || /^\s*(LocalizedStringKey|String|verbatim\s*:)/.test(args)) continue;
    let label = '';
    const labelArg = /\blabel\s*:\s*\{/.exec(args);
    if (labelArg) {
      const open = call.args![0] + labelArg.index + labelArg[0].length - 1;
      label = ctx.m.slice(open, matchForward(ctx.m, open) + 1);
    } else if (call.closures.length >= 2) {
      label = slice(ctx.m, (call.closures.find((c) => c.label === 'label') ?? call.closures[1]).body);
    } else if (call.closures.length === 1 && /\baction\s*:/.test(args)) {
      label = slice(ctx.m, call.closures[0].body);
    } else {
      continue; // no recognizable label
    }
    if (!/(?<![.\w])Image\s*\(/.test(label)) continue;
    if (/(?<![.\w])(Text|Label)\s*\(/.test(label)) continue;
    const chainText = chain.map((x) => ctx.m.slice(x.start, x.end)).join('');
    if (A11Y_LABEL.test(label) || A11Y_LABEL.test(chainText)) continue;
    add(ctx, {
      check: 'icon-only-button-label',
      ruleId: 'a11y.labels',
      severity: 'high',
      confidence: 'medium',
      from: call.start,
      to: call.end,
      message: 'Icon-only Button without an accessibility label. Add .accessibilityLabel("…"), or use Label("…", systemImage:) with .labelStyle(.iconOnly) so VoiceOver reads a meaningful name.',
    });
  }
}

// ------------------------------------------------------------------ onTapGesture

const SHAPES_AND_FILLS = new Set([
  'Color', 'Rectangle', 'RoundedRectangle', 'Circle', 'Capsule', 'Ellipse', 'UnevenRoundedRectangle',
  'LinearGradient', 'RadialGradient', 'AngularGradient', 'EllipticalGradient', 'MeshGradient',
]);

function checkTapGestures(ctx: Ctx) {
  for (const x of findAll(ctx.m, /\.onTapGesture\b/)) {
    const open = ctx.m.indexOf('(', x.index!);
    const argText = open >= 0 && open - x.index! <= 15 ? slice(ctx.m, [open + 1, Math.max(open + 1, matchForward(ctx.m, open))]) : '';
    const count = /count\s*:\s*(\d+)/.exec(argText);
    if (count && Number(count[1]) >= 2) continue;
    const head = headOf(ctx.m, x.index!);
    if (!head || SHAPES_AND_FILLS.has(head.name) || head.name === 'Button') continue;
    const chainAll = modifierChain(ctx.m, chainHeadEnd(ctx.m, head));
    const text = chainAll.map((mod) => ctx.m.slice(mod.start, mod.end)).join('');
    if (/accessibilityAddTraits\s*\(\s*[^)]*isButton/.test(text)) continue;
    add(ctx, {
      check: 'tap-gesture-as-button',
      ruleId: 'buttons.press-state',
      severity: 'low',
      confidence: 'low',
      from: x.index!,
      to: x.index! + 13,
      message: `${head.name} acts as a button through onTapGesture: it gets no press state and is not exposed as a button to VoiceOver or keyboard navigation. Prefer Button with a custom ButtonStyle (or add .accessibilityAddTraits(.isButton) and a pressed appearance).`,
    });
  }
}

// ------------------------------------------------------------------ ignoresSafeArea

const BACKGROUND_HEADS = new Set([...SHAPES_AND_FILLS, 'Image', 'AsyncImage', 'Map', 'VideoPlayer', 'SpriteView', 'SceneView', 'RealityView']);

function checkSafeArea(ctx: Ctx) {
  for (const x of findAll(ctx.m, /\.(ignoresSafeArea|edgesIgnoringSafeArea)\b/)) {
    const open = ctx.m.indexOf('(', x.index!);
    const args = open > 0 && open - x.index! <= 25 ? slice(ctx.m, [open + 1, Math.max(open + 1, matchForward(ctx.m, open))]) : '';
    if (/\.keyboard\b/.test(args) && !/\.(all|container)\b/.test(args)) continue;
    const head = headOf(ctx.m, x.index!);
    if (!head) continue;
    if (BACKGROUND_HEADS.has(head.name) || /Background|Backdrop|Gradient|Wallpaper/.test(head.name)) continue;
    const container = enclosingCallName(ctx.m, head.start);
    if (container && /^(background|backgroundStyle|containerBackground)$/.test(container)) continue;
    const known = /^(VStack|HStack|ZStack|LazyVStack|LazyHStack|ScrollView|List|Form|NavigationStack|NavigationView|NavigationSplitView|TabView|GeometryReader|Group|Text|Button)$/.test(head.name);
    add(ctx, {
      check: 'ignores-safe-area-content',
      ruleId: 'layout.safe-area',
      severity: 'medium',
      confidence: known ? 'medium' : 'low',
      from: x.index!,
      to: x.index! + x[0].length,
      message: `.${x[1]} is applied to ${head.name}, which looks like content rather than a background. Content and controls can end up under the Dynamic Island, status bar or home indicator. Apply it to the background only (e.g. .background(Color.x.ignoresSafeArea())).`,
    });
  }
}

// ------------------------------------------------------------------ screen bounds / idiom

function checkScreenBounds(ctx: Ctx) {
  const patterns: [RegExp, string, Confidence][] = [
    [/UIScreen\s*\.\s*main\s*\.\s*(bounds|nativeBounds)\b/, 'UIScreen.main.bounds', 'medium'],
    [/UIDevice\s*\.\s*current\s*\.\s*orientation\b/, 'UIDevice.current.orientation', 'medium'],
    [/UIDevice\s*\.\s*current\s*\.\s*userInterfaceIdiom\b/, 'userInterfaceIdiom', 'low'],
  ];
  for (const [re, what, confidence] of patterns) {
    for (const x of findAll(ctx.m, re)) {
      add(ctx, {
        check: 'screen-bounds-layout',
        ruleId: 'layout.size-classes',
        severity: 'medium',
        confidence,
        from: x.index!,
        to: x.index! + x[0].length,
        message: `${what} describes the device, not the space your view has (split view, Stage Manager, resizable windows). Use size classes, GeometryReader or containerRelativeFrame for layout.`,
      });
    }
  }
}

// ------------------------------------------------------------------ alerts and dialogs

function countButtons(text: string): number | null {
  if (/\bForEach\b/.test(text)) return null;
  return findAll(text, /(?<![.\w])Button\s*[({]/).length;
}

function checkAlerts(ctx: Ctx) {
  for (const x of findAll(ctx.m, /\.alert\s*\(/)) {
    const call = parseCall(ctx.m, 'alert', x.index!, x.index! + 6);
    const actions = call.closures.find((c) => c.label === null || c.label === 'actions');
    let text = actions ? slice(ctx.m, actions.body) : '';
    if (!actions) {
      const inArgs = /\bactions\s*:\s*\{/.exec(slice(ctx.m, call.args));
      if (!inArgs) continue;
      const open = call.args![0] + inArgs.index + inArgs[0].length - 1;
      text = ctx.m.slice(open, matchForward(ctx.m, open) + 1);
    }
    if (/(?<![.\w])Alert\s*\(/.test(text)) continue; // legacy Alert(...) API
    const n = countButtons(text);
    if (n === null || n <= 3) continue;
    add(ctx, {
      check: 'alert-button-count',
      ruleId: 'alert.max-buttons',
      severity: 'medium',
      confidence: 'high',
      from: x.index!,
      to: call.end,
      message: `This alert has ${n} buttons; alerts hold up to three. Offer more choices in an action sheet (.confirmationDialog) or a dedicated view.`,
    });
  }
  if (ctx.platform !== 'watchos') return;
  for (const x of findAll(ctx.m, /\.confirmationDialog\s*\(/)) {
    const call = parseCall(ctx.m, 'confirmationDialog', x.index!, x.index! + 19);
    const actions = call.closures.find((c) => c.label === null || c.label === 'actions');
    if (!actions) continue;
    const text = slice(ctx.m, actions.body);
    const n = countButtons(text);
    if (n === null) continue;
    const total = n + (/role\s*:\s*\.cancel\b/.test(text) ? 0 : 1);
    if (total <= 4) continue;
    add(ctx, {
      check: 'alert-button-count',
      ruleId: 'actionsheet.max-buttons.watchos',
      severity: 'medium',
      confidence: 'medium',
      from: x.index!,
      to: call.end,
      message: `This confirmation dialog shows about ${total} buttons including Cancel; on watchOS keep it to four.`,
    });
  }
}

// ------------------------------------------------------------------ segmented pickers

function checkSegmented(ctx: Ctx) {
  if (ctx.platform === 'watchos') return;
  const limit = ctx.platform === 'ios' ? 5 : 7;
  for (const { call, chain } of callsNamed(ctx.m, ['Picker'])) {
    const style = chain.find((x) => x.name === 'pickerStyle');
    if (!style || !/segmented|SegmentedPickerStyle/.test(slice(ctx.m, style.args))) continue;
    const content = call.closures.find((c) => c.label === null || c.label === 'content');
    if (!content) continue;
    const body = slice(ctx.m, content.body);
    if (/\bForEach\b/.test(body)) continue;
    const n = findAll(body, /\.tag\s*\(/).length;
    if (n <= limit) continue;
    add(ctx, {
      check: 'segmented-count',
      ruleId: 'segmented.count',
      severity: 'medium',
      confidence: 'high',
      from: call.start,
      to: style.end,
      message: `Segmented picker with ${n} segments; aim for at most ${limit} ${ctx.platform === 'ios' ? 'on iPhone' : 'in a wide layout'}. Consider a menu-style Picker or a list.`,
    });
  }
}

export function runHeuristics(src: SwiftSource, platform: ApplePlatform): RawFinding[] {
  const ctx: Ctx = { src, m: src.masked, platform, out: [] };
  checkHitTargets(ctx);
  checkFonts(ctx);
  checkColors(ctx);
  checkIconButtons(ctx);
  checkTapGestures(ctx);
  checkSafeArea(ctx);
  checkScreenBounds(ctx);
  checkAlerts(ctx);
  checkSegmented(ctx);
  return ctx.out.sort((a, b) => a.lines[0] - b.lines[0] || a.check.localeCompare(b.check));
}
