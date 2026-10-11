import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evalOsCondition, maskSwift, toSource, lineAt } from '../src/swift/lexer.js';
import { HEURISTICS, labelRange, runHeuristics } from '../src/swift/heuristics.js';
import { branchConfigs, countBranchAware, findBranchBrace, headOf, parseCall } from '../src/swift/syntax.js';
import { loadSwift, reviewSwiftUI } from '../src/swift/review.js';
import { Citer } from '../src/rules/citation.js';
import { appliesTo, ruleById } from '../src/rules/registry.js';
import { PLATFORMS } from '../src/types/index.js';
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

  it('hit targets: unresolved padding is a low-severity advisory, literal padding counts (should-fix 6)', () => {
    const advisory = runHeuristics(
      toSource('Button { go() } label: {\n  Image(systemName: "plus")\n    .frame(width: 20, height: 20)\n    .padding()\n}'),
      'ios'
    ).find((f) => f.check === 'hit-target-size')!;
    expect(advisory).toMatchObject({ severity: 'low', confidence: 'low' });
    expect(advisory.message).toMatch(/^Advisory/);
    const padded = runHeuristics(toSource('Button { go() } label: {\n  Image(systemName: "plus")\n    .frame(width: 20, height: 20)\n    .padding(1)\n}'), 'ios').find((f) => f.check === 'hit-target-size')!;
    expect(padded.severity).toBe('high');
    expect(padded.message).toMatch(/22x22 pt/);
    // Padding outside the Button itself is not tappable and is not counted.
    const outside = runHeuristics(toSource('Button("Go") { go() }.frame(width: 24, height: 24).padding(20)'), 'ios')[0];
    expect(outside.severity).toBe('high');
  });

  it('reports icon-only buttons as a low-severity possible missing label (should-fix 7)', () => {
    const [f] = runHeuristics(toSource('Button { delete() } label: { Image(systemName: "trash") }'), 'ios');
    expect(f).toMatchObject({ check: 'icon-only-button-label', severity: 'low', confidence: 'low' });
    expect(f.message).toMatch(/^Possible missing descriptive label/);
  });

  it('skips code in #if os(...) branches that do not apply (should-fix 8)', () => {
    const code = '#if os(iOS)\nText("a").font(.system(size: 9))\n#elseif os(macOS)\nText("b").font(.system(size: 8))\n#else\nText("c").font(.system(size: 7))\n#endif';
    const sizes = (p: Parameters<typeof runHeuristics>[1]) =>
      runHeuristics(toSource(code), p)
        .filter((f) => f.check === 'font-below-minimum')
        .map((f) => f.lines[0]);
    expect(sizes('ios')).toEqual([2]);
    expect(sizes('macos')).toEqual([4]);
    expect(sizes('watchos')).toEqual([6]);
    // Non-platform conditions keep every branch.
    expect(checks('#if DEBUG\nText("a").font(.system(size: 9))\n#endif')).toContain('font-below-minimum');
    expect(evalOsCondition('os(iOS) || os(visionOS)', 'visionos')).toBe(true);
    expect(evalOsCondition('!os(macOS)', 'macos')).toBe(false);
    expect(evalOsCondition('canImport(UIKit)', 'ios')).toBeNull();
  });

  it('counts if/else branches as alternatives (should-fix 8)', () => {
    expect(countBranchAware('Button("a"){} if x { Button("b"){} Button("c"){} } else { Button("d"){} }', /Button\s*[({]/)).toBe(3);
    expect(countBranchAware('if a { Button("x"){} } else if b { Button("y"){}; Button("z"){} } else { }', /Button\s*[({]/)).toBe(2);
    expect(countBranchAware('switch s { case .a: Button("x"){} default: EmptyView() }', /Button\s*[({]/)).toBeNull();
  });

  it('keeps code after an interpolation containing a comment visible (should-fix 10)', () => {
    const code = 'let s = "\\(foo /* " ) */ + bar)"\nText("a").font(.system(size: 9))';
    const m = maskSwift(code);
    expect(m).toContain('.font(.system(size: 9))');
    expect(checks(code)).toContain('font-below-minimum');
    expect(maskSwift('let t = "\\(a // ) "\n)" ; Text("x")')).toContain('Text("x")');
  });

  it('only returns findings whose rule applies to the requested platform (verify item 1)', () => {
    const all = Object.values(FIXTURES).flatMap((f) => [...f.flag, ...f.clean]);
    for (const platform of PLATFORMS) {
      for (const code of all) {
        for (const f of runHeuristics(toSource(code), platform)) {
          expect(appliesTo(ruleById(f.ruleId)!, platform), `${f.ruleId} on ${platform}`).toBe(true);
        }
      }
    }
    const black = 'Text("T").foregroundColor(.black)';
    expect(checks(black, 'ios')).toContain('hard-coded-color');
    expect(checks(black, 'visionos')).toEqual([]); // Dark Mode rules don't cover visionOS
    expect(checks(black, 'watchos')).toEqual([]);
  });

  it('counts the implicit watchOS Cancel per branch (verify item 4)', () => {
    const dialog = (other: string) => `.confirmationDialog("Pick", isPresented: $p) {
  if simple {
    Button("A") {}; Button("B") {}; Button("C") {}; Button("Cancel", role: .cancel) {}
  } else {
    ${other}
  }
}`;
    // The else branch has 4 ordinary buttons, so the system adds a fifth (Cancel).
    expect(checks(dialog('Button("W") {}; Button("X") {}; Button("Y") {}; Button("Z") {}'), 'watchos')).toContain('alert-button-count');
    expect(checks(dialog('Button("W") {}; Button("X") {}; Button("Cancel", role: .cancel) {}'), 'watchos')).not.toContain('alert-button-count');
    expect(branchConfigs('if a { Button("x"){} Button("c", role: .cancel){} } else { Button("y"){} }', /Button\s*[({]/)).toEqual([
      { count: 2, cancel: true },
      { count: 1, cancel: false },
    ]);
  });

  it('descends into containers and skips closures in if conditions when counting (verify item 3)', () => {
    const re = /Button\s*[({]/;
    expect(countBranchAware('Group { if a { Button("1"){}; Button("2"){} } else { Button("3"){}; Button("4"){} } }', re)).toBe(2);
    expect(countBranchAware('if xs.contains(where: { $0 > 1 }) { Button("1"){}; Button("2"){} } else { Button("3"){}; Button("4"){} }', re)).toBe(2);
    expect(countBranchAware('VStack(spacing: 4) { Button("1"){}; if a { Button("2"){} } }', re)).toBe(2);
    const cond = 'if xs.contains(where: { $0 > 1 }) { body }';
    expect(findBranchBrace(cond, 2)).toBe(cond.indexOf('{ body'));
  });

  it('finds label closures for every initializer form (verify item 2)', () => {
    const label = (code: string) => {
      const m = maskSwift(code);
      const name = /^\w+/.exec(code)![0];
      const call = parseCall(m, name, 0, name.length);
      const r = labelRange(m, call);
      return r ? m.slice(r[0], r[1]).trim() : null;
    };
    expect(label('Button(action: go, label: { Image(systemName: "x") })')).toBe('Image(systemName: "x")');
    expect(label('Button(action: go) { Image("i") }')).toBe('Image("x")');
    expect(label('Button { go() } label: { Image("i") }')).toBe('Image("x")');
    expect(label('Link(destination: url) { Image("i") }')).toBe('Image("x")');
    expect(label('Toggle(isOn: $on) { Image("i") }')).toBe('Image("x")');
    expect(label('Button("Go") { go() }')).toBeNull();
    expect(label('Link("Docs", destination: url)')).toBeNull();
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
  const citer = () => new Citer(async () => ({ doc: page, fetchedAt: 0, stale: false }));

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
    await expect(loadSwift({ path: 'missing.swift' }, dir)).rejects.toThrow(/pass an absolute path/);
    fs.writeFileSync(path.join(dir, 'Big.swift'), 'x'.repeat(201 * 1024));
    await expect(loadSwift({ path: path.join(dir, 'Big.swift') })).rejects.toThrow(/limit/);
    await expect(loadSwift({ code: 'x'.repeat(201 * 1024) })).rejects.toThrow(/larger/);
    await expect(loadSwift({ code: 'a', path: file })).rejects.toThrow(/not both/);
    await expect(loadSwift({})).rejects.toThrow(/Pass code/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
