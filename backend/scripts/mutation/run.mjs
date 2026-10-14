// Fault-injection (mutation) check, as described in the test-code-generation guide, section 7.
// It copies this component to a scratch directory, applies ONE mutant at a time to the copy, runs the
// mutant's suites there, and reports which mutants the suites killed. The original tree is never edited
// (the script hashes the mutated files before and after to prove it).
//
//   node scripts/mutation/run.mjs                 # every mutant in spm120.mutants.mjs
//   node scripts/mutation/run.mjs --only M22,M34  # a subset
//   node scripts/mutation/run.mjs --suite e2e     # use one suite only (shows what that suite alone catches)
//   node scripts/mutation/run.mjs --list          # show the mutants and exit
//
// Exit code: 0 when every mutant is killed (or listed as equivalent), 1 when a non-equivalent mutant
// survives or an edit does not apply exactly once, 2 when a baseline suite is not green.
// Each component owns its own runner; its root URL follows the tooling folder depth.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const { SUITES, MUTANTS } = await import(pathToFileURL(join(here, flag('--mutants') ?? 'spm120.mutants.mjs')).href);
const only = flag('--only')?.split(',');
const suiteOnly = flag('--suite');
const suitesOf = (m) => (suiteOnly ? m.suites.filter((s) => s === suiteOnly) : m.suites);
const selected = MUTANTS.filter((m) => (!only || only.includes(m.id)) && suitesOf(m).length);

