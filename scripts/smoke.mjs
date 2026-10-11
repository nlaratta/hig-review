#!/usr/bin/env node
/**
 * End-to-end smoke test against the live Apple site (needs network).
 *
 * 1. Starts the server over stdio and calls every tool through the MCP SDK client.
 *    By default it runs dist/index.js; with --bundle it copies plugin/server.mjs into an empty
 *    temporary directory (no node_modules anywhere above it) and runs that, proving the plugin
 *    works from a plain clone.
 * 2. Re-verifies every registry phrase on its live page and fails loudly on stale ones.
 *
 * `npm run smoke` builds first. Responses are cached in a throwaway directory unless
 * HIG_CACHE_DIR is set. About 45 requests to Apple on a cold cache.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const useBundle = process.argv.includes('--bundle');
const cacheDir = process.env.HIG_CACHE_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'hig-smoke-cache-'));

const { HIGClient } = await import(path.join(root, 'dist/hig/client.js'));
const { RULES, COMPONENTS } = await import(path.join(root, 'dist/rules/registry.js'));
const { checkRule } = await import(path.join(root, 'dist/rules/verify.js'));
const { USER_AGENT } = await import(path.join(root, 'dist/utils/config.js'));

let serverPath = path.join(root, 'dist', 'index.js');
let serverCwd = root;
let isolated;
if (useBundle) {
  isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'hig-review-bundle-'));
  serverPath = path.join(isolated, 'server.mjs');
  fs.copyFileSync(path.join(root, 'plugin', 'server.mjs'), serverPath);
  serverCwd = isolated;
}
console.log(`Server: ${serverPath}${useBundle ? ' (bundle, isolated copy)' : ''}`);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: serverCwd,
  env: { ...process.env, HIG_CACHE_DIR: cacheDir },
  stderr: 'pipe',
});
const client = new Client({ name: 'hig-review-smoke', version: '1.0.0' });

async function call(name, args = {}, lines = 8) {
  const t0 = Date.now();
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.map((c) => c.text ?? '').join('\n') ?? '';
  console.log(`\n--- ${name} ${JSON.stringify(args).slice(0, 120)} (${Date.now() - t0}ms, ${text.length} chars)`);
  console.log(text.split('\n').slice(0, lines).join('\n'));
  return { res, text };
}

let failures = 0;
async function check(label, fn) {
  try {
    await fn();
    console.log(`PASS ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${label}: ${err.message}`);
  }
}

const SAMPLE = `struct Toolbar: View {
  var body: some View {
    HStack {
      Button { close() } label: { Image(systemName: "xmark") }
        .frame(width: 24, height: 24)
      Text("Title").font(.system(size: 22))
    }
    .ignoresSafeArea()
  }
}`;

try {
  await client.connect(transport);

  await check('listTools exposes exactly the seven snake_case tools', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ['browse_hig', 'check_contrast', 'get_guideline', 'hig_checklist', 'review_swiftui', 'search_hig', 'server_info']
    );
  });

  await check('hig_checklist resolves components, cites live pages, suggests for unknowns', async () => {
    const { res, text } = await call('hig_checklist', { components: ['tab bar', 'button', 'wibblewidget'], platform: 'ios' }, 30);
    assert.ok(!res.isError, text);
    const out = JSON.parse(text);
    assert.equal(out.platform, 'ios');
    assert.deepEqual(out.components.map((c) => c.component), ['tab-bar', 'button']);
    assert.equal(out.unknown[0].requested, 'wibblewidget');
    assert.ok(out.rules.length >= 10, `only ${out.rules.length} rules`);
    assert.ok(out.rules.some((r) => r.id === 'controls.size.ios'));
    assert.ok(!out.rules.some((r) => r.id === 'controls.size.macos'));
    for (const r of out.rules) {
      assert.equal(r.citation.verified, true, `${r.id} unverified`);
      assert.match(r.citation.url, /^https:\/\/developer\.apple\.com\/design\/human-interface-guidelines\//);
      assert.ok(r.citation.quote.length > 5);
    }
  });

  await check('hig_checklist over every component and platform verifies every rule through the server', async () => {
    const { res, text } = await call('hig_checklist', { components: Object.keys(COMPONENTS) }, 3);
    assert.ok(!res.isError, text);
    const out = JSON.parse(text);
    assert.equal(out.rules.length, RULES.length);
    const bad = out.rules.filter((r) => !r.citation.verified).map((r) => r.id);
    assert.deepEqual(bad, [], `unverified: ${bad.join(', ')}`);
  });

  await check('review_swiftui (inline code) finds the planted issues with citations', async () => {
    const { res, text } = await call('review_swiftui', { code: SAMPLE, platform: 'ios' }, 20);
    assert.ok(!res.isError, text);
    const out = JSON.parse(text);
    const checks = out.findings.map((f) => f.check);
    for (const c of ['hit-target-size', 'icon-only-button-label', 'fixed-font-size', 'ignores-safe-area-content']) {
      assert.ok(checks.includes(c), `missing ${c}: ${checks.join(', ')}`);
    }
    for (const f of out.findings) {
      assert.equal(f.kind, 'heuristic');
      assert.equal(f.citation.verified, true, `${f.ruleId} unverified`);
    }
    assert.match(out.note, /misfire/);
  });

  await check('review_swiftui (path) reads a .swift file and rejects other files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hig-smoke-swift-'));
    const file = path.join(dir, 'Sample.swift');
    fs.writeFileSync(file, SAMPLE);
    const ok = await call('review_swiftui', { path: file }, 4);
    assert.ok(!ok.res.isError, ok.text);
    assert.equal(JSON.parse(ok.text).file, file);
    fs.writeFileSync(path.join(dir, 'x.txt'), 'x');
    const bad = await call('review_swiftui', { path: path.join(dir, 'x.txt') }, 2);
    assert.equal(bad.res.isError, true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await check('check_contrast computes WCAG ratios and cites the HIG', async () => {
    const { res, text } = await call('check_contrast', { foreground: '#777777', background: '#FFFFFF', fontSizePt: 17 }, 40);
    assert.ok(!res.isError, text);
    const out = JSON.parse(text);
    assert.equal(out.ratio, 4.47);
    assert.equal(out.compliance, 'known');
    assert.equal(out.hig.accessibilityTable.pass, false);
    assert.equal(out.hig.darkModeMinimum.pass, false);
    assert.equal(out.wcag.aaLargeText, true);
    assert.ok(out.citations.every((c) => c.citation.verified && c.citation.source === 'live'), 'contrast citations unverified');
    const translucent = await call('check_contrast', { foreground: '#767676', background: '#00000000', fontSizePt: 17 }, 3);
    const t = JSON.parse(translucent.text);
    assert.equal(t.compliance, 'unknown');
    assert.equal(t.hig.accessibilityTable.pass, null);
    const bad = await call('check_contrast', { foreground: 'blueish', background: '#fff' }, 2);
    assert.equal(bad.res.isError, true);
  });

  await check('search_hig "buttons" finds the Buttons page first', async () => {
    const { res, text } = await call('search_hig', { query: 'buttons' });
    assert.ok(!res.isError, text);
    assert.match(text, /\n1\. \*\*Buttons\*\*/);
  });

  await check('get_guideline "buttons" returns real page content', async () => {
    const { res, text } = await call('get_guideline', { guidelineId: 'components/buttons', includeExamples: false }, 4);
    assert.ok(!res.isError, text);
    assert.match(text, /^# Buttons/);
    assert.ok(text.length > 3000);
  });

  await check('get_guideline on an unknown page is a clean tool error', async () => {
    const { res, text } = await call('get_guideline', { guidelineId: 'definitely-not-a-page' }, 2);
    assert.equal(res.isError, true);
    assert.match(text, /No Human Interface Guidelines page/);
  });

  await check('browse_hig lists the top level and a section', async () => {
    const top = await call('browse_hig', {}, 4);
    assert.match(top.text, /Foundations/);
    const sec = await call('browse_hig', { section: 'components/menus-and-actions' }, 4);
    assert.match(sec.text, /Buttons/);
  });

  await check('server_info reports status', async () => {
    const { res, text } = await call('server_info', {}, 12);
    assert.ok(!res.isError, text);
    assert.match(text, new RegExp(`Review rules: ${RULES.length}`));
  });
} catch (err) {
  failures++;
  console.error('Smoke test crashed:', err);
} finally {
  await client.close().catch(() => {});
}

