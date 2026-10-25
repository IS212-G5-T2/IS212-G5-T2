#!/usr/bin/env node
// Runs one test-workflow cycle for a story and saves every output in the cycle folder.
// A scope with "linesFrom": "changed-lines" runs story-lines.mjs before the coverage step (see ai/docs/test-workflow.md, G5).
//   node ai/scripts/test-workflow/run-cycle.mjs --scope docs/test-cases/workflow/scopes/SPM-135.json
//        [--cycle <dir>] [--steps ids,spec,determinism,run,coverage,mutation,records,report] [--skip mutation]
//        [--tz UTC,Asia/Singapore] [--record] [--dry-run]
// Steps run in the order of ai/docs/test-workflow.md section 8. A step whose prerequisites are missing (for example
// DATABASE_URL for the real-database suites) is reported as NOT RUN, never skipped silently, and its gate is
// UNABLE_TO_VERIFY. Needs: git, node, npx (the component's own node_modules). Cycle evidence goes to ai/runtime/.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPO_ROOT, WORKFLOW_DIR, abs, asList, executionStatus, fileExists, loadScope, parseArgs, parseCsv, readJson, readText, scopeTests, timezoneStatus,
  usesChangedLines, writeGate, writeText,
} from './lib.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ALL_STEPS = ['ids', 'spec', 'determinism', 'run', 'coverage', 'mutation', 'records', 'report'];

const { flags } = parseArgs(process.argv.slice(2));
if (!flags.scope) {
  console.error('usage: run-cycle.mjs --scope <scope.json> [--cycle <dir>] [--steps a,b] [--skip a] [--tz Z1,Z2] [--record] [--dry-run]');
  process.exit(2);
}
const scope = loadScope(flags.scope);
const dryRun = !!flags['dry-run'];
const steps = (flags.steps ? String(flags.steps).split(',') : ALL_STEPS).filter((step) => !asList(flags.skip).join(',').split(',').includes(step));
const zones = flags.tz ? String(flags.tz).split(',') : scope.tz?.length ? scope.tz : [process.env.TZ || 'UTC'];

const historyPath = `${WORKFLOW_DIR}/metrics-history.csv`;
const history = fileExists(historyPath) ? parseCsv(readText(historyPath)) : [];
const mine = history.filter((row) => row.story === scope.story);
const folderNumber = typeof flags.cycle === 'string' ? flags.cycle.match(/cycle-(\d+)\/?$/)?.[1] : undefined;
const cycleNumber = Number(flags['cycle-number'] ?? folderNumber ?? (mine.length ? Math.max(...mine.map((r) => Number(r.cycle))) + 1 : 1));
const cycle = flags.cycle || `ai/runtime/test-cycles/${scope.story}/cycle-${String(cycleNumber).padStart(2, '0')}`;
const log = (text) => {
  console.log(text);
  if (!dryRun) appendFileSync(abs(join(cycle, 'cycle.log')), `${text}\n`, { flag: 'a' });
};
if (!dryRun) writeText(join(cycle, 'cycle.log'), `cycle ${cycleNumber} for ${scope.story}\n`);
log(`cycle folder: ${cycle}  (cycle ${cycleNumber}; steps: ${steps.join(', ')}; timezones: ${zones.join(', ')})`);

