/**
 * WCAG 2.x contrast ratio, deterministic and offline. Pure.
 *
 * Colors: #RGB, #RGBA, #RRGGBB, #RRGGBBAA, rgb()/rgba() (comma or space syntax, 0-255 or %).
 * A translucent foreground is composited over the background. A translucent background needs an
 * opaque `backdrop` to get a verdict; without one the result is 'unknown' (the backdrop could be
 * anything, and black or white are not the worst case).
 */

export interface RGBA {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
}

export class ColorParseError extends Error {}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/;

export function parseColor(input: string): RGBA {
  const s = input.trim().toLowerCase();
  const bad = () => new ColorParseError(`Cannot parse color "${input}". Use #RGB, #RRGGBB, #RRGGBBAA or rgb()/rgba().`);
  const hex = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(\s*(.+?)\s*\)$/.exec(s);
  if (!fn) throw bad();
  const slashParts = fn[1].split('/');
  if (slashParts.length > 2) throw bad();
  const parts = slashParts[0].trim().split(/\s*,\s*|\s+/).filter(Boolean);
  if (slashParts.length === 2) {
    if (parts.length !== 3) throw bad();
    parts.push(slashParts[1].trim());
  }
  if ((parts.length !== 3 && parts.length !== 4) || !parts.every((p) => NUMBER.test(p))) throw bad();
  const channel = (p: string) => clamp(p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p), 0, 255);
  const alpha = (p: string) => clamp(p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p), 0, 1);
  return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: parts[3] !== undefined ? alpha(parts[3]) : 1 };
}

