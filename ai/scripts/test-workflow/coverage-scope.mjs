#!/usr/bin/env node
// G5 Coverage scope and measurement.  Usage:
//   node ai/scripts/test-workflow/coverage-scope.mjs --scope <scope.json> --cycle <dir>
// Reads <cycle>/coverage/<suite>/coverage-final.json for each scope suite that has a coverage component.
//   1. The measured file set must equal the scope's source file set (minus rows in coverage-exclusions.md,
//      each of which needs a reason). Source files nobody measured are reported as NOT MEASURED and block the gate.
//   2. Runs are merged per file (a statement counts as covered if any run executed it), then statement, branch,
//      function and line coverage are reported per file and in total, with the scope's coverage floor.
//   3. Every uncovered line needs a row in coverage-line-status.md (ADD-TEST, UNREACHABLE, LOW-VALUE, OPEN).
//      Lines covered only by an e2e run are classified COVERED-BY-E2E automatically. OPEN is allowed but is a gap.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOCKED, PASS, UNABLE, WORKFLOW_DIR, abs, exitCodeFor, expandGlobs, globToRegExp, isTestFile, loadScope, parseArgs, parseTables,
  printGate, readJson, readText, rel, stripTicks, writeGate, writeText,
} from './lib.mjs';

export const STATUSES = ['COVERED-BY-E2E', 'ADD-TEST', 'UNREACHABLE', 'LOW-VALUE', 'OPEN'];
const key = (loc) => `${loc?.start?.line}:${loc?.start?.column}-${loc?.end?.line}:${loc?.end?.column}`;

/** Folds one run's istanbul-style entry for a file into the merged record. */
export function mergeEntry(merged, entry, runId) {
  for (const [id, loc] of Object.entries(entry.statementMap ?? {})) {
    const k = key(loc);
    const slot = (merged.statements[k] ??= { line: loc.start.line, runs: {} });
    slot.runs[runId] = (slot.runs[runId] ?? 0) + (entry.s?.[id] ?? 0);
  }
  for (const [id, fn] of Object.entries(entry.fnMap ?? {})) {
    const k = key(fn.loc);
    const slot = (merged.functions[k] ??= { line: fn.loc?.start?.line, runs: {} });
    slot.runs[runId] = (slot.runs[runId] ?? 0) + (entry.f?.[id] ?? 0);
  }
  for (const [id, branch] of Object.entries(entry.branchMap ?? {})) {
    (branch.locations ?? []).forEach((loc, index) => {
      const k = `${branch.type}@${key(branch.loc)}#${index}`;
      const slot = (merged.branches[k] ??= { line: loc?.start?.line ?? branch.loc?.start?.line, runs: {} });
      slot.runs[runId] = (slot.runs[runId] ?? 0) + (entry.b?.[id]?.[index] ?? 0);
    });
  }
}

const covered = (slot) => Object.values(slot.runs).some((count) => count > 0);
const coveredBy = (slot, ids) => ids.some((id) => (slot.runs[id] ?? 0) > 0);
const pct = (c, t) => (t === 0 ? 100 : Math.round((c / t) * 10000) / 100);

/** Metrics, uncovered lines and e2e-only lines of one merged file. */
export function summarise(merged, unitRuns, e2eRuns) {
  const stmts = Object.values(merged.statements);
  const fns = Object.values(merged.functions);
  const branches = Object.values(merged.branches);
  const lineSlots = new Map();
  for (const slot of stmts) {
    const current = lineSlots.get(slot.line) ?? [];
    current.push(slot);
    lineSlots.set(slot.line, current);
  }
  const uncoveredLines = [];
  const e2eOnlyLines = [];
  let coveredLines = 0;
  for (const [line, slots] of [...lineSlots].sort((a, b) => a[0] - b[0])) {
    if (slots.some(covered)) {
      coveredLines += 1;
      if (e2eRuns.length && !slots.some((slot) => coveredBy(slot, unitRuns)) && slots.some((slot) => coveredBy(slot, e2eRuns))) e2eOnlyLines.push(line);
    } else uncoveredLines.push(line);
  }
  const count = (slots) => ({ covered: slots.filter(covered).length, total: slots.length });
  return {
    statements: count(stmts),
    branches: count(branches),
    functions: count(fns),
    lines: { covered: coveredLines, total: lineSlots.size },
    uncoveredLines,
    e2eOnlyLines,
    uncoveredBranchLines: [...new Set(branches.filter((slot) => !covered(slot)).map((slot) => slot.line).filter(Boolean))].sort((a, b) => a - b),
  };
}

