// Fault-injection (mutation) check, as described in the test-code-generation guide, section 7.
// It copies this component to a scratch directory, applies ONE mutant at a time to the copy, runs the
// mutant's suites there, and reports which mutants the suites killed. The original tree is never edited
// (the script hashes the mutated files before and after to prove it).
//
//   node scripts/testing/mutation/run.mjs                 # every mutant in spm120.mutants.mjs
//   node scripts/testing/mutation/run.mjs --mutants spm51.mutants.mjs # SPM-51 frontend mutations
//   node scripts/testing/mutation/run.mjs --mutants spm51.mutants.mjs --only FE-B06,FE-B07
//   node scripts/testing/mutation/run.mjs --suite e2e     # use one suite only (shows what that suite alone catches)
//   node scripts/testing/mutation/run.mjs --list          # show the mutants and exit
//
// Exit code: 0 when every applicable mutant is killed (or listed as equivalent), 1 when a non-equivalent mutant
// survives or an edit does not apply exactly once, 2 for invalid input/traceability or a non-green baseline,
// 3 when required suites were skipped, and 4 when a mutation process could not be executed reliably.
// Backend and frontend each own a runner with the same scratch-copy approach; their
// traceability and environment requirements may differ by component.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const { SUITES, MUTANTS, EXPECTED_ID_PREFIX: expectedIdPrefix } = await import(pathToFileURL(join(here, flag('--mutants') ?? 'spm120.mutants.mjs')).href);
const only = flag('--only')?.split(',');
const suiteOnly = flag('--suite');
const suitesOf = (m) => (suiteOnly ? m.suites.filter((s) => s === suiteOnly) : m.suites);
const killsOf = (m) => (Array.isArray(m.kills) ? m.kills : []);
const selected = MUTANTS.filter((m) => (!only || only.includes(m.id)) && suitesOf(m).length);
const suiteNames = new Set(Object.keys(SUITES));
if (suiteOnly && !suiteNames.has(suiteOnly)) {
  console.error(`Unknown suite "${suiteOnly}". Available suites: ${[...suiteNames].join(', ')}`);
  process.exit(2);
}
if (only?.some((id) => !MUTANTS.some((m) => m.id === id))) {
  const unknown = only.filter((id) => !MUTANTS.some((m) => m.id === id));
  console.error(`Unknown mutant ID(s): ${unknown.join(', ')}`);
  process.exit(2);
}
if (!selected.length) {
  console.error('No mutants selected for the requested suite/filter.');
  process.exit(2);
}
const mutantIds = new Set();
for (const mutant of selected) {
  if (mutantIds.has(mutant.id)) {
    console.error(`Duplicate mutant ID: ${mutant.id}`);
    process.exit(2);
  }
  mutantIds.add(mutant.id);
  if (expectedIdPrefix && !mutant.id.startsWith(expectedIdPrefix)) {
    console.error(`${mutant.id} must use the ${expectedIdPrefix} frontend namespace.`);
    process.exit(2);
  }
  if (expectedIdPrefix && (!Array.isArray(mutant.kills) || mutant.kills.length === 0)) {
    console.error(`${mutant.id} is missing test traceability metadata (kills).`);
    process.exit(2);
  }
  for (const target of killsOf(mutant)) {
    if (!target?.file || !target?.title) {
      console.error(`${mutant.id} has an invalid kills target; expected { file, title }.`);
      process.exit(2);
    }
    let testSource;
    try {
      testSource = readFileSync(join(root, target.file), 'utf8');
    } catch {
      console.error(`${mutant.id} references missing test file ${target.file}.`);
      process.exit(2);
    }
    const escapedTitle = target.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`\\bit\\s*\\(\\s*([\"'` + '`' + `])${escapedTitle}\\1`).test(testSource)) {
      console.error(`${mutant.id} references missing test case "${target.title}" in ${target.file}.`);
      process.exit(2);
    }
  }
}

if (args.includes('--list')) {
  for (const m of selected) {
    const targets = killsOf(m);
    const trace = targets.length ? ` | Kills (${targets.length}): ${targets.map((target) => `${target.file} :: "${target.title}"`).join('; ')}` : '';
    console.log(`${m.id.padEnd(10)} ${m.equivalent ? '[equivalent] ' : ''}${m.name}${trace}`);
  }
  process.exit(0);
}

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const originals = new Map([...new Set(selected.map((m) => m.file))].map((f) => [f, sha(join(root, f))]));

