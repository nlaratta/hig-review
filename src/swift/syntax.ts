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
  // First trailing closure: unlabeled, on the same line.
  let k = skipSpace(m, j, false);
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
        // Closure: preceded by `label:`, `)` or an identifier on the same line.
        const p = skipSpaceBack(m, i, false);
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

/** Name of the call whose parentheses or trailing closure contain `offset`, e.g. "background". */
export function enclosingCallName(m: string, offset: number): string | null {
  let depth = 0;
  for (let i = offset - 1; i >= 0; i--) {
    const c = m[i];
    if (c === ')' || c === '}' || c === ']') depth++;
    else if (c === '(' || c === '{' || c === '[') {
      if (depth > 0) {
        depth--;
        continue;
      }
      let p = skipSpaceBack(m, i - 1, false);
      if (c === '{' && m[p] === ')') {
        const open = matchBackward(m, p);
        if (open < 0) return null;
        p = skipSpaceBack(m, open - 1, false);
      }
      if (c === '{' && m[p] === ':') {
        // labeled trailing closure like `label: {` — report the label
        p = skipSpaceBack(m, p - 1, false);
      }
      let s = p;
      while (s >= 0 && ID.test(m[s])) s--;
      return p >= 0 && s < p ? m.slice(s + 1, p + 1) : null;
    }
  }
  return null;
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