export function expandLines(spec) {
  const lines = new Set();
  for (const part of String(spec).split(',').map((p) => p.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) for (let n = Number(range[1]); n <= Number(range[2]); n += 1) lines.add(n);
    else if (/^\d+$/.test(part)) lines.add(Number(part));
  }
  return lines;
}

/** Rows of coverage-exclusions.md. Kind `file` (default) removes the file from measurement; `ignore-comment` documents a coverage ignore comment and keeps the file measured. */
export function readExclusions() {
  const table = parseTables(readText(`${WORKFLOW_DIR}/coverage-exclusions.md`)).find((t) => t.header.includes('reason'));
  return (table?.rows ?? []).map((row) => ({ glob: stripTicks(row.file), kind: (stripTicks(row.kind ?? '') || 'file').toLowerCase(), reason: (row.reason ?? '').trim() }));
}

const IGNORE_COMMENT = /\/[*/]\s*(?:v8|istanbul|c8)\s+ignore/;

/** Lines of a source text that carry a coverage ignore comment. */
export function ignoreCommentLines(text) {
  return text.split('\n').flatMap((line, index) => (IGNORE_COMMENT.test(line) ? [index + 1] : []));
}

export function readLineStatuses() {
  const table = parseTables(readText(`${WORKFLOW_DIR}/coverage-line-status.md`)).find((t) => t.header.includes('lines'));
  return (table?.rows ?? []).map((row) => ({
    file: stripTicks(row.file),
    lines: expandLines(stripTicks(row.lines)),
    status: stripTicks(row.status).toUpperCase(),
    note: (row.note ?? '').trim(),
  }));
}

