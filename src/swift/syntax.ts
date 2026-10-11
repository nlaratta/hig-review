/**
 * Shallow structure on masked Swift text: calls with trailing closures, modifier chains, the head
 * of the expression a modifier belongs to, and the call enclosing an offset. Heuristic by design.
 */

import { matchBackward, matchForward } from './lexer.js';

export type Range = [number, number]; // [start, end) offsets

export interface Closure {
  label: string | null;
  /** Inside the braces, exclusive of them. */
  body: Range;
}

export interface Call {
  name: string;
  start: number;
  /** Inside the parentheses, exclusive of them; null when there are none. */
  args: Range | null;
  closures: Closure[];
  end: number;
}

export interface Modifier {
  name: string;
  /** Offset of the leading dot. */
  start: number;
  args: Range | null;
  closures: Closure[];
  end: number;
}

const ID = /[A-Za-z0-9_]/;

export function skipSpace(m: string, i: number, newlines = true): number {
  while (i < m.length && (m[i] === ' ' || m[i] === '\t' || (newlines && (m[i] === '\n' || m[i] === '\r')))) i++;
  return i;
}

function skipSpaceBack(m: string, i: number, newlines = true): number {
  while (i >= 0 && (m[i] === ' ' || m[i] === '\t' || (newlines && (m[i] === '\n' || m[i] === '\r')))) i--;
  return i;
}

/** Parse `(args) { … } label: { … }` following a name that ends at `afterName`. */
export function parseCall(m: string, name: string, start: number, afterName: number): Call {
  let j = skipSpace(m, afterName, false);
  let args: Range | null = null;
  if (m[j] === '(') {
    const close = matchForward(m, j);
    if (close < 0) return { name, start, args: null, closures: [], end: afterName };
    args = [j + 1, close];
    j = close + 1;
  }
  const closures: Closure[] = [];
  let end = args ? j : afterName;
  // First trailing closure: unlabeled; Swift allows it on the next line too.
  let k = skipSpace(m, j);
  if (m[k] === '{') {
    const close = matchForward(m, k);
    if (close > 0) {
      closures.push({ label: null, body: [k + 1, close] });
      end = close + 1;
      // Further closures: `label: { … }`, possibly on following lines.
      for (;;) {
        const p = skipSpace(m, end);
        const lab = /^([A-Za-z_]\w*)\s*:\s*\{/.exec(m.slice(p, p + 80));
        if (!lab) break;
        const open = p + lab[0].length - 1;
        const c = matchForward(m, open);
        if (c < 0) break;
        closures.push({ label: lab[1], body: [open + 1, c] });
        end = c + 1;
      }
    }
  }
  return { name, start, args, closures, end };
}

/** Modifiers chained after offset `end`: `.name(args) { … }` repeated. */
export function modifierChain(m: string, end: number): Modifier[] {
  const mods: Modifier[] = [];
  let i = end;
  for (;;) {
    const dot = skipSpace(m, i);
    if (m[dot] !== '.') break;
    const id = /^[A-Za-z_]\w*/.exec(m.slice(dot + 1, dot + 80));
    if (!id) break;
    const call = parseCall(m, id[0], dot, dot + 1 + id[0].length);
    mods.push({ name: id[0], start: dot, args: call.args, closures: call.closures, end: call.end });
    i = call.end;
  }
  return mods;
}

export interface Head {
  name: string;
  start: number;
}

/**
 * Walk back from a modifier's dot to the head of its expression, e.g. `Color` for
 * `Color.red.opacity(0.5).ignoresSafeArea()` or `Button` for `Button { … } label: { … }.frame(…)`.
 */
export function headOf(m: string, dot: number): Head | null {
  let i = dot - 1;
  let lastId: Head | null = null;
  for (let guard = 0; guard < 200; guard++) {
    i = skipSpaceBack(m, i);
    if (i < 0) break;
    const c = m[i];
    if (c === ')' || c === ']' || c === '}') {
      const open = matchBackward(m, i);
      if (open < 0) return lastId;
      i = open - 1;
      if (c === '}') {
        // Closure: preceded by `label:`, `)` or an identifier (possibly on the previous line).
        const p = skipSpaceBack(m, i);
        if (m[p] === ':') {
          i = p - 1;
          const q = skipSpaceBack(m, i);
          let s = q;
          while (s >= 0 && ID.test(m[s])) s--;
          i = s; // skip the label identifier, continue at the closure before it
          continue;
        }
        if (p < 0 || (m[p] !== ')' && !ID.test(m[p]))) return lastId;
        i = p;
        continue;
      }
      // After (…) or […] expect an identifier immediately before.
      const p = skipSpaceBack(m, i, false);
      if (p < 0 || !ID.test(m[p])) return lastId;
      i = p;
      continue;
    }
    if (ID.test(c)) {
      let s = i;
      while (s - 1 >= 0 && ID.test(m[s - 1])) s--;
      lastId = { name: m.slice(s, i + 1), start: s };
      const p = skipSpaceBack(m, s - 1);
      if (p >= 0 && m[p] === '.') {
        i = p - 1;
        continue;
      }
      return lastId;
    }
    if (c === '.') {
      // implicit member at the start, e.g. `.red.opacity(…)`
      return lastId;
    }
    return lastId;
  }
  return lastId;
}

/** The call whose parentheses or trailing closure contain `offset`: its name and the bracket offset. */
export function enclosingCall(m: string, offset: number): { name: string | null; open: number } | null {
  let depth = 0;
  for (let i = offset - 1; i >= 0; i--) {
    const c = m[i];
    if (c === ')' || c === '}' || c === ']') depth++;
    else if (c === '(' || c === '{' || c === '[') {
      if (depth > 0) {
        depth--;
        continue;
      }
      let p = skipSpaceBack(m, i - 1);
      if (c === '{' && m[p] === ')') {
        const open = matchBackward(m, p);
        if (open < 0) return { name: null, open: i };
        p = skipSpaceBack(m, open - 1, false);
      }
      if (c === '{' && m[p] === ':') {
        // labeled trailing closure like `label: {` — report the label
        p = skipSpaceBack(m, p - 1, false);
      }
      let s = p;
      while (s >= 0 && ID.test(m[s])) s--;
      return { name: p >= 0 && s < p ? m.slice(s + 1, p + 1) : null, open: i };
    }
  }
  return null;
}

/** Name of the call whose parentheses or trailing closure contain `offset`, e.g. "background". */
export function enclosingCallName(m: string, offset: number): string | null {
  return enclosingCall(m, offset)?.name ?? null;
}

/** Names of up to `levels` enclosing calls, innermost first. */
export function enclosingCallNames(m: string, offset: number, levels = 4): string[] {
  const out: string[] = [];
  let at = offset;
  for (let k = 0; k < levels; k++) {
    const call = enclosingCall(m, at);
    if (!call) break;
    if (call.name) out.push(call.name);
    at = call.open;
  }
  return out;
}

/** One way a ViewBuilder body can render: how many matches show at once, and whether one is a Cancel button. */
export interface BranchConfig {
  count: number;
  cancel: boolean;
}

/** ViewBuilder containers whose closure content renders in place (descended into when counting). */
const CONTAINERS = /^(Group|Section|VStack|HStack|ZStack|LazyVStack|LazyHStack|ControlGroup)\b/;
const MAX_CONFIGS = 256;

function dedupe(cs: BranchConfig[]): BranchConfig[] {
  const seen = new Map<string, BranchConfig>();
  for (const c of cs) seen.set(`${c.count}:${c.cancel}`, c);
  return [...seen.values()];
}

function product(a: BranchConfig[], b: BranchConfig[]): BranchConfig[] {
  return dedupe(a.flatMap((x) => b.map((y) => ({ count: x.count + y.count, cancel: x.cancel || y.cancel }))));
}

/** Index of the `{` that opens a branch body after `from`, skipping (…) and […] in the condition. */
export function findBranchBrace(text: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    const c = text[j];
    if (c === '(' || c === '[') {
      const close = matchForward(text, j);
      if (close < 0) return -1;
      j = close;
      continue;
    }
    if (c === '{') return j;
    if (c === '}') return -1;
  }
  return -1;
}

