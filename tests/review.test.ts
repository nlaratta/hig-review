import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { maskSwift, toSource, lineAt } from '../src/swift/lexer.js';
import { HEURISTICS, runHeuristics } from '../src/swift/heuristics.js';
import { headOf } from '../src/swift/syntax.js';
import { loadSwift, reviewSwiftUI } from '../src/swift/review.js';
import { Citer } from '../src/rules/citation.js';
import { ruleById } from '../src/rules/registry.js';
import { FIXTURES } from './fixtures/swiftui.js';
import { syntheticPage } from './fixtures/pages.js';

const checks = (code: string, platform: Parameters<typeof runHeuristics>[1] = 'ios') =>
  runHeuristics(toSource(code), platform).map((f) => f.check);

describe('Swift lexer', () => {
  it('masks comments and string contents but keeps offsets and delimiters', () => {
    const src = 'let a = "Button()" // Button()\n/* outer /* inner */ Button() */ Text("x")';
    const m = maskSwift(src);
    expect(m.length).toBe(src.length);
    expect(m).not.toMatch(/Button/);
    expect(m).toContain('Text("x")');
    expect(m.split('\n').length).toBe(2);
  });

  it('handles raw, multi-line and interpolated strings', () => {
    const src = 'let a = #"He said "Button()""#\nlet b = """\nButton()\n"""\nlet c = "\\(x ? "Button()" : "y") done"\nButton("ok")';
    const m = maskSwift(src);
    expect(m.match(/Button/g)).toEqual(['Button']);
    expect(m.split('\n').length).toBe(src.split('\n').length);
    expect(m.endsWith('Button("xx")')).toBe(true);
  });

  it('does not treat #colorLiteral or #Preview as raw strings', () => {
    expect(maskSwift('#colorLiteral(red: 1)')).toBe('#colorLiteral(red: 1)');
    expect(maskSwift('#Preview { V() }')).toBe('#Preview { V() }');
  });

  it('maps offsets to 1-based lines', () => {
    const src = toSource('a\nbb\nccc');
    expect(lineAt(src, 0)).toBe(1);
    expect(lineAt(src, 3)).toBe(2);
    expect(lineAt(src, 7)).toBe(3);
  });

  it('finds the head of a modifier chain', () => {
    const m = maskSwift('Button { a() } label: { Image(systemName: "x") }\n  .frame(width: 1)');
    expect(headOf(m, m.indexOf('.frame'))?.name).toBe('Button');
    const m2 = maskSwift('Color.red.opacity(0.5).ignoresSafeArea()');
    expect(headOf(m2, m2.indexOf('.ignoresSafeArea'))?.name).toBe('Color');
  });
});

describe('SwiftUI heuristics: positive and negative fixtures', () => {
  it('has fixtures for every documented heuristic', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(HEURISTICS.map((h) => h.id).sort());
  });

  for (const [check, fx] of Object.entries(FIXTURES)) {
    describe(check, () => {
      fx.flag.forEach((code, i) => {
        it(`flags positive fixture #${i + 1}`, () => {
          expect(checks(code)).toContain(check);
        });
      });
      fx.clean.forEach((code, i) => {
        it(`does not flag negative fixture #${i + 1}`, () => {
          expect(checks(code)).not.toContain(check);
        });
      });
    });
  }

  it('every heuristic cites a registry rule', () => {
    const code = Object.values(FIXTURES).flatMap((f) => f.flag).join('\n');
    const found = runHeuristics(toSource(code), 'ios');
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) expect(ruleById(f.ruleId), f.ruleId).toBeDefined();
  });

  it('uses per-platform thresholds', () => {
    const code = 'Button("Go") { go() }.frame(width: 24, height: 24)';
    const ios = runHeuristics(toSource(code), 'ios').find((f) => f.check === 'hit-target-size')!;
    const mac = runHeuristics(toSource(code), 'macos').find((f) => f.check === 'hit-target-size')!;
    expect(ios.severity).toBe('high'); // below 28 pt minimum
    expect(ios.ruleId).toBe('controls.size.ios');
    expect(mac.severity).toBe('medium'); // between 20 pt minimum and 28 pt default
    expect(mac.ruleId).toBe('controls.size.macos');
    expect(checks('Button("Go") { go() }.frame(width: 30, height: 30)', 'macos')).not.toContain('hit-target-size');
    expect(runHeuristics(toSource(code), 'ipados')[0].ruleId).toBe('controls.size.ios');
  });

  it('applies the segmented limit of 7 on wide platforms', () => {
    const six = FIXTURES['segmented-count'].flag[0];
    expect(checks(six, 'ipados')).not.toContain('segmented-count');
  });

  it('does not flag fixed font sizes on macOS (no Dynamic Type) but still checks minimum size', () => {
    expect(checks('Text("a").font(.system(size: 12))', 'macos')).toEqual([]);
    expect(checks('Text("a").font(.system(size: 9))', 'macos')).toEqual(['font-below-minimum']);
  });

  it('checks watchOS confirmation dialogs only on watchOS', () => {
    const code = `.confirmationDialog("Pick", isPresented: $p) {
  Button("A") {}; Button("B") {}; Button("C") {}; Button("D") {}
}`;
    expect(checks(code, 'watchos')).toContain('alert-button-count');
    expect(checks(code, 'ios')).toEqual([]);
  });

  it('reports correct line numbers and snippets', () => {
    const code = 'struct V: View {\n  var body: some View {\n    Text("a")\n      .font(.system(size: 30))\n  }\n}';
    const [f] = runHeuristics(toSource(code), 'ios');
    expect(f.lines).toEqual([4, 4]);
    expect(f.snippet).toBe('.font(.system(size: 30))');
  });
});

describe('review_swiftui', () => {
  const page = syntheticPage();
  const citer = () => new Citer(async () => page);

  it('attaches citations, kind and a misfire note', async () => {
    const review = await reviewSwiftUI({ code: 'Text("a").font(.system(size: 30))' }, 'ios', citer());
    expect(review.summary.findings).toBe(1);
    const [f] = review.findings;
    expect(f.kind).toBe('heuristic');
    expect(f.ruleId).toBe('type.dynamic-type');
    expect(f.citation.verified).toBe(false); // the synthetic page does not contain the phrase
    expect(review.note).toMatch(/can misfire/);
  });

  it('loads .swift files, refuses other extensions, oversized input and both inputs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hig-review-test-'));
    const file = path.join(dir, 'V.swift');
    fs.writeFileSync(file, 'Text("a")');
    expect((await loadSwift({ path: file })).code).toBe('Text("a")');
    expect((await loadSwift({ path: 'V.swift' }, dir)).file).toBe(file);
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    await expect(loadSwift({ path: path.join(dir, 'notes.txt') })).rejects.toThrow(/Only .swift/);
    await expect(loadSwift({ path: path.join(dir, 'missing.swift') })).rejects.toThrow(/Cannot read/);
    fs.writeFileSync(path.join(dir, 'Big.swift'), 'x'.repeat(201 * 1024));
    await expect(loadSwift({ path: path.join(dir, 'Big.swift') })).rejects.toThrow(/limit/);
    await expect(loadSwift({ code: 'x'.repeat(201 * 1024) })).rejects.toThrow(/larger/);
    await expect(loadSwift({ code: 'a', path: file })).rejects.toThrow(/not both/);
    await expect(loadSwift({})).rejects.toThrow(/Pass code/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
