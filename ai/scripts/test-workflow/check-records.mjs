#!/usr/bin/env node
// G3 Test record completeness.  Usage:
//   node ai/scripts/test-workflow/check-records.mjs --scope <scope.json> --cycle <dir> [--scaffold]
// The durable record file is docs/test-cases/workflow/records/<story>.csv, one row per test definition
// (an it/test call site; an it.each is one row). Fields the script can determine are refreshed automatically:
//   test_id, file, title, line, level, kills (suite-level mutant link), comment_present, deterministic, result, ac
// Fields that need a reviewer's judgement are never overwritten: tier, tier_status, oracle_class,
// assumption_ref, explained.   --scaffold rewrites the record file (adds new tests, drops removed ones).
// Without --scaffold the records are validated against the scope's current tests and the gate result is written.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from "node:path";
import {
  BLOCKED, PASS, WORKFLOW_DIR, abs, exitCodeFor, fileExists, isMain, levelOf, loadScope, parseArgs, parseCsv, printGate, readJson,
  readText, rel, scopeTests, scopedTests, testIdOf, toCsv, writeGate, writeText,
} from './lib.mjs';
import { activeStoryIds, readRegistry } from './check-ids.mjs';
import { loadEntry, suiteLinks } from './reconcile-mutation.mjs';

export const HEADER = ['test_id', 'file', 'title', 'line', 'ac', 'tier', 'tier_status', 'level', 'oracle_class', 'assumption_ref', 'kills', 'explained', 'comment_present', 'deterministic', 'result'];
export const TIERS = ['Happy', 'Sad', 'Boundary', 'Interaction', 'Configuration', 'State', 'Isolation', 'Security', 'Concurrency', 'Error'];
export const ORACLES = ['SPEC', 'DERIVED', 'ASSUMED', 'CODE-DERIVED', 'UNTRACEABLE'];
const JUDGEMENT = ['tier', 'tier_status', 'oracle_class', 'assumption_ref', 'explained'];

export const keyOf = (row) => `${row.file}::${row.title}`;

/** A test whose id is registered to another story is checked against that story's records, not this one. */
export const belongsToOtherStory = (testId, foreignIds = new Set()) => Boolean(testId) && foreignIds.has(testId);