/** Source-over compositing of `top` onto an opaque `bottom`. */
export function composite(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

/** WCAG 2.x relative luminance of an opaque sRGB color. */
export function relativeLuminance(c: RGBA): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

export function contrastRatio(a: RGBA, b: RGBA): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function toHex(c: RGBA): string {
  const h = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

export interface ContrastInput {
  foreground: string;
  background: string;
  /** Opaque color behind a translucent background. Without it, a translucent background has no verdict. */
  backdrop?: string;
  fontSizePt?: number;
  bold?: boolean;
}

export type HIGTextCategory = 'regular' | 'large' | 'bold';

export interface ContrastResult {
  foreground: string;
  background: string;
  backdrop?: string;
  /** 'unknown' when the background is translucent and no backdrop was given: no pass/fail is reported. */
  compliance: 'known' | 'unknown';
  effectiveForeground: string | null;
  effectiveBackground: string | null;
  /** Rounded down to two decimals for display; pass/fail uses ratioExact. Null when compliance is unknown. */
  ratio: number | null;
  ratioExact: number | null;
  /** Only when compliance is unknown: ratios over a white and a black backdrop, for illustration. */
  scenarios?: { backdrop: string; effectiveBackground: string; ratio: number }[];
  notes: string[];
  wcag: {
    aaNormalText: boolean | null; // >= 4.5
    aaLargeText: boolean | null; // >= 3
    aaaNormalText: boolean | null; // >= 7
    aaaLargeText: boolean | null; // >= 4.5
  };
  hig: {
    /** Accessibility page table (Accessibility Inspector): rules contrast.text / contrast.large-text / contrast.bold-text. */
    accessibilityTable: {
      /** null when neither fontSizePt nor bold was given; then both thresholds are reported. */
      category: HIGTextCategory | null;
      ruleId: string | null;
      requiredRatio: number | null;
      pass: boolean | null;
      regularTextPass: boolean | null; // >= 4.5: non-bold text up to 17 pt
      largeOrBoldTextPass: boolean | null; // >= 3: 18 pt and up, or bold at any size
    };
    /** Dark Mode page minimum (rule contrast.all-appearances): no lower than 4.5:1 in every appearance. */
    darkModeMinimum: { ruleId: 'contrast.all-appearances'; requiredRatio: 4.5; pass: boolean | null };
    /** Dark Mode page preferred target (rule contrast.preferred) for custom colors: strive for 7:1. Not a minimum. */
    darkModePreferred: { ruleId: 'contrast.preferred'; targetRatio: 7; meets: boolean | null };
  };
}

/** The HIG's Accessibility table: up to 17 pt needs 4.5:1; 18 pt and up, or bold text of any size, 3:1. */
export function higCategory(fontSizePt?: number, bold?: boolean): HIGTextCategory | null {
  if (bold) return 'bold';
  if (fontSizePt === undefined) return null;
  return fontSizePt >= 18 ? 'large' : 'regular';
}

const CATEGORY_RULE: Record<HIGTextCategory, string> = { regular: 'contrast.text', large: 'contrast.large-text', bold: 'contrast.bold-text' };

export function checkContrast(input: ContrastInput): ContrastResult {
  const fg = parseColor(input.foreground);
  let bg = parseColor(input.background);
  const notes: string[] = [];
  const category = higCategory(input.fontSizePt, input.bold);
  const required = category === null ? null : category === 'regular' ? 4.5 : 3;

  if (input.backdrop !== undefined) {
    const backdrop = parseColor(input.backdrop);
    if (backdrop.a < 1) throw new ColorParseError(`The backdrop must be opaque: "${input.backdrop}"`);
    if (bg.a < 1) notes.push('The translucent background was composited over the given backdrop.');
    bg = composite(bg, backdrop);
  }

  if (bg.a < 1) {
    const scenarios = [WHITE, BLACK].map((b) => {
      const effBg = composite(bg, b);
      const effFg = fg.a < 1 ? composite(fg, effBg) : fg;
      return { backdrop: toHex(b), effectiveBackground: toHex(effBg), ratio: Math.floor(contrastRatio(effFg, effBg) * 100) / 100 };
    });
    notes.push(
      'The background is translucent and the color behind it is unknown, so no pass/fail is given. The scenarios over white and black are illustrations, not bounds: the real ratio can be lower than both. Pass backdrop (an opaque color) to get a verdict.'
    );
    return {
      foreground: input.foreground,
      background: input.background,
      compliance: 'unknown',
      effectiveForeground: null,
      effectiveBackground: null,
      ratio: null,
      ratioExact: null,
      scenarios,
      notes,
      wcag: { aaNormalText: null, aaLargeText: null, aaaNormalText: null, aaaLargeText: null },
      hig: {
        accessibilityTable: {
          category,
          ruleId: category ? CATEGORY_RULE[category] : null,
          requiredRatio: required,
          pass: null,
          regularTextPass: null,
          largeOrBoldTextPass: null,
        },
        darkModeMinimum: { ruleId: 'contrast.all-appearances', requiredRatio: 4.5, pass: null },
        darkModePreferred: { ruleId: 'contrast.preferred', targetRatio: 7, meets: null },
      },
    };
  }

  const effFg = fg.a < 1 ? composite(fg, bg) : fg;
  if (fg.a < 1) notes.push(`The foreground alpha (${fg.a.toFixed(2)}) was composited over the background.`);
  const ratio = contrastRatio(effFg, bg);
  if (input.fontSizePt !== undefined && input.fontSizePt > 17 && input.fontSizePt < 18 && !input.bold) {
    notes.push('The HIG table lists "Up to 17 pts" and "18 pts"; sizes in between are treated as regular text (4.5:1).');
  }
  if (category === 'bold' && ratio < 4.5 && ratio >= 3) {
    notes.push('Passes the Accessibility table\'s bold-text row (3:1) but not the Dark Mode page\'s general 4.5:1 minimum; both are reported separately.');
  }

  return {
    foreground: input.foreground,
    background: input.background,
    ...(input.backdrop !== undefined ? { backdrop: input.backdrop } : {}),
    compliance: 'known',
    effectiveForeground: toHex(effFg),
    effectiveBackground: toHex(bg),
    ratio: Math.floor(ratio * 100) / 100,
    ratioExact: ratio,
    notes,
    wcag: {
      aaNormalText: ratio >= 4.5,
      aaLargeText: ratio >= 3,
      aaaNormalText: ratio >= 7,
      aaaLargeText: ratio >= 4.5,
    },
    hig: {
      accessibilityTable: {
        category,
        ruleId: category ? CATEGORY_RULE[category] : null,
        requiredRatio: required,
        pass: required === null ? null : ratio >= required,
        regularTextPass: ratio >= 4.5,
        largeOrBoldTextPass: ratio >= 3,
      },
      darkModeMinimum: { ruleId: 'contrast.all-appearances', requiredRatio: 4.5, pass: ratio >= 4.5 },
      darkModePreferred: { ruleId: 'contrast.preferred', targetRatio: 7, meets: ratio >= 7 },
    },
  };
}