const mappingForKill = (kill, mutant) => {
  if (typeof kill !== 'string') return kill;
  const [rawFile, ...titleParts] = kill.split(' :: ');
  const file = rawFile.replace(/^backend\//, '');
  const title = titleParts.at(-1)?.trim();
  const suite = mutant.suites.find((candidate) =>
    (SUITES[candidate]?.args ?? []).some((arg) =>
      arg === file || file.startsWith(`${arg.replace(/\/$/, '')}/`),
    ),
  );
  return suite && title ? { suite, file, title } : undefined;
};
const mappingsOf = (mutant) => {
  if (Array.isArray(mutant.testMappings)) return mutant.testMappings;
  if (Array.isArray(mutant.kills)) return mutant.kills.map((kill) => mappingForKill(kill, mutant));
  return undefined;
};

const mappingErrors = [];
for (const mutant of selected) {
  const mappings = mappingsOf(mutant);
  if (mappings?.some((mapping) => !mapping)) {
    mappingErrors.push(`${mutant.id}: one or more kill labels could not be resolved to a suite, file, and test title`);
    continue;
  }
  for (const mapping of mappings ?? []) {
    const args = SUITES[mapping.suite]?.args ?? [];
    const fileIsInSuite = args.some((arg) =>
      arg === mapping.file || mapping.file.startsWith(`${arg.replace(/\/$/, '')}/`),
    );
    if (!mutant.suites.includes(mapping.suite))
      mappingErrors.push(`${mutant.id}: mapped suite ${mapping.suite} is not assigned to the mutant`);
    if (!fileIsInSuite)
      mappingErrors.push(`${mutant.id}: ${mapping.file} is not included by suite ${mapping.suite}`);
    if (!readFileSync(join(root, mapping.file), 'utf8').includes(mapping.title))
      mappingErrors.push(`${mutant.id}: exact test title not found in ${mapping.file}: ${mapping.title}`);
  }
}
if (mappingErrors.length) {
  console.error(`invalid mutation test mappings:\n${mappingErrors.join('\n')}`);
  process.exit(1);
}

if (args.includes('--list')) {
  for (const m of selected) console.log(`${m.id.padEnd(8)} ${m.equivalent ? '[equivalent] ' : ''}${m.name}`);
  process.exit(0);
}

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const originals = new Map([...new Set(selected.map((m) => m.file))].map((f) => [f, sha(join(root, f))]));

const scratchParent = mkdtempSync(join(tmpdir(), 'spm-venue-mutation-'));
const scratch = join(scratchParent, 'backend');
mkdirSync(scratch, { recursive: true });
cpSync(root, scratch, {
  recursive: true,
  filter: (src) => !/(^|[\\/])(node_modules|dist|coverage|test-results)([\\/]|$)/.test(relative(root, src)),
});
symlinkSync(
  join(root, 'node_modules'),
  join(scratch, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir',
);
const sourceInit = join(root, '../database/postgresql/init');
const scratchInit = join(scratchParent, 'database/postgresql/init');
if (existsSync(sourceInit)) cpSync(sourceInit, scratchInit, { recursive: true });

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const run = (suite, mapping) =>
  spawnSync(process.execPath, [
    join(scratch, 'node_modules/vitest/vitest.mjs'),
    ...SUITES[suite].args,
    ...(mapping ? ['--reporter=verbose', '--testNamePattern', escapePattern(mapping.title)] : []),
  ], {
    cwd: scratch,
    env: {
      ...process.env,
      ...SUITES[suite].env,
      SPM51_DATABASE_INIT_DIR: scratchInit,
      CI: '1',
    },
    encoding: 'utf8',
    timeout: 180_000,
  });
const outputOf = (result) => `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
// Vitest's summary proves that at least one test body ran. Exit status alone
// can be zero when discovery/configuration selects no tests.
const executedTests = (result) => {
  const summary = outputOf(result).match(
    /^\s*Tests\s+(\d+)\s+(?:passed|failed)\b/gim,
  );
  return (
    summary?.some((line) => Number(line.match(/Tests\s+(\d+)/i)?.[1]) > 0) ??
    false
  );
};
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
    const hasExecutedTests = executedTests(result);
    const green = result.status === 0 && hasExecutedTests;
    console.log(
      `baseline ${suite}: ${green ? 'green' : hasExecutedTests ? 'NOT GREEN' : 'NOT GREEN (zero tests executed)'}`,
    );
    if (!green) {
      console.log(outputOf(result).split('\n').slice(-25).join('\n'));
      exitCode = 2;
    }
  }
  if (exitCode === 0) {
    const tally = { killed: 0, survived: 0, equivalent: 0, misapplied: 0, skipped: 0 };
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
      let by = [];
      const skippedMappings = [];
      const emptyMappings = [];
      if (!applied) {
        status = 'MISAPPLIED';
        tally.misapplied += 1;
      } else {
        writeFileSync(path, mutated);
        const mappings = mappingsOf(m)?.filter((mapping) => suitesOf(m).includes(mapping.suite));
        if (mappings?.length) {
          for (const mapping of mappings) {
            const missing = skipped(mapping.suite);
            if (missing) {
              skippedMappings.push(`${mapping.suite} (set ${missing}): ${mapping.title}`);
              continue;
            }
            const result = run(mapping.suite, mapping);
            const output = `${result.stdout}\n${result.stderr}`;
            if (!output.includes(mapping.title)) {
              emptyMappings.push(`${mapping.suite}: zero tests selected for ${mapping.title}`);
            } else if (result.status !== 0) {
              by.push(`${mapping.suite}: ${mapping.title}`);
            }
          }
        } else {
          const runnable = suitesOf(m).filter((s) => !skipped(s));
          for (const suite of runnable) {
            if (run(suite).status !== 0) {
              by.push(suite);
              break;
            }
          }
          skippedMappings.push(...suitesOf(m).filter((s) => skipped(s)).map((s) => `${s} (set ${skipped(s)})`));
        }
        writeFileSync(path, source);
        if (emptyMappings.length) {
          status = 'NO TEST SELECTED';
          tally.misapplied += 1;
        } else if (by.length) {
          status = 'killed';
          tally.killed += 1;
        } else if (skippedMappings.length) {
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
      const evidence = [
        by.length ? `killed by: ${by.join(' | ')}` : '',
        emptyMappings.length ? emptyMappings.join(' | ') : '',
        skippedMappings.length ? `skipped: ${skippedMappings.join(' | ')}` : '',
      ].filter(Boolean).join(' | ');
      console.log(`${m.id.padEnd(8)} ${status.padEnd(16)} ${evidence} ${m.name}`);
    }
    console.log(`\n${selected.length} mutants: ${tally.killed} killed, ${tally.equivalent} equivalent, ${tally.survived} survived, ${tally.misapplied} misapplied, ${tally.skipped} skipped`);
    if (tally.survived || tally.misapplied) exitCode = 1;
  }
} finally {
  rmSync(scratchParent, { recursive: true, force: true });
}

for (const [file, hash] of originals) {
  if (sha(join(root, file)) !== hash) {
    console.error(`ERROR: ${file} changed on disk during the run`);
    exitCode = 1;
  }
}
console.log('original files untouched: yes');
process.exit(exitCode);