/** Regex for the expanded titles an it.each call site produces ("%s", "$name" ...). */
export function titleRegExp(title) {
  // Test discovery reads template literals as source text, so an apostrophe
  // escaped for the source can differ from Vitest's runtime title.
  const normalized = title.replace(/\\(['"`])/g, '$1');
  const escaped = normalized.replace(/[.+^${}()|[\]\\*?]/g, '\\$&').replace(/%[sdifjoO#%]|\\\$\w+|\\\$\\\{.*?\\\}/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Results by repo-relative file from vitest --reporter=json outputs: [{ title, status }]. */
export function readRunResults(runDir) {
  const byFile = new Map();
  if (!runDir || !existsSync(abs(runDir))) return byFile;
  for (const name of readdirSync(abs(runDir)).filter((n) => n.endsWith('.json'))) {
    const data = readJson(join(runDir, name));
    for (const suite of data.testResults ?? []) {
      const file = rel(suite.name);
      const list = byFile.get(file) ?? [];
      for (const test of suite.assertionResults ?? []) list.push({ title: test.title, status: test.status });
      byFile.set(file, list);
    }
  }
  return byFile;
}

export function resultOf(row, results) {
  const matcher = titleRegExp(row.title);
  const matched = (results.get(row.file) ?? []).filter((r) => matcher.test(r.title));
  if (!matched.length) return 'NOT RUN';
  if (matched.some((r) => r.status === 'failed')) return 'FAIL';
  if (matched.every((r) => r.status === 'passed')) return 'PASS';
  return 'NOT RUN';
}

// Test-level links: a mutant's testMappings name one test that the runner has shown to fail under that mutant.
async function killsIndex(scope, cycleDir) {
  const links = [];
  const definitions = new Map();
  const titleLinks = [];
  for (const entry of scope.mutation ?? []) {
    if (!fileExists(entry.mutantsFile)) continue;
    const { module, definitions: defs } = await loadEntry(entry);
    links.push(...suiteLinks(entry, module));
    const measured = join(cycleDir, 'mutation', `${entry.id}.kills.json`);
    if (existsSync(measured)) {
      for (const [mutant, items] of Object.entries(JSON.parse(readFileSync(measured, 'utf8')))) {
        for (const item of items) titleLinks.push({ file: item.file, title: item.title, mutant });
      }
    }
    for (const mutant of defs) {
      definitions.set(mutant.id, mutant);
      for (const mapping of mutant.testMappings ?? []) {
        titleLinks.push({ file: posix.join(entry.cwd, mapping.file), title: mapping.title, mutant: mutant.id });
      }
    }
  }
  return { links, definitions, titleLinks };
}

const killsFor = (file, links) => {
  const matching = links.filter((link) => link.files.includes(file) && link.mutants.length);
  return matching.length ? `mutants:${matching.map((link) => `${link.entry}/${link.suite}(${link.mutants.length})`).join('+')}` : '';
};

export async function buildRows(scope, existingRows, ctx) {
  const existing = new Map(existingRows.map((row) => [keyOf(row), row]));
  const registry = new Map(ctx.registryRows.map((row) => [row.id, row]));
  const { links, titleLinks } = await killsIndex(scope, dirname(ctx.runDir));
  const results = readRunResults(ctx.runDir);
  const deterministic = ctx.determinism?.perFile ?? {};
  const rows = [];
  for (const entry of scopeTests(scope)) {
    for (const test of scopedTests(entry, activeStoryIds(ctx.registryRows))) {
      const base = { file: entry.file, title: test.title };
      const previous = existing.get(keyOf(base)) ?? {};
      const testId = testIdOf(test, ctx.ignoredFamilies);
      if (belongsToOtherStory(testId, ctx.foreignIds)) continue;
      const row = Object.fromEntries(HEADER.map((name) => [name, previous[name] ?? '']));
      Object.assign(row, {
        test_id: testId,
        file: entry.file,
        title: test.title,
        line: String(test.line),
        level: levelOf(entry.file),
        comment_present: test.commentPresent ? 'Yes' : 'No',
        deterministic: entry.file in deterministic ? (deterministic[entry.file] ? 'Yes' : 'No') : previous.deterministic ?? '',
        result: results.size ? resultOf(base, results) : previous.result || 'NOT RUN',
      });
      const mapped = [...new Set(titleLinks.filter((link) => link.file === entry.file && titleRegExp(link.title).test(test.title)).map((link) => link.mutant))];
      const killed = mapped.length ? `mutants:${mapped.join(',')}` : killsFor(entry.file, links);
      if (killed && (!previous.kills || previous.kills.startsWith('mutants:'))) row.kills = killed;
      if (!row.ac && registry.get(testId)) row.ac = registry.get(testId).parent_ac;
      if (row.tier && !row.tier_status) row.tier_status = 'Present';
      rows.push(row);
    }
  }
  return rows;
}

export function validate(rows, ctx) {
  const findings = [];
  const registry = new Set(ctx.registryRows.map((row) => row.id));
  const problems = new Map();
  const note = (rule, row) => {
    if (!problems.has(rule)) problems.set(rule, []);
    problems.get(rule).push(`${row.file.split('/').pop()}:${row.line} ${row.title.slice(0, 60)}`);
  };
  const counts = {
    records: rows.length, withRegisteredId: 0, withAc: 0, withKills: 0, withComment: 0, unexplained: 0, deterministic: 0,
    passed: 0, failed: 0, notRun: 0, oracle: Object.fromEntries(ORACLES.map((o) => [o, 0])), blankOracle: 0,
  };
  for (const row of rows) {
    if (row.test_id && registry.has(row.test_id)) counts.withRegisteredId += 1;
    else note(row.test_id ? 'a test carries an id that is not in the registry' : 'a test has no registered test id', row);
    if (row.ac) counts.withAc += 1;
    else note('a test has no parent AC', row);
    if (row.kills && (row.kills.startsWith('mutants:') || ctx.mutantIds.has(row.kills.split(',')[0].trim()))) counts.withKills += 1;
    else note(row.kills ? 'a test names a mutant that does not exist' : 'a test has no kills link (mutant ids or a suite-level mutant link)', row);
    if (row.comment_present === 'Yes') counts.withComment += 1;
    if (row.deterministic === 'Yes') counts.deterministic += 1;
    else note('a test is not marked deterministic', row);
    if (!TIERS.includes(row.tier)) note('a test has no tier from the allowed list', row);
    if (!row.tier_status) note('a test has no tier_status', row);
    if (!ORACLES.includes(row.oracle_class)) {
      counts.blankOracle += 1;
      note('a test has no oracle_class', row);
    } else {
      counts.oracle[row.oracle_class] += 1;
      if (row.oracle_class === 'CODE-DERIVED' || row.oracle_class === 'UNTRACEABLE') note(`oracle_class ${row.oracle_class} is a blocker`, row);
      if (row.oracle_class === 'ASSUMED' && !row.assumption_ref) note('an ASSUMED test has no assumption_ref', row);
    }
    if (!/^(Yes|No)$/.test(row.explained)) note('a test has no explained value (Yes or No)', row);
    else if (row.explained === 'No') {
      counts.unexplained += 1;
      if (row.comment_present !== 'Yes') note('an unexplained test has no comment', row);
    }
    if (row.result === 'PASS') counts.passed += 1;
    else if (row.result === 'FAIL') counts.failed += 1;
    else counts.notRun += 1;
  }
  for (const [rule, list] of problems) findings.push(`${list.length} record(s): ${rule}. e.g. ${list.slice(0, 3).join('; ')}`);
  return { findings, counts, problems: Object.fromEntries(problems) };
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.scope || !flags.cycle) {
    console.error('usage: check-records.mjs --scope <scope.json> --cycle <dir> [--scaffold]');
    process.exit(2);
  }
  const scope = loadScope(flags.scope);
  const recordsPath = `${WORKFLOW_DIR}/records/${scope.story}.csv`;
  const { rows: registryRows, ignoredFamilies, foreignIds } = readRegistry(`${WORKFLOW_DIR}/test-id-registry.md`, scope.story);
  const existing = fileExists(recordsPath) ? parseCsv(readText(recordsPath)) : [];
  const gatePath = join(flags.cycle, 'gates', 'G4scan.json');
  const determinism = fileExists(gatePath) ? readJson(gatePath) : undefined;
  const ctx = { registryRows, ignoredFamilies, foreignIds, runDir: join(flags.cycle, 'test-run'), determinism, mutantIds: new Set() };
  const { definitions } = await killsIndex(scope, flags.cycle);
  ctx.mutantIds = new Set(definitions.keys());
  const rows = await buildRows(scope, existing, ctx);

  if (flags.scaffold) {
    writeText(recordsPath, toCsv(HEADER, rows));
    const dropped = existing.filter((row) => !rows.some((r) => keyOf(r) === keyOf(row))).length;
    console.log(`wrote ${recordsPath}: ${rows.length} records (${rows.length - (existing.length - dropped)} new, ${dropped} dropped)`);
    return;
  }
  const findings = [];
  const recorded = new Set(existing.map(keyOf));
  const current = new Set(rows.map(keyOf));
  const missing = rows.filter((row) => !recorded.has(keyOf(row)));
  const stale = existing.filter((row) => !current.has(keyOf(row)));
  if (missing.length) findings.push(`${missing.length} test(s) have no record in ${recordsPath} (run with --scaffold): e.g. ${missing.slice(0, 3).map((r) => r.title.slice(0, 50)).join('; ')}`);
  if (stale.length) findings.push(`${stale.length} record(s) describe tests that no longer exist (run with --scaffold)`);

  // Validate the stored judgement merged with the freshly derived fields.
  const merged = rows.map((row) => ({ ...row, ...Object.fromEntries(JUDGEMENT.map((name) => [name, existing.find((e) => keyOf(e) === keyOf(row))?.[name] ?? ''])) }));
  const outcome = validate(merged, ctx);
  findings.push(...outcome.findings);
  writeText(join(flags.cycle, 'test-records.csv'), toCsv(HEADER, merged));
  const status = findings.length ? BLOCKED : PASS;
  const gate = { gate: 'G3', name: 'Test record completeness', status, summary: outcome.counts, findings, gaps: [], problems: outcome.problems };
  writeGate(flags.cycle, gate);
  printGate(gate);
  process.exit(exitCodeFor(status));
}

if (isMain(import.meta.url)) await main();