const scratch = mkdtempSync(join(tmpdir(), 'spm120-mutation-'));
cpSync(root, scratch, {
  recursive: true,
  filter: (src) => !/(^|[\\/])(node_modules|dist|coverage|test-results)([\\/]|$)/.test(relative(root, src)),
});
symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'));

const run = (suite) =>
  spawnSync(process.execPath, [join(scratch, 'node_modules/vitest/vitest.mjs'), ...SUITES[suite].args], {
    cwd: scratch,
    env: { ...process.env, ...SUITES[suite].env, CI: '1' },
    encoding: 'utf8',
    timeout: 180_000,
  });
const skipped = (suite) => SUITES[suite].needsEnv?.find((name) => !process.env[name]);

let exitCode = 0;
try {
  // Baselines first: a mutant result means nothing if the unmutated suite is not green.
  for (const suite of new Set(selected.flatMap(suitesOf))) {
    const missing = skipped(suite);
    if (missing) {
      console.log(`baseline ${suite}: SKIPPED (set ${missing})`);
      continue;
    }
    const result = run(suite);
    console.log(`baseline ${suite}: ${result.status === 0 ? 'green' : 'NOT GREEN'}`);
    if (result.status !== 0) {
      console.log((result.stdout + result.stderr).split('\n').slice(-25).join('\n'));
      exitCode = 2;
    }
  }
  if (exitCode === 0) {
    const tally = { killed: 0, survived: 0, equivalent: 0, misapplied: 0, skipped: 0, errored: 0 };
    for (const m of selected) {
      const path = join(scratch, m.file);
      const source = readFileSync(path, 'utf8');
      let mutated = source;
      let applied = true;
      for (const [from, to] of m.edits) {
        if (mutated.split(from).length !== 2) applied = false;
        mutated = mutated.replace(from, () => to);
      }
      let status;
      let by = '';
      let processError = '';
      if (!applied) {
        status = 'MISAPPLIED';
        tally.misapplied += 1;
      } else {
        writeFileSync(path, mutated);
        const runnable = suitesOf(m).filter((s) => !skipped(s));
        for (const suite of runnable) {
          const result = run(suite);
          if (result.error || result.status === null) {
            processError = result.error?.message ?? `process ended with signal ${result.signal ?? 'unknown'}`;
            break;
          }
          if (result.status !== 0) {
            by = suite;
            break;
          }
        }
        writeFileSync(path, source);
        if (processError) {
          status = 'ERROR';
          tally.errored += 1;
        } else if (by) {
          status = 'killed';
          tally.killed += 1;
        } else if (runnable.length < suitesOf(m).length) {
          status = 'skipped';
          tally.skipped += 1;
        } else if (m.equivalent) {
          status = 'equivalent';
          tally.equivalent += 1;
        } else {
          status = 'SURVIVED';
          tally.survived += 1;
        }
      }
      const targets = killsOf(m);
      const mappedKills = targets.length ? ` | Kills (${targets.length}): ${targets.map((target) => `${target.file} :: "${target.title}"`).join('; ')}` : '';
      console.log(`${m.id.padEnd(10)} ${status.padEnd(10)} ${by.padEnd(10)} ${m.name}${mappedKills}${processError ? ` | Error: ${processError}` : ''}`);
    }
    const killTargets = selected.reduce((count, mutant) => count + killsOf(mutant).length, 0);
    const traceSummary = killTargets ? ` / ${killTargets} mapped test-case links` : '';
    console.log(`\n${selected.length} mutants${traceSummary}: ${tally.killed} killed, ${tally.equivalent} equivalent, ${tally.survived} survived, ${tally.misapplied} misapplied, ${tally.skipped} skipped, ${tally.errored} execution errors`);
    if (tally.survived || tally.misapplied) exitCode = 1;
    else if (tally.errored) exitCode = 4;
    else if (tally.skipped) exitCode = 3;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

for (const [file, hash] of originals) {
  if (sha(join(root, file)) !== hash) {
    console.error(`ERROR: ${file} changed on disk during the run`);
    exitCode = 1;
  }
}
console.log('original files untouched: yes');
process.exit(exitCode);