function run(command, args, options = {}) {
  log(`$ ${options.cwd ? `(cd ${options.cwd}) ` : ''}${[command, ...args].join(' ')}`);
  if (dryRun) return { status: 0, stdout: '', stderr: '' };
  return spawnSync(command, args, {
    cwd: abs(options.cwd ?? '.'), env: { ...process.env, ...(options.env ?? {}) }, encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

const runVitest = (suite, args, options = {}) => run(
  process.execPath,
  [abs(join(suite.cwd, 'node_modules', 'vitest', 'vitest.mjs')), ...args],
  { cwd: suite.cwd, ...options },
);

const script = (name, extra = []) => {
  const args = [join(HERE, name), '--scope', flags.scope, '--cycle', cycle, ...extra];
  log(`$ node ${relative(REPO_ROOT, args[0])} ${args.slice(1).join(' ')}`);
  if (dryRun) return 0;
  return spawnSync(process.execPath, args, { cwd: REPO_ROOT, stdio: 'inherit' }).status;
};

const missingEnv = (names) => names.filter((name) => !process.env[name]);
const toCwd = (file, cwd) => (file.startsWith(`${cwd}/`) ? file.slice(cwd.length + 1) : file);

function runSuites() {
  const results = [];
  const zoneTotals = Object.fromEntries(zones.map((zone) => [zone, { total: 0, passed: 0, failed: 0, skipped: 0, notRun: 0 }]));
  let runner = '';
  for (const suite of scope.suites ?? []) {
    const files = scopeTests(scope).filter((entry) => entry.suite === suite.tests).map((entry) => toCwd(entry.file, suite.cwd));
    const missing = missingEnv(suite.env ?? []);
    if (missing.length) {
      log(`NOT RUN suite ${suite.id}: set ${missing.join(', ')}`);
      results.push({ id: suite.id, ran: false, reason: `missing ${missing.join(', ')}` });
      for (const zone of zones) zoneTotals[zone].notRun += 1;
      continue;
    }
    if (!runner && !dryRun) {
      const version = runVitest(suite, ['--version']);
      runner = version.status === 0 ? `vitest ${(version.stdout ?? '').trim().replace(/^vitest\//, '')}` : 'vitest (version unavailable)';
    }
    zones.forEach((zone, index) => {
      const jsonPath = join(cycle, index === 0 ? 'test-run' : join('tz-runs', zone.replace(/\//g, '_')), `${suite.id}.json`);
      const args = ['vitest', 'run', ...(suite.config ? ['--config', suite.config] : []), ...files, '--reporter=json', `--outputFile=${abs(jsonPath)}`];
      if (index === 0 && suite.coverage) {
        args.push('--coverage.enabled', '--coverage.provider=v8', '--coverage.reporter=json', '--coverage.reporter=json-summary', `--coverage.reportsDirectory=${abs(join(cycle, 'coverage', suite.id))}`);
        for (const glob of scope.sources?.[suite.coverage] ?? []) args.push(`--coverage.include=${toCwd(glob, suite.cwd)}`);
      }
      const outcome = runVitest(suite, args.slice(1), { env: { TZ: zone } });
      if (!dryRun) {
        appendFileSync(abs(join(cycle, 'test-run.log')), `\n## ${suite.id} TZ=${zone}\n${outcome.stdout ?? ''}\n${outcome.stderr ?? outcome.error?.message ?? ''}\n`, { flag: 'a' });
        const data = existsSync(abs(jsonPath)) ? JSON.parse(readFileSync(abs(jsonPath), 'utf8')) : undefined;
        if (!data) {
          zoneTotals[zone].notRun += 1;
          if (index === 0) results.push({ id: suite.id, ran: false, reason: 'no vitest json output' });
          return;
        }
        const skipped = (data.numPendingTests ?? 0) + (data.numTodoTests ?? 0);
        zoneTotals[zone].total += data.numTotalTests;
        zoneTotals[zone].passed += data.numPassedTests;
        zoneTotals[zone].failed += data.numFailedTests;
        zoneTotals[zone].skipped += skipped;
        if (index === 0) {
          const end = Math.max(...(data.testResults ?? []).map((r) => r.endTime ?? 0), data.startTime);
          results.push({ id: suite.id, ran: true, total: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests, skipped, durationSeconds: Math.round((end - data.startTime) / 100) / 10 });
        }
      }
    });
  }
  if (dryRun) return;
  const ran = results.filter((r) => r.ran);
  const sum = (key) => ran.reduce((total, r) => total + r[key], 0);
  const g7Status = executionStatus(results);
  writeGate(cycle, {
    gate: 'G7', name: 'Execution', status: g7Status,
    summary: { total: sum('total'), passed: sum('passed'), failed: sum('failed'), skipped: sum('skipped'), durationSeconds: Math.round(sum('durationSeconds') * 10) / 10, runner, suites: results },
    findings: results.filter((r) => !r.ran).map((r) => `suite ${r.id} NOT RUN: ${r.reason}`)
      .concat(ran.flatMap((r) => [
        ...(r.failed ? [`suite ${r.id}: ${r.failed} failed`] : []),
        ...(r.skipped ? [`suite ${r.id}: ${r.skipped} skipped`] : []),
      ])),
    gaps: [],
  });
  writeGate(cycle, {
    gate: 'G4tz', name: 'Timezone runs', status: timezoneStatus(zoneTotals),
    summary: { zones: zoneTotals },
    findings: Object.entries(zoneTotals).flatMap(([zone, z]) => [
      ...(z.failed ? [`${zone}: ${z.failed} failed`] : []),
      ...(z.skipped ? [`${zone}: ${z.skipped} skipped`] : []),
      ...(!z.failed && !z.skipped && (z.notRun || !z.total) ? [`${zone}: NOT RUN`] : []),
    ]),
    gaps: [],
  });
  log(`G7 Execution: ${g7Status}  (${sum('passed')} passed, ${sum('failed')} failed, ${sum('skipped')} skipped)`);
}

function runMutation() {
  for (const entry of scope.mutation ?? []) {
    const missing = missingEnv(entry.env ?? []);
    if (missing.length) {
      log(`NOT RUN mutation ${entry.id}: set ${missing.join(', ')}`);
      continue;
    }
    const [command, ...args] = entry.command;
    // The measured per-test kills (failing tests under each mutant) are saved for check-records.
    const outcome = run(command, [...args, '--measure-kills', abs(join(cycle, 'mutation', `${entry.id}.kills.json`))], { cwd: entry.cwd });
    if (!dryRun) writeText(join(cycle, 'mutation', `${entry.id}.log`), `${outcome.stdout}\n${outcome.stderr}`);
  }
  script('reconcile-mutation.mjs');
}

const matrix = join(cycle, 'confluence-matrix-ids.txt');
for (const step of steps) {
  log(`\n== step: ${step}`);
  if (step === 'ids') {
    if (!fileExists(matrix)) log(`note: ${matrix} is missing, so PRIMARY ids cannot be checked against Confluence (G1 will be UNABLE_TO_VERIFY). Save the matrix ids there first.`);
    script('check-ids.mjs', fileExists(matrix) ? ['--matrix', matrix] : []);
  } else if (step === 'spec') script('check-spec.mjs');
  else if (step === 'determinism') script('scan-determinism.mjs');
  else if (step === 'run') runSuites();
  else if (step === 'coverage') {
    // A scope with linesFrom "changed-lines" measures only the lines story-lines.mjs derives for the story. If that
    // step fails, coverage-scope.mjs finds no changed-lines.json and blocks G5 rather than measuring every line.
    if (usesChangedLines(scope) && script('story-lines.mjs') !== 0) log('story-lines.mjs failed: changed-lines.json was not written');
    script('coverage-scope.mjs');
  }
  else if (step === 'mutation') runMutation();
  else if (step === 'records') script('check-records.mjs');
  else if (step === 'report') script('report.mjs', ['--cycle-number', String(cycleNumber), ...(flags.record ? ['--record'] : [])]);
  else log(`unknown step ${step}`);
}
log(`\ncycle folder: ${cycle}`);
