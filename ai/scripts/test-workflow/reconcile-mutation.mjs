#!/usr/bin/env node
// G6 Mutation reconciliation.  Usage:
//   node ai/scripts/test-workflow/reconcile-mutation.mjs --scope <scope.json> --cycle <dir>
// For each scope.mutation entry, reads <cycle>/mutation/<id>.log (the saved output of the repository's mutation
// runner) and the entry's mutant definitions, and checks:
//   - every defined mutant has a result and every baseline was green
//   - KILLED has at least one killing suite; EQUIVALENT is flagged in the definitions, has a written argument
//     in the mutant name ("equivalent: ...") and no killing suite; a mutant flagged equivalent that anything kills is an error
//   - SURVIVED and MISAPPLIED mutants block the gate; SKIPPED mutants make it UNABLE_TO_VERIFY
import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BLOCKED, PASS, UNABLE, abs, exitCodeFor, isMain, loadScope, parseArgs, printGate, readText, worst, writeGate, writeText,
} from './lib.mjs';

const RESULT = /^([A-Za-z][A-Za-z0-9-]*)\s+(killed|survived|equivalent|misapplied|skipped)\s+(.*)$/i;
const BASELINE = /^baseline\s+(.*?):\s+(green|NOT GREEN|SKIPPED.*)$/;

export function parseLog(text, suiteNames) {
  const results = new Map();
  const baselines = [];
  for (const line of text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n?/g, '\n').split('\n')) {
    const baseline = line.match(BASELINE);
    if (baseline) {
      baselines.push({ suite: baseline[1], state: baseline[2] === 'green' ? 'green' : baseline[2].startsWith('SKIPPED') ? 'skipped' : 'not green' });
      continue;
    }
    const match = line.match(RESULT);
    if (!match) continue;
    let rest = match[3].trim();
    const killers = [];
    // run.mjs prints "killed by: <suite> <mutant name>"; the older form put a colon after the suite name. Accept both.
    const killedBy = rest.match(/^killed by:\s*([A-Za-z][A-Za-z0-9-]*)(?=:|\s|$)/i);
    if (killedBy && suiteNames.has(killedBy[1])) killers.push(killedBy[1]);
    for (;;) {
      const suite = [...suiteNames].sort((a, b) => b.length - a.length).find((name) => rest === name || rest.startsWith(`${name} `));
      if (!suite) break;
      killers.push(suite);
      rest = rest.slice(suite.length).replace(/^\s*\|\s*/, '').trimStart();
    }
    results.set(match[1], { status: match[2].toLowerCase(), killers });
  }
  return { results, baselines };
}

const argument = (name) => (name.match(/equivalent:\s*(.+?)\)?\s*$/i)?.[1] ?? '').trim();

export function reconcile(entryId, definitions, parsed) {
  const findings = [];
  const gaps = [];
  const rows = [];
  let unable = false;
  for (const baseline of parsed.baselines) {
    if (baseline.state === 'not green') findings.push(`${entryId}: baseline ${baseline.suite} is not green, so no mutant result can be trusted`);
    if (baseline.state === 'skipped') unable = true;
  }
  if (!parsed.baselines.length) findings.push(`${entryId}: the log has no baseline line`);
  const counts = { total: definitions.length, killed: 0, survived: 0, equivalent: 0, misapplied: 0, skipped: 0, noResult: 0 };
  for (const mutant of definitions) {
    const result = parsed.results.get(mutant.id);
    const row = { entry: entryId, id: mutant.id, file: mutant.file ?? '', mutation: mutant.name, flaggedEquivalent: !!mutant.equivalent, result: result?.status ?? 'NO RESULT', killers: result?.killers ?? [] };
    rows.push(row);
    if (!result) {
      counts.noResult += 1;
      findings.push(`${entryId} ${mutant.id}: defined but the log has no result`);
      continue;
    }
    counts[result.status] += 1;
    if (result.status === 'killed') {
      if (!result.killers.length) findings.push(`${entryId} ${mutant.id}: killed but no killing suite is named`);
      if (mutant.equivalent) findings.push(`${entryId} ${mutant.id}: flagged equivalent but killed by ${result.killers.join(', ') || 'a suite'} (an equivalent mutant must have no killing test)`);
    } else if (result.status === 'equivalent') {
      if (!mutant.equivalent) findings.push(`${entryId} ${mutant.id}: reported equivalent but not flagged in the definitions`);
      if (argument(mutant.name).length < 10) findings.push(`${entryId} ${mutant.id}: equivalent without a written argument in its name ("equivalent: ...")`);
    } else if (result.status === 'survived') findings.push(`${entryId} ${mutant.id}: SURVIVED (${mutant.name}); add a test or record a gap`);
    else if (result.status === 'misapplied') findings.push(`${entryId} ${mutant.id}: MISAPPLIED; its edit no longer matches the code`);
    else if (result.status === 'skipped') unable = true;
  }
  for (const id of parsed.results.keys()) if (!definitions.some((mutant) => mutant.id === id)) findings.push(`${entryId} ${id}: in the log but not in the definitions`);
  return { findings, gaps, rows, counts, unable };
}

