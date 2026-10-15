#!/usr/bin/env node
// G4 Determinism scan.  Usage:
//   node ai/scripts/test-workflow/scan-determinism.mjs --scope <scope.json> --cycle <dir>
// Scans the scope's test files for sleeps, timers, polling loops, wall-clock time and random values.
// A hit is justified only by a row in docs/test-cases/workflow/determinism-exceptions.md whose file glob and
// pattern match it; the row's Max column caps how many hits it covers. Unjustified hits block the gate.
// (The timezone runs of G4 are executed by run-cycle.mjs; this script only scans.)
import { join } from 'node:path';
import {
  BLOCKED, PASS, WORKFLOW_DIR, exitCodeFor, globToRegExp, loadScope, parseArgs, parseTables, printGate, readText,
  scopeTests, stripTicks, writeGate, writeText,
} from './lib.mjs';

export const PATTERNS = [
  { name: 'sleep', regex: /\bsleep\s*\(/ },
  { name: 'setTimeout', regex: /\bsetTimeout\s*\(/ },
  { name: 'setInterval', regex: /\bsetInterval\s*\(/ },
  { name: 'Date.now', regex: /\bDate\.now\s*\(/ },
  { name: 'new-Date', regex: /\bnew Date\(\s*\)/ },
  { name: 'Math.random', regex: /\bMath\.random\s*\(/ },
  { name: 'random-id', regex: /\b(?:randomUUID|uuidv[0-9]|nanoid)\s*\(/ },
];

const stripComments = (line) => line.replace(/\/\*.*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/, '$1');

/** Hits in one file's text: { pattern, line, text }. Also flags a loop that waits (poll-loop). */
export function scanText(text) {
  const lines = text.split('\n');
  const hits = [];
  let inBlockComment = false;
  lines.forEach((raw, index) => {
    let line = raw;
    if (inBlockComment) {
      if (!line.includes('*/')) return;
      line = line.slice(line.indexOf('*/') + 2);
      inBlockComment = false;
    }
    if (line.includes('/*') && !line.includes('*/')) {
      line = line.slice(0, line.indexOf('/*'));
      inBlockComment = true;
    }
    const code = stripComments(line);
    for (const { name, regex } of PATTERNS) if (regex.test(code)) hits.push({ pattern: name, line: index + 1, text: raw.trim().slice(0, 120) });
    if (/^\s*(?:for|while)\s*\(/.test(code)) {
      const window = lines.slice(index, index + 14).map(stripComments).join('\n');
      if (/\b(?:setTimeout|sleep)\s*\(|pg_stat_activity/.test(window)) hits.push({ pattern: 'poll-loop', line: index + 1, text: raw.trim().slice(0, 120) });
    }
  });
  return hits;
}

export function readExceptions() {
  const table = parseTables(readText(`${WORKFLOW_DIR}/determinism-exceptions.md`)).find((t) => t.header.includes('pattern'));
  return (table?.rows ?? []).map((row) => ({
    id: row.id,
    glob: stripTicks(row.file),
    pattern: stripTicks(row.pattern),
    max: Number.parseInt(row.max, 10),
    reason: row.reason?.trim() ?? '',
    cls: row.class ?? '',
  }));
}

/** Applies exceptions to per-file hits. Returns unjustified hits and the exceptions used. */
export function judge(filesWithHits, exceptions) {
  const used = new Map();
  const unjustified = [];
  const invalid = exceptions.filter((e) => !e.reason || Number.isNaN(e.max)).map((e) => `exception ${e.id || e.glob}: needs a reason and a numeric Max`);
  for (const { file, hits } of filesWithHits) {
    const counts = new Map();
    for (const hit of hits) {
      const match = exceptions.find((e) => e.reason && !Number.isNaN(e.max) && e.pattern === hit.pattern && globToRegExp(e.glob).test(file));
      const key = match ? `${match.id}|${file}` : '';
      if (match && (counts.get(key) ?? 0) < match.max) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        used.set(match.id, (used.get(match.id) ?? 0) + 1);
      } else unjustified.push({ file, ...hit });
    }
  }
  return { unjustified, used, invalid };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.scope || !flags.cycle) {
    console.error('usage: scan-determinism.mjs --scope <scope.json> --cycle <dir>');
    process.exit(2);
  }
  const scope = loadScope(flags.scope);
  const files = scopeTests(scope).map((entry) => entry.file);
  const filesWithHits = files.map((file) => ({ file, hits: scanText(readText(file)) }));
  const exceptions = readExceptions();
  const { unjustified, used, invalid } = judge(filesWithHits, exceptions);

  const totalHits = filesWithHits.reduce((sum, f) => sum + f.hits.length, 0);
  const report = [
    `files scanned: ${files.length}`,
    `hits: ${totalHits} (justified ${totalHits - unjustified.length}, unjustified ${unjustified.length})`,
    '',
    ...filesWithHits.flatMap((f) => f.hits.map((h) => `${f.file}:${h.line} ${h.pattern} ${h.text}`)),
    '',
    'exceptions used:',
    ...[...used].map(([id, n]) => `  ${id}: ${n} hit(s)`),
  ].join('\n');
  writeText(join(flags.cycle, 'determinism-scan.txt'), `${report}\n`);

  const unjustifiedFiles = new Set(unjustified.map((hit) => hit.file));
  const byPattern = (names) => unjustified.filter((hit) => names.includes(hit.pattern)).length;
  const findings = [
    ...invalid,
    ...unjustified.map((hit) => `${hit.file}:${hit.line} ${hit.pattern} is not justified: ${hit.text}`),
  ];
  const status = findings.length ? BLOCKED : PASS;
  const gate = {
    gate: 'G4scan',
    name: 'Determinism scan',
    status,
    summary: {
      filesScanned: files.length,
      hits: totalHits,
      justified: totalHits - unjustified.length,
      unjustifiedTimers: byPattern(['sleep', 'setTimeout', 'setInterval', 'poll-loop']),
      unjustifiedClockOrRandom: byPattern(['Date.now', 'new-Date', 'Math.random', 'random-id']),
      filesWithUnjustifiedHits: [...unjustifiedFiles],
    },
    findings,
    gaps: [],
    perFile: Object.fromEntries(filesWithHits.map((f) => [f.file, !unjustifiedFiles.has(f.file)])),
  };
  writeGate(flags.cycle, gate);
  printGate(gate);
  process.exit(exitCodeFor(status));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
