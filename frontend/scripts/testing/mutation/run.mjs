// Fault-injection (mutation) check, as described in the test-code-generation guide, section 7.
// It copies this component to a scratch directory, applies ONE mutant at a time to the copy, runs the
// mutant's suites there, and reports which mutants the suites killed. The original tree is never edited
// (the script hashes the mutated files before and after to prove it).
//
//   node scripts/testing/mutation/run.mjs                 # every mutant in spm120.mutants.mjs
//   node scripts/testing/mutation/run.mjs --only M22,M34  # a subset
//   node scripts/testing/mutation/run.mjs --suite e2e     # use one suite only (shows what that suite alone catches)
//   node scripts/testing/mutation/run.mjs --list          # show the mutants and exit
//
// Exit code: 0 when every mutant is killed (or listed as equivalent), 1 when a non-equivalent mutant
// survives or an edit does not apply exactly once, 2 when a baseline suite is not green.
// Each component keeps a local runner with the same mutation-selection and result-reporting contract.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const { SUITES, MUTANTS } = await import(pathToFileURL(join(here, flag('--mutants') ?? 'spm120.mutants.mjs')).href);
const only = flag('--only')?.split(',');
const suiteOnly = flag('--suite');
// --measure-kills <file>: run every suite of each mutant with the JSON reporter and save the failing tests per mutant.
const measureOut = flag('--measure-kills') && resolve(flag('--measure-kills'));
const suitesOf = (m) => (suiteOnly ? m.suites.filter((s) => s === suiteOnly) : m.suites);
const selected = MUTANTS.filter((m) => (!only || only.includes(m.id)) && suitesOf(m).length);

const mappingForKill = (kill, mutant) => {
  if (!kill || typeof kill.file !== 'string' || typeof kill.title !== 'string') return undefined;
  const suite = mutant.suites.find((candidate) =>
    (SUITES[candidate]?.args ?? []).some((arg) =>
      arg === kill.file || kill.file.startsWith(`${arg.replace(/\/$/, '')}/`),
    ),
  );
  return suite ? { suite, file: kill.file, title: kill.title } : undefined;
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
    mappingErrors.push(`${mutant.id}: one or more kill labels could not be resolved to a suite, file, and exact test title`);
    continue;
  }
  if (mappings && !mappings.some((mapping) => suitesOf(mutant).includes(mapping.suite)))
    mappingErrors.push(`${mutant.id}: no exact test mapping targets its selected suites`);
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

