#!/usr/bin/env node
/**
 * End-to-end smoke test. Starts the built server over stdio, connects with the MCP SDK
 * client and calls every tool against the live Apple site. Needs network access.
 * Run via `npm run smoke` (builds first). A handful of requests are made; responses are cached
 * in a throwaway directory unless HIG_CACHE_DIR is set.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = process.env.HIG_CACHE_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'hig-smoke-'));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist', 'index.js')],
  env: { ...process.env, HIG_CACHE_DIR: cacheDir },
  stderr: 'pipe',
});
const client = new Client({ name: 'hig-smoke', version: '1.0.0' });

async function call(name, args = {}) {
  const t0 = Date.now();
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.map((c) => c.text ?? '').join('\n') ?? '';
  const ms = Date.now() - t0;
  console.log(`\n--- ${name} ${JSON.stringify(args)} (${ms}ms, ${text.length} chars)`);
  console.log(text.split('\n').slice(0, 8).join('\n'));
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

try {
  await client.connect(transport);

  await check('listTools exposes all four tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['browseSection', 'getGuideline', 'getServerInfo', 'searchHIG']);
  });

  await check('searchHIG "buttons" finds the Buttons page first', async () => {
    const { res, text } = await call('searchHIG', { query: 'buttons' });
    assert.ok(!res.isError, text);
    assert.match(text, /^Found \d+ result/);
    assert.match(text, /\n1\. \*\*Buttons\*\*/);
    assert.match(text, /id: buttons \|/);
  });

  await check('searchHIG with category and platform filters', async () => {
    const { res, text } = await call('searchHIG', { query: 'menu', category: 'components', platform: 'macos', limit: 5 });
    assert.ok(!res.isError, text);
    assert.match(text, /Found \d+ result/);
  });

  await check('getGuideline "buttons" returns real page content', async () => {
    const { res, text } = await call('getGuideline', { guidelineId: 'buttons' });
    assert.ok(!res.isError, text);
    assert.match(text, /^# Buttons/);
    assert.ok(text.length > 3000, `expected substantial content, got ${text.length} chars`);
    assert.match(text, /button/i);
    assert.match(text, /Source: https:\/\/developer\.apple\.com\/design\/human-interface-guidelines\/buttons/);
  });

  await check('getGuideline accepts path and URL forms ("color")', async () => {
    const a = await call('getGuideline', { guidelineId: 'foundations/color', includeExamples: false });
    assert.ok(!a.res.isError, a.text);
    assert.match(a.text, /^# Color/);
    const b = await call('getGuideline', { guidelineId: 'https://developer.apple.com/design/human-interface-guidelines/color' });
    assert.match(b.text, /^# Color/);
  });

  await check('getGuideline on an unknown page is a clean tool error', async () => {
    const { res, text } = await call('getGuideline', { guidelineId: 'definitely-not-a-page' });
    assert.equal(res.isError, true);
    assert.match(text, /No Human Interface Guidelines page/);
  });

  await check('browseSection top level lists categories', async () => {
    const { res, text } = await call('browseSection', {});
    assert.ok(!res.isError, text);
    assert.match(text, /Foundations/);
    assert.match(text, /Components/);
  });

  await check('browseSection "components" lists sub-sections', async () => {
    const { res, text } = await call('browseSection', { section: 'components' });
    assert.ok(!res.isError, text);
    assert.match(text, /Menus and actions/i);
  });

  await check('browseSection "menus-and-actions" lists Buttons', async () => {
    const { res, text } = await call('browseSection', { section: 'components/menus-and-actions' });
    assert.ok(!res.isError, text);
    assert.match(text, /Buttons/);
  });

  await check('getServerInfo reports status', async () => {
    const { res, text } = await call('getServerInfo');
    assert.ok(!res.isError, text);
    assert.match(text, /Version:/);
    assert.match(text, /Catalog: \d+ pages/);
  });
} catch (err) {
  failures++;
  console.error('Smoke test crashed:', err);
} finally {
  await client.close().catch(() => {});
  if (!process.env.HIG_CACHE_DIR) fs.rmSync(cacheDir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