/** Suites of a mutation entry with the test files they run (repo-relative) and their non-equivalent mutant ids. */
export function suiteLinks(entry, module) {
  const suites = module.SUITES ?? {};
  const mutants = module[entry.export] ?? [];
  const links = [];
  for (const [name, suite] of Object.entries(suites)) {
    const args = suite.args ?? [];
    const files = [];
    for (let i = 1; i < args.length; i += 1) {
      if (args[i] === '--config') {
        i += 1;
        continue;
      }
      if (args[i].startsWith('--')) continue;
      files.push(posix.normalize(posix.join(entry.cwd, args[i])));
    }
    const ids = mutants.filter((m) => !m.equivalent && (m.suites ?? []).includes(name)).map((m) => m.id);
    links.push({ entry: entry.id, suite: name, files, mutants: ids });
  }
  return links;
}

export async function loadEntry(entry) {
  const module = await import(`${pathToFileURL(abs(entry.mutantsFile)).href}?t=${Date.now()}`);
  return { module, definitions: module[entry.export] ?? [] };
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.scope || !flags.cycle) {
    console.error('usage: reconcile-mutation.mjs --scope <scope.json> --cycle <dir>');
    process.exit(2);
  }
  const scope = loadScope(flags.scope);
  const findings = [];
  const rows = [];
  const entries = [];
  const totals = { total: 0, killed: 0, survived: 0, equivalent: 0, misapplied: 0, skipped: 0, noResult: 0 };
  let unable = false;
  for (const entry of scope.mutation ?? []) {
    const logPath = join(flags.cycle, 'mutation', `${entry.id}.log`);
    if (!existsSync(abs(logPath))) {
      unable = true;
      entries.push({ id: entry.id, run: false });
      findings.push(`${entry.id}: no mutation log (NOT RUN)`);
      continue;
    }
    const { module, definitions } = await loadEntry(entry);
    const parsed = parseLog(readText(logPath), new Set(Object.keys(module.SUITES ?? {})));
    const outcome = reconcile(entry.id, definitions, parsed);
    findings.push(...outcome.findings);
    rows.push(...outcome.rows);
    unable ||= outcome.unable;
    for (const key of Object.keys(totals)) totals[key] += outcome.counts[key];
    entries.push({ id: entry.id, run: true, ...outcome.counts });
  }
  const scored = totals.total - totals.equivalent;
  const score = scored > 0 ? Math.round((totals.killed / scored) * 10000) / 100 : null;
  const equivalentButKilled = findings.filter((f) => /flagged equivalent but killed/.test(f)).length;

  writeText(
    join(flags.cycle, 'mutation-report.md'),
    `# Mutation report\n\n| Entry | Mutant | File | Mutation | Result | Killing suites |\n|---|---|---|---|---|---|\n${rows
      .map((r) => `| ${r.entry} | ${r.id} | ${r.file} | ${r.mutation.replace(/\|/g, '/')} | ${r.result}${r.flaggedEquivalent ? ' (flagged equivalent)' : ''} | ${r.killers.join(', ')} |`)
      .join('\n')}\n`,
  );
  const status = worst([findings.some((f) => !/no mutation log/.test(f)) ? BLOCKED : PASS, unable ? UNABLE : PASS]);
  const gate = {
    gate: 'G6',
    name: 'Mutation reconciliation',
    status,
    summary: { ...totals, score, equivalentButKilled, entries },
    findings,
    gaps: [],
  };
  writeGate(flags.cycle, gate);
  printGate(gate);
  process.exit(exitCodeFor(status));
}

if (isMain(import.meta.url)) await main();
