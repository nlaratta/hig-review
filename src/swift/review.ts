/**
 * review_swiftui: run the heuristics over inline code or a .swift file and attach citations.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ApplePlatform } from '../types/index.js';
import { HIGServerError } from '../types/index.js';
import { ruleById, type Severity } from '../rules/registry.js';
import type { Citation, Citer } from '../rules/citation.js';
import { toSource } from './lexer.js';
import { runHeuristics, type Confidence } from './heuristics.js';

export const MAX_SOURCE_BYTES = 200 * 1024;

export interface Finding {
  ruleId: string;
  rule: string;
  check: string;
  kind: 'heuristic';
  severity: Severity;
  confidence: Confidence;
  lines: [number, number];
  snippet: string;
  message: string;
  citation: Citation;
}

export interface Review {
  file?: string;
  platform: ApplePlatform;
  summary: {
    findings: number;
    bySeverity: Record<Severity, number>;
    byCheck: Record<string, number>;
    linesScanned: number;
  };
  note: string;
  findings: Finding[];
}

export async function loadSwift(params: { code?: string; path?: string }, cwd = process.cwd()): Promise<{ code: string; file?: string }> {
  if (params.code !== undefined && params.path !== undefined) {
    throw new HIGServerError('INVALID_INPUT', 'Pass either code or path, not both.');
  }
  if (params.code !== undefined) {
    if (Buffer.byteLength(params.code) > MAX_SOURCE_BYTES) {
      throw new HIGServerError('TOO_LARGE', `Code is larger than ${MAX_SOURCE_BYTES / 1024} KB; review one file or view at a time.`);
    }
    return { code: params.code };
  }
  if (params.path === undefined) throw new HIGServerError('INVALID_INPUT', 'Pass code (Swift source) or path (a .swift file).');
  const file = path.resolve(cwd, params.path);
  if (path.extname(file).toLowerCase() !== '.swift') {
    throw new HIGServerError('INVALID_INPUT', `Only .swift files can be reviewed: ${params.path}`);
  }
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    throw new HIGServerError('NOT_FOUND', `Cannot read ${file}`);
  }
  if (!stat.isFile()) throw new HIGServerError('INVALID_INPUT', `Not a file: ${file}`);
  if (stat.size > MAX_SOURCE_BYTES) {
    throw new HIGServerError('TOO_LARGE', `${file} is ${Math.round(stat.size / 1024)} KB; the limit is ${MAX_SOURCE_BYTES / 1024} KB.`);
  }
  return { code: await fs.readFile(file, 'utf8'), file };
}

export async function reviewSwiftUI(
  input: { code: string; file?: string },
  platform: ApplePlatform,
  citer: Citer
): Promise<Review> {
  const src = toSource(input.code);
  const raw = runHeuristics(src, platform);
  const findings: Finding[] = [];
  for (const f of raw) {
    const rule = ruleById(f.ruleId)!;
    findings.push({
      ruleId: f.ruleId,
      rule: rule.title,
      check: f.check,
      kind: 'heuristic',
      severity: f.severity,
      confidence: f.confidence,
      lines: f.lines,
      snippet: f.snippet,
      message: f.message,
      citation: await citer.cite(rule.source.slug, rule.source.phrase),
    });
  }
  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  const byCheck: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity]++;
    byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
  }
  return {
    ...(input.file ? { file: input.file } : {}),
    platform,
    summary: { findings: findings.length, bySeverity, byCheck, linesScanned: src.lineStarts.length },
    note: 'These are lexical heuristics, not a compiler: they can misfire (custom views, styles and runtime values are invisible to them) and they miss anything not written literally. Treat each finding as a lead to confirm in the code or a screenshot. An empty result does not mean the view follows the HIG.',
    findings,
  };
}
