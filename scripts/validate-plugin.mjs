#!/usr/bin/env node
/**
 * Offline structural check of the Claude Code plugin and marketplace files, for CI where the
 * Claude CLI isn't installed. Locally, `claude plugin validate --strict .` is the authoritative
 * check; this script covers the fields and paths that one relies on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (msg) => errors.push(msg);
const readJson = (rel) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch (err) {
    fail(`${rel}: ${err.message}`);
    return {};
  }
};
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const pkg = readJson('package.json');
const plugin = readJson('.claude-plugin/plugin.json');
const market = readJson('.claude-plugin/marketplace.json');

// plugin.json
if (!plugin.name || !NAME.test(plugin.name)) fail('plugin.json: name missing or not kebab-case');
for (const key of ['version', 'description', 'displayName', 'license', 'homepage', 'repository']) {
  if (typeof plugin[key] !== 'string' || !plugin[key]) fail(`plugin.json: ${key} missing`);
}
if (!plugin.author?.name) fail('plugin.json: author.name missing');
if (plugin.version !== pkg.version) fail(`plugin.json version ${plugin.version} != package.json ${pkg.version}`);
try {
  new URL(plugin.homepage);
} catch {
  fail('plugin.json: homepage is not a URL');
}
const servers = Object.entries(plugin.mcpServers ?? {});
if (servers.length === 0) fail('plugin.json: no mcpServers');
for (const [name, cfg] of servers) {
  if (cfg.command !== 'node') fail(`mcpServers.${name}: expected command "node"`);
  for (const arg of cfg.args ?? []) {
    const m = /^\$\{CLAUDE_PLUGIN_ROOT\}\/(.+)$/.exec(arg);
    if (m && !fs.existsSync(path.join(root, m[1]))) fail(`mcpServers.${name}: ${m[1]} does not exist`);
  }
}

// marketplace.json
if (!market.name || !NAME.test(market.name)) fail('marketplace.json: name missing or invalid');
if (!market.owner?.name) fail('marketplace.json: owner.name missing');
if (!market.description) fail('marketplace.json: description missing');
if (!Array.isArray(market.plugins) || market.plugins.length === 0) fail('marketplace.json: plugins empty');
for (const [i, entry] of (market.plugins ?? []).entries()) {
  if (!entry.name || !NAME.test(entry.name)) fail(`marketplace.json plugins[${i}]: invalid name`);
  if (typeof entry.source !== 'string' || !(entry.source === '.' || entry.source.startsWith('./'))) {
    fail(`marketplace.json plugins[${i}]: source must be a relative path starting with ./`);
  } else if (!fs.existsSync(path.join(root, entry.source, '.claude-plugin', 'plugin.json'))) {
    fail(`marketplace.json plugins[${i}]: no plugin at ${entry.source}`);
  }
  if (entry.version) fail(`marketplace.json plugins[${i}]: set version in plugin.json only`);
}

// Markdown components with frontmatter
function frontmatter(rel) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) {
    fail(`${rel}: missing frontmatter`);
    return {};
  }
  return Object.fromEntries(
    m[1]
      .split('\n')
      .map((l) => /^([A-Za-z_-]+):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map((x) => [x[1], x[2]])
  );
}
for (const dir of fs.readdirSync(path.join(root, 'skills'))) {
  const fm = frontmatter(`skills/${dir}/SKILL.md`);
  if (!fm.description) fail(`skills/${dir}/SKILL.md: description missing`);
  if (((fm.description ?? '') + (fm.when_to_use ?? '')).length > 1536) fail(`skills/${dir}: description too long`);
}
const toolNames = new Set();
const serverSrc = fs.readFileSync(path.join(root, 'src/server.ts'), 'utf8');
for (const m of serverSrc.matchAll(/name: '([a-z_]+)',\n\s+description:/g)) toolNames.add(m[1]);
for (const file of fs.readdirSync(path.join(root, 'agents'))) {
  const fm = frontmatter(`agents/${file}`);
  if (!fm.name || !fm.description) fail(`agents/${file}: name and description required`);
  for (const tool of (fm.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean)) {
    const m = /^mcp__plugin_([^_]+(?:-[^_]+)*)_([^_]+(?:-[^_]+)*)__(\w+)$/.exec(tool);
    if (!m) continue;
    if (m[1] !== plugin.name || !plugin.mcpServers?.[m[2]]) fail(`agents/${file}: ${tool} names an unknown plugin or server`);
    if (!toolNames.has(m[3])) fail(`agents/${file}: ${tool} is not a tool the server defines`);
  }
}
if (fs.existsSync(path.join(root, 'CLAUDE.md'))) fail('CLAUDE.md at the plugin root is not loaded by plugins; keep it in .claude/');

if (errors.length) {
  console.error(`Plugin validation failed:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`Plugin files OK: ${plugin.name}@${plugin.version}, ${servers.length} MCP server, tools known: ${[...toolNames].join(', ')}`);
