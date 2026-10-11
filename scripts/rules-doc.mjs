#!/usr/bin/env node
// Regenerate docs/RULES.md from the compiled registry (run `npm run build` first; `npm run docs:rules` does).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { renderRulesDoc } = await import(path.join(root, 'dist/rules/doc.js'));
fs.writeFileSync(path.join(root, 'docs/RULES.md'), renderRulesDoc());
console.log('Wrote docs/RULES.md');