/**
 * Every combination of `pattern` matches a ViewBuilder body can show at once. if/else branches are
 * alternatives, recognized containers (Group, Section, stacks) are descended into, and conditions
 * may contain closures. Returns null when the shapes can't be known statically (ForEach, switch,
 * an unparsable if, or too many combinations).
 */
export function branchConfigs(text: string, pattern: RegExp): BranchConfig[] | null {
  if (/\b(ForEach|switch)\b/.test(text)) return null;
  const re = new RegExp(pattern.source, 'g');
  const plain = (a: number, b: number): BranchConfig[] => {
    const piece = text.slice(a, b);
    return [{ count: (piece.match(re) ?? []).length, cancel: /role\s*:\s*\.cancel\b/.test(piece) }];
  };
  let configs: BranchConfig[] = [{ count: 0, cancel: false }];
  const seq = (cs: BranchConfig[]) => {
    configs = product(configs, cs);
    return configs.length <= MAX_CONFIGS;
  };
  let plainFrom = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const boundary = i === 0 || !/[\w#.]/.test(text[i - 1]);
    if (depth === 0 && boundary && /^if\b/.test(text.slice(i, i + 3))) {
      const alternatives: BranchConfig[] = [];
      let j = i + 2;
      let hasElse = false;
      for (;;) {
        const open = findBranchBrace(text, j);
        const close = open >= 0 ? matchForward(text, open) : -1;
        if (close < 0) return null;
        const inner = branchConfigs(text.slice(open + 1, close), pattern);
        if (!inner) return null;
        alternatives.push(...inner);
        j = close + 1;
        const k = skipSpace(text, j);
        if (!/^else\b/.test(text.slice(k, k + 5))) break;
        const k2 = skipSpace(text, k + 4);
        if (/^if\b/.test(text.slice(k2, k2 + 3))) {
          j = k2 + 2;
          continue;
        }
        if (text[k2] !== '{') return null;
        const c2 = matchForward(text, k2);
        if (c2 < 0) return null;
        const inner2 = branchConfigs(text.slice(k2 + 1, c2), pattern);
        if (!inner2) return null;
        alternatives.push(...inner2);
        hasElse = true;
        j = c2 + 1;
        break;
      }
      if (!hasElse) alternatives.push({ count: 0, cancel: false });
      if (!seq(plain(plainFrom, i)) || !seq(dedupe(alternatives))) return null;
      plainFrom = j;
      i = j - 1;
      continue;
    }
    const container = depth === 0 && boundary ? CONTAINERS.exec(text.slice(i, i + 20)) : null;
    if (container) {
      const open = findBranchBrace(text, i + container[0].length);
      const between = open >= 0 ? text.slice(i + container[0].length, open) : '';
      // Only `Name {` or `Name(args) {`: blank out (…) groups and require nothing else in between.
      const close = open >= 0 ? matchForward(text, open) : -1;
      if (close > 0 && /^\s*(\([\s\S]*\))?\s*$/.test(between)) {
        const inner = branchConfigs(text.slice(open + 1, close), pattern);
        if (!inner) return null;
        if (!seq(plain(plainFrom, i)) || !seq(inner)) return null;
        plainFrom = close + 1;
        i = close;
        continue;
      }
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
  }
  if (!seq(plain(plainFrom, text.length))) return null;
  return configs;
}

/** Largest number of `pattern` matches shown at once, or null when unknown. */
export function countBranchAware(text: string, pattern: RegExp): number | null {
  const configs = branchConfigs(text, pattern);
  return configs ? Math.max(...configs.map((c) => c.count)) : null;
}

export interface Bounds {
  width?: number;
  height?: number;
  /** False when a later modifier changes the size by an amount we can't read (e.g. `.padding()`). */
  resolved: boolean;
  note?: string;
}

/**
 * Bounds from a modifier chain: the last literal `.frame(width:height:)`, plus literal padding
 * applied after it. Null when the chain has no usable frame. `.contentShape` does not change size.
 */
export function boundsFromChain(m: string, mods: Modifier[]): Bounds | null {
  let idx = -1;
  for (let k = mods.length - 1; k >= 0; k--) {
    if (mods[k].name === 'frame') {
      idx = k;
      break;
    }
  }
  if (idx < 0) return null;
  const size = frameSize(slice(m, mods[idx].args));
  if (size.flexible || (size.width === undefined && size.height === undefined)) return null;
  let { width, height } = size;
  let resolved = true;
  let note: string | undefined;
  for (const mod of mods.slice(idx + 1)) {
    if (mod.name !== 'padding') continue;
    const args = slice(m, mod.args).trim();
    const amount = /(?:^|,)\s*(\d+(?:\.\d+)?)\s*$/.exec(args);
    const edges = /^\.(all|horizontal|vertical|leading|trailing|top|bottom)\b/.exec(args)?.[1] ?? (amount && /^\d/.test(args) ? 'all' : null);
    if (!amount || !edges) {
      resolved = false;
      note = `.padding(${args}) adds an amount that can't be read statically`;
      continue;
    }
    const n = parseFloat(amount[1]);
    const w = edges === 'all' || edges === 'horizontal' ? 2 * n : edges === 'leading' || edges === 'trailing' ? n : 0;
    const h = edges === 'all' || edges === 'vertical' ? 2 * n : edges === 'top' || edges === 'bottom' ? n : 0;
    if (width !== undefined) width += w;
    if (height !== undefined) height += h;
  }
  return { width, height, resolved, note };
}

/** The single root expression of a closure body (head call plus modifier chain), or null if there are several. */
export function rootExpression(m: string, body: Range): { head: string; mods: Modifier[] } | null {
  const start = skipSpace(m, body[0]);
  const id = /^[A-Za-z_]\w*/.exec(m.slice(start, start + 80));
  if (!id || start >= body[1]) return null;
  const call = parseCall(m, id[0], start, start + id[0].length);
  const mods = modifierChain(m, call.end);
  const end = mods.length ? mods[mods.length - 1].end : call.end;
  if (end > body[1] || m.slice(end, body[1]).trim() !== '') return null;
  return { head: id[0], mods };
}

/** Offsets of `pattern` matches in masked text. */
export function findAll(m: string, pattern: RegExp): RegExpExecArray[] {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  return [...m.matchAll(re)];
}

export function slice(m: string, r: Range | null): string {
  return r ? m.slice(r[0], r[1]) : '';
}

/** Parse numeric `width:`/`height:` literals from `.frame(…)` arguments. */
export function frameSize(args: string): { width?: number; height?: number; flexible: boolean } {
  const num = (k: string) => {
    const r = new RegExp(`(?:^|[,(\\s])${k}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*(?=[,)]|$)`).exec(args);
    return r ? parseFloat(r[1]) : undefined;
  };
  return {
    width: num('width'),
    height: num('height'),
    flexible: /\b(min|max|ideal)(Width|Height)\s*:/.test(args),
  };
}
