/**
 * WCAG 2.x contrast ratio, deterministic and offline. Pure.
 *
 * Colors: #RGB, #RGBA, #RRGGBB, #RRGGBBAA, rgb()/rgba() (comma or space syntax, 0-255 or %).
 * A translucent foreground is composited over the background. A translucent background has an
 * unknown backdrop, so it is composited over both white and black and the worse ratio is reported.
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

export function parseColor(input: string): RGBA {
  const s = input.trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(\s*(.+?)\s*\)$/.exec(s);
  if (fn) {
    const [rgbPart, slashAlpha] = fn[1].split('/').map((p) => p.trim());
    const parts = rgbPart.split(/[\s,]+/).filter(Boolean);
    if (slashAlpha !== undefined) parts.push(slashAlpha);
    if (parts.length !== 3 && parts.length !== 4) throw new ColorParseError(`Cannot parse color "${input}"`);
    const channel = (p: string) => {
      const v = p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p);
      if (!Number.isFinite(v)) throw new ColorParseError(`Cannot parse color "${input}"`);
      return clamp(v, 0, 255);
    };
    const alpha = (p: string) => {
      const v = p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p);
      if (!Number.isFinite(v)) throw new ColorParseError(`Cannot parse color "${input}"`);
      return clamp(v, 0, 1);
    };
    return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: parts[3] !== undefined ? alpha(parts[3]) : 1 };
  }
  throw new ColorParseError(`Cannot parse color "${input}". Use #RGB, #RRGGBB, #RRGGBBAA or rgb()/rgba().`);
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
  fontSizePt?: number;
  bold?: boolean;
}

export type HIGTextCategory = 'regular' | 'large' | 'bold';

export interface ContrastResult {
  foreground: string;
  background: string;
  /** Opaque colors the ratio was computed from (after compositing). */
  effectiveForeground: string;
  effectiveBackground: string;
  /** Rounded down to two decimals for display; pass/fail uses the exact value. */
  ratio: number;
  ratioExact: number;
  notes: string[];
  wcag: {
    aaNormalText: boolean; // >= 4.5
    aaLargeText: boolean; // >= 3
    aaaNormalText: boolean; // >= 7
    aaaLargeText: boolean; // >= 4.5
  };
  hig: {
    /** null when no fontSizePt/bold was given; then both thresholds are reported. */
    category: HIGTextCategory | null;
    requiredRatio: number | null;
    pass: boolean | null;
    regularTextPass: boolean; // >= 4.5 (text up to 17 pt)
    largeOrBoldTextPass: boolean; // >= 3 (18 pt and up, or bold)
    preferred7to1: boolean; // Dark Mode page: strive for 7:1 with custom colors, especially small text
  };
}

/** The HIG's Accessibility table: up to 17 pt needs 4.5:1; 18 pt and up, or any bold text, 3:1. */
export function higCategory(fontSizePt?: number, bold?: boolean): HIGTextCategory | null {
  if (bold) return 'bold';
  if (fontSizePt === undefined) return null;
  return fontSizePt >= 18 ? 'large' : 'regular';
}

export function checkContrast(input: ContrastInput): ContrastResult {
  const fg = parseColor(input.foreground);
  const bg = parseColor(input.background);
  const notes: string[] = [];

  const scenarios: { bg: RGBA; label: string }[] =
    bg.a < 1
      ? [
          { bg: composite(bg, WHITE), label: 'over white' },
          { bg: composite(bg, BLACK), label: 'over black' },
        ]
      : [{ bg, label: '' }];
  if (bg.a < 1) {
    notes.push('The background is translucent and its backdrop is unknown; it was composited over white and over black and the worse ratio is reported.');
  }
  if (fg.a < 1) notes.push(`The foreground alpha (${fg.a.toFixed(2)}) was composited over the background.`);

  let worst: { ratio: number; fg: RGBA; bg: RGBA } | null = null;
  for (const s of scenarios) {
    const effFg = fg.a < 1 ? composite(fg, s.bg) : fg;
    const ratio = contrastRatio(effFg, s.bg);
    if (!worst || ratio < worst.ratio) worst = { ratio, fg: effFg, bg: s.bg };
  }
  const { ratio, fg: effFg, bg: effBg } = worst!;
  const category = higCategory(input.fontSizePt, input.bold);
  const required = category === null ? null : category === 'regular' ? 4.5 : 3;
  if (input.fontSizePt !== undefined && input.fontSizePt > 17 && input.fontSizePt < 18 && !input.bold) {
    notes.push('The HIG table lists "Up to 17 pts" and "18 pts"; sizes in between are treated as regular text (4.5:1).');
  }

  return {
    foreground: input.foreground,
    background: input.background,
    effectiveForeground: toHex(effFg),
    effectiveBackground: toHex(effBg),
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
      category,
      requiredRatio: required,
      pass: required === null ? null : ratio >= required,
      regularTextPass: ratio >= 4.5,
      largeOrBoldTextPass: ratio >= 3,
      preferred7to1: ratio >= 7,
    },
  };
}