// Phrase re-verification: every registry phrase must match exactly one sentence on its live page;
// the rule's platforms must be covered by the page's supported-platforms and any platform heading;
// and the rule's numbers must appear in the cited text (right column for tables).
console.log('\n=== Registry phrase re-verification (live) ===');
const hig = new HIGClient({ userAgent: USER_AGENT, ttlMs: 60 * 60 * 1000, cacheDir });
const stale = [];
for (const rule of RULES) {
  let result;
  try {
    result = checkRule(rule, await hig.getDoc(rule.source.slug));
  } catch (err) {
    result = { id: rule.id, ok: false, problem: `fetch failed: ${err.message}` };
  }
  if (!result.ok) stale.push(`${rule.id} (${rule.source.slug}: "${rule.source.phrase}"): ${result.problem}`);
}
const slugs = new Set(RULES.map((r) => r.source.slug));
if (stale.length) {
  failures++;
  console.log(`FAIL ${stale.length} stale or mis-scoped rule(s):\n  ${stale.join('\n  ')}`);
} else {
  console.log(`PASS all ${RULES.length} rule phrases matched exactly once on ${slugs.size} live pages; page and heading platform scopes and numeric data consistent`);
}

if (!process.env.HIG_CACHE_DIR) fs.rmSync(cacheDir, { recursive: true, force: true });
if (isolated) fs.rmSync(isolated, { recursive: true, force: true });
console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