const scratch = mkdtempSync(join(tmpdir(), 'spm120-mutation-'));
cpSync(root, scratch, {
  recursive: true,
  filter: (src) => !/(^|[\\/])(node_modules|dist|coverage|test-results)([\\/]|$)/.test(relative(root, src)),
});
symlinkSync(
  join(root, 'node_modules'),
  join(scratch, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir',
);

const run = (suite, mapping, extra = []) =>
  spawnSync(process.execPath, [
    join(scratch, 'node_modules/vitest/vitest.mjs'),
    ...SUITES[suite].args,
    ...(mapping ? ['--reporter=verbose', '--testNamePattern', mapping.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')] : []),
    ...extra,
  ], {
    cwd: scratch,
    env: { ...process.env, ...SUITES[suite].env, CI: '1' },
    encoding: 'utf8',
    timeout: 180_000,
  });
// Failing tests of one vitest JSON report, as repository-relative file and title.
const failingTests = (jsonFile) => {
  if (!existsSync(jsonFile)) return [];
  const data = JSON.parse(readFileSync(jsonFile, 'utf8'));
  const scratchName = basename(scratch);
  return (data.testResults ?? []).flatMap((result) => {
    const rel = result.name.split(`/${scratchName}/`).at(-1);
    return (result.assertionResults ?? []).filter((test) => test.status === 'failed').map((test) => ({ file: `frontend/${rel}`, title: test.title }));
  });
};
const killsOut = {};
const skipped = (suite) => SUITES[suite].needsEnv?.find((name) => !process.env[name]);
const outputOf = (result) => `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const hasExecutedTests = (result) => /\bTests\s+\d+\s+(?:passed|failed)\b/i.test(outputOf(result));

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
    const green = result.status === 0 && hasExecutedTests(result);
    console.log(`baseline ${suite}: ${green ? 'green' : result.status === 0 ? 'NOT GREEN (zero tests executed)' : 'NOT GREEN'}`);
    if (!green) {
      console.log(outputOf(result).split('\n').slice(-25).join('\n'));
      exitCode = 2;
    }
  }
  if (exitCode === 0) {
    const tally = { killed: 0, survived: 0, equivalent: 0, misapplied: 0, skipped: 0, suiteError: 0 };
    for (const m of selected) {
      const path = join(scratch, m.file);
      const source = readFileSync(path, 'utf8');
      let mutated = source;
      let applied = true;
      for (const [from, to] of m.edits) {
        // Mutant definitions use repository LF newlines, while a Windows
        // checkout can materialise the same source with CRLF newlines.
        const match = mutated.includes(from) ? from : from.replace(/\n/g, '\r\n');
        const replacement = match === from ? to : to.replace(/\n/g, '\r\n');
        if (mutated.split(match).length !== 2) applied = false;
        mutated = mutated.replace(match, () => replacement);
      }
      let status;
      let by = [];
      const skippedMappings = [];
      const emptyMappings = [];
      // Suites that failed without a failed assertion (beforeAll/import error, crash, no report): SUITE-ERROR, not a kill.
      const suiteErrors = [];
      if (!applied) {
        status = 'MISAPPLIED';
        tally.misapplied += 1;
      } else {
        writeFileSync(path, mutated);
        const mappings = measureOut ? undefined : mappingsOf(m)?.filter((mapping) => suitesOf(m).includes(mapping.suite));
        if (mappings?.length) {
          for (const mapping of mappings) {
            const missing = skipped(mapping.suite);
            if (missing) {
              skippedMappings.push(`${mapping.suite} (set ${missing}): ${mapping.title}`);
              continue;
            }
            const result = run(mapping.suite, mapping);
            if (!outputOf(result).includes(mapping.title)) {
              emptyMappings.push(`${mapping.suite}: zero tests selected for ${mapping.title}`);
            } else if (result.status !== 0) {
              by.push(`${mapping.suite}: ${mapping.title}`);
            }
          }
        } else {
          const runnable = suitesOf(m).filter((s) => !skipped(s));
          for (const suite of runnable) {
            if (measureOut) {
              const jsonFile = join(scratch, `vitest-${suite}.json`);
              const result = run(suite, undefined, ['--reporter=json', `--outputFile=${jsonFile}`]);
              const failed = failingTests(jsonFile);
              if (failed.length) by.push(suite);
              else if (result.status !== 0) suiteErrors.push(suite);
              killsOut[m.id] = [...(killsOut[m.id] ?? []), ...failed.map((test) => ({ suite, ...test }))];
            } else if (run(suite).status !== 0) {
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
        } else if (suiteErrors.length) {
          status = 'SUITE-ERROR';
          tally.suiteError += 1;
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
        suiteErrors.length ? `suite-error (no failed assertion): ${suiteErrors.join(' | ')}` : '',
        skippedMappings.length ? `skipped: ${skippedMappings.join(' | ')}` : '',
      ].filter(Boolean).join(' | ');
      console.log(`${m.id.padEnd(8)} ${status.padEnd(16)} ${evidence} ${m.name}`);
    }
    console.log(`\n${selected.length} mutants: ${tally.killed} killed, ${tally.equivalent} equivalent, ${tally.survived} survived, ${tally.misapplied} misapplied, ${tally.skipped} skipped, ${tally.suiteError} suite-error`);
    if (measureOut) {
      for (const m of selected) killsOut[m.id] ??= [];
      writeFileSync(measureOut, JSON.stringify(killsOut, null, 2));
    }
    if (tally.survived || tally.misapplied || tally.suiteError) exitCode = 1;
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