export function totals(files, metric) {
  const covered = files.reduce((sum, f) => sum + f[metric].covered, 0);
  const total = files.reduce((sum, f) => sum + f[metric].total, 0);
  return { covered, total, pct: pct(covered, total) };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.scope || !flags.cycle) {
    console.error('usage: coverage-scope.mjs --scope <scope.json> --cycle <dir>');
    process.exit(2);
  }
  const scope = loadScope(flags.scope);
  const coverageDir = join(flags.cycle, 'coverage');
  const runs = (scope.suites ?? []).filter((suite) => suite.coverage).map((suite) => ({ id: suite.id, file: join(coverageDir, suite.id, 'coverage-final.json') }));
  const present = runs.filter((run) => existsSync(abs(run.file)));
  const findings = [];
  const gaps = [];

  const sourceFiles = expandGlobs(Object.values(scope.sources ?? {}).flat()).filter((file) => !isTestFile(file) && !file.endsWith('.d.ts'));
  const exclusions = readExclusions();
  for (const exclusion of exclusions) if (!exclusion.reason) findings.push(`exclusion ${exclusion.glob} has no reason`);
  const excluded = (file) => exclusions.some((exclusion) => exclusion.kind === 'file' && exclusion.reason && globToRegExp(exclusion.glob).test(file));
  const ignoreJustified = (file) => exclusions.some((exclusion) => exclusion.kind === 'ignore-comment' && exclusion.reason && globToRegExp(exclusion.glob).test(file));
  for (const file of sourceFiles) {
    const lines = ignoreCommentLines(readText(file));
    if (lines.length && !ignoreJustified(file)) findings.push(`${file}:${lines.join(',')} has a coverage ignore comment but no ignore-comment row with a reason in coverage-exclusions.md`);
  }

  if (!present.length) {
    const gate = { gate: 'G5', name: 'Coverage scope and measurement', status: UNABLE, summary: { runsFound: 0, runsExpected: runs.map((r) => r.id) }, findings: ['no coverage runs found in the cycle folder'], gaps };
    writeGate(flags.cycle, gate);
    printGate(gate);
    process.exit(exitCodeFor(UNABLE));
  }
  for (const run of runs) if (!present.includes(run)) findings.push(`coverage run ${run.id} is missing from the cycle folder`);

  const unitRuns = present.filter((run) => !/e2e/.test(run.id)).map((run) => run.id);
  const e2eRuns = present.filter((run) => /e2e/.test(run.id)).map((run) => run.id);
  const mergedByFile = new Map();
  for (const run of present) {
    const data = readJson(run.file);
    for (const [absolute, entry] of Object.entries(data)) {
      const file = rel(absolute);
      if (!mergedByFile.has(file)) mergedByFile.set(file, { statements: {}, functions: {}, branches: {} });
      mergeEntry(mergedByFile.get(file), entry, run.id);
    }
  }
  const measured = [...mergedByFile.keys()].sort();
  const notMeasured = sourceFiles.filter((file) => !mergedByFile.has(file) && !excluded(file));
  for (const file of notMeasured) findings.push(`${file} is in scope but was not measured (add a test that loads it, or an exclusion with a reason)`);
  writeText(join(coverageDir, 'source-files.txt'), `${sourceFiles.join('\n')}\n`);
  writeText(join(coverageDir, 'measured-files.txt'), `${measured.join('\n')}\n`);

  const statuses = readLineStatuses();
  const files = [];
  const lineStatusCounts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const file of sourceFiles.filter((f) => mergedByFile.has(f) && !excluded(f))) {
    const summary = summarise(mergedByFile.get(file), unitRuns, e2eRuns);
    const rows = statuses.filter((row) => row.file === file);
    const lineStatus = {};
    const classify = (line, status, note) => {
      lineStatus[line] = status;
      lineStatusCounts[status] += 1;
      if (status === 'OPEN') gaps.push({ type: 'coverage-open', ref: `${file}:${line}`, reason: note || 'status OPEN' });
    };
    for (const line of summary.e2eOnlyLines) classify(line, 'COVERED-BY-E2E', `covered by ${e2eRuns.join(', ')} only`);
    for (const line of summary.uncoveredLines) {
      const row = rows.find((r) => r.lines.has(line));
      if (!row) {
        findings.push(`${file}:${line} is uncovered and has no status in coverage-line-status.md`);
        continue;
      }
      if (!STATUSES.includes(row.status)) findings.push(`${file}:${line} has unknown status "${row.status}"`);
      else if (!row.note) findings.push(`${file}:${line} status ${row.status} needs a note`);
      else classify(line, row.status, row.note);
    }
    const stale = rows.filter((row) => ![...row.lines].some((line) => summary.uncoveredLines.includes(line)));
    files.push({ file, ...summary, lineStatus, staleStatusRows: stale.length });
  }

  const floor = scope.coverageFloor ?? {};
  const total = Object.fromEntries(['statements', 'branches', 'functions', 'lines'].map((metric) => [metric, totals(files, metric)]));
  const floorMissed = Object.entries(floor).filter(([metric, value]) => total[metric] && total[metric].pct < value).map(([metric]) => metric);
  for (const metric of floorMissed) gaps.push({ type: 'coverage-floor', ref: metric, reason: `${total[metric].pct}% is below the floor ${floor[metric]}%` });

  const status = findings.length ? BLOCKED : PASS;
  const gate = {
    gate: 'G5',
    name: 'Coverage scope and measurement',
    status,
    summary: {
      runs: present.map((run) => run.id),
      sourceFiles: sourceFiles.length,
      measuredInScope: files.length,
      notMeasured: notMeasured.length,
      total,
      floor,
      floorMissed,
      lineStatus: lineStatusCounts,
    },
    findings,
    gaps,
    files,
    notMeasured,
  };
  writeGate(flags.cycle, gate);
  printGate({ ...gate, summary: { ...gate.summary, total: Object.fromEntries(Object.entries(total).map(([k, v]) => [k, `${v.pct}%`])) } });
  process.exit(exitCodeFor(status));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
