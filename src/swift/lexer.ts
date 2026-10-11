/**
 * A small lexical layer for Swift source. Not a parser: it masks comments and string contents so
 * pattern checks never match inside them, while keeping every character offset and line number
 * identical to the original. String delimiters stay in place (`"xxxx"`), so "this call has a
 * text label" is still visible after masking.
 *
 * Handles //, nested block comments, "…", """…""", raw strings (#"…"#, ##"…"##) and string
 * interpolation (including strings nested inside an interpolation).
 */

const MASK = 'x';

export interface SwiftSource {
  original: string;
  masked: string;
  /** Offset of the first character of each line. */
  lineStarts: number[];
}

export function maskSwift(src: string): string {
  const out = src.split('');
  const n = src.length;
  const blank = (from: number, to: number, ch: string) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ch;
  };

  /** Scan a string literal starting at `i` (at its first `#` or `"`); mask contents; return the index after it. */
  const scanString = (i: number): number => {
    let hashes = 0;
    while (src[i + hashes] === '#') hashes++;
    let j = i + hashes;
    const multi = src.startsWith('"""', j);
    const quoteLen = multi ? 3 : 1;
    j += quoteLen;
    const closer = (multi ? '"""' : '"') + '#'.repeat(hashes);
    const escape = '\\' + '#'.repeat(hashes);
    while (j < n) {
      if (src.startsWith(closer, j)) return j + closer.length;
      if (!multi && src[j] === '\n') return j; // unterminated single-line string: stop at end of line
      if (src.startsWith(escape, j)) {
        const after = j + escape.length;
        if (src[after] === '(') {
          // Interpolation: mask through the matching paren, skipping nested strings.
          let depth = 1;
          let k = after + 1;
          while (k < n && depth > 0) {
            if (src[k] === '"' || (src[k] === '#' && /^#+"/.test(src.slice(k, k + 8)))) {
              k = scanString(k);
              continue;
            }
            if (src[k] === '(') depth++;
            else if (src[k] === ')') depth--;
            k++;
          }
          blank(j, k, MASK);
          j = k;
          continue;
        }
        blank(j, after + 1, MASK);
        j = after + 1;
        continue;
      }
      if (src[j] !== '\n' && src[j] !== '\r') out[j] = MASK;
      j++;
    }
    return j;
  };

  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      blank(i, j, ' ');
      i = j;
    } else if (c === '/' && src[i + 1] === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (src[j] === '/' && src[j + 1] === '*') {
          depth++;
          j += 2;
        } else if (src[j] === '*' && src[j + 1] === '/') {
          depth--;
          j += 2;
        } else j++;
      }
      blank(i, j, ' ');
      i = j;
    } else if (c === '"' || (c === '#' && /^#+"/.test(src.slice(i, i + 8)))) {
      i = scanString(i);
    } else {
      i++;
    }
  }
  return out.join('');
}

export function lineStartsOf(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return starts;
}

export function toSource(code: string): SwiftSource {
  const original = code.replace(/\r\n?/g, '\n');
  return { original, masked: maskSwift(original), lineStarts: lineStartsOf(original) };
}

/** 1-based line number of an offset. */
export function lineAt(src: SwiftSource, offset: number): number {
  let lo = 0;
  let hi = src.lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (src.lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** The original text of lines [from, to] (1-based, inclusive), trimmed of common indentation. */
export function linesText(src: SwiftSource, from: number, to: number): string {
  const lines = src.original.split('\n').slice(from - 1, to);
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length));
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n').trimEnd();
}

const OPEN: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
const CLOSE: Record<string, string> = { ')': '(', '}': '{', ']': '[' };

/** Index of the bracket matching the one at `open` (masked text), or -1. */
export function matchForward(m: string, open: number): number {
  if (!OPEN[m[open]]) return -1;
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    if (OPEN[m[i]]) depth++;
    else if (CLOSE[m[i]]) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the bracket matching the closing one at `close` (masked text), or -1. */
export function matchBackward(m: string, close: number): number {
  if (!CLOSE[m[close]]) return -1;
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (CLOSE[m[i]]) depth++;
    else if (OPEN[m[i]]) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
