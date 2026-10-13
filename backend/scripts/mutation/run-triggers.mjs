// Trigger (SQL) fault-injection check for the SPM-135 safety-reset triggers, as described in the
// test-code-generation guide, section 7. It is opt-in: a separate script, not part of run.mjs.
//
// For each mutant it:
//   1. copies database/postgresql/init into a temp directory and applies the mutant's edits to the COPY;
//   2. creates a fresh scratch database named spm_mutant_<random> (the shared spm_test and spm_manual are never used);
//   3. loads every init script, in filename order, into the scratch database;
//   4. runs the mutant's suites with DATABASE_URL and TEST_DATABASE_URL pointing at the scratch database;
//   5. drops the scratch database in a finally block, and removes the temp directory at the end.
// SIGINT/SIGTERM run the same cleanup (kill the running suite, DROP DATABASE ... WITH (FORCE), remove the temp directory).
// The backend tree is copied to a temp directory too (node_modules is linked), so vitest never writes into the repository.
//
//   node scripts/mutation/run-triggers.mjs                 # every trigger mutant (needs DATABASE_URL)
//   node scripts/mutation/run-triggers.mjs --only TG1,TG5  # a subset
//   node scripts/mutation/run-triggers.mjs --list          # show the mutants and exit
//
// Requirements: DATABASE_URL must point at a PostgreSQL server where the user can CREATE DATABASE (the
// CREATEDB role attribute) and DROP DATABASE it creates. 001_schema.sql runs CREATE EXTENSION pgcrypto, which
// the local superuser handles; a role without that privilege cannot load the schema.
//
// Exit code: 0 when every mutant is killed (or listed as equivalent), 1 when a non-equivalent mutant survives or
// an edit does not apply exactly once or the mutated schema fails to load, 2 when a baseline suite is not green
// or DATABASE_URL is missing.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const initDir = fileURLToPath(new URL('../../../database/postgresql/init/', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const { SUITES, TRIGGER_MUTANTS } = await import(pathToFileURL(join(here, 'spm135.triggers.mutants.mjs')).href);
const only = flag('--only')?.split(',');
const selected = TRIGGER_MUTANTS.filter((m) => !only || only.includes(m.id));

if (args.includes('--list')) {
  for (const m of selected) console.log(`${m.id.padEnd(8)} ${m.equivalent ? '[equivalent] ' : ''}${m.name}`);
  process.exit(0);
}

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const initFiles = () => readdirSync(initDir).filter((f) => f.endsWith('.sql')).sort();
const initHashes = new Map(initFiles().map((f) => [f, sha(join(initDir, f))]));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required: it names the PostgreSQL server (its database part is ignored; the admin connection uses "postgres").');
  process.exit(2);
}
const adminUrl = new URL(process.env.DATABASE_URL);
adminUrl.pathname = '/postgres';
const scratchUrlFor = (name) => {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
};

const scratch = mkdtempSync(join(tmpdir(), 'spm135-trigger-'));
const sqlDir = join(scratch, 'init');
const backendCopy = join(scratch, 'backend');
const originalSql = new Map(initFiles().map((f) => [f, readFileSync(join(initDir, f), 'utf8')]));

const createScratchDatabase = async () => {
  if (exiting) await new Promise(() => {}); // never resolves: the interrupt handler exits the process
  const name = `spm_mutant_${randomBytes(6).toString('hex')}`;
  if (!/^spm_mutant_[0-9a-f]{12}$/.test(name)) throw new Error(`unsafe scratch name ${name}`);
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  activeDatabase = name;
  return name;
};

const dropScratchDatabase = async (name) => {
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
};

// Loads the init scripts in filename order from sqlDir. Returns an error message, or undefined when all loaded.
const loadSchema = async (databaseUrl) => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const file of initFiles()) {
      try {
        await client.query(readFileSync(join(sqlDir, file), 'utf8'));
      } catch (error) {
        return `${file}: ${error.message}`;
      }
    }
    return undefined;
  } finally {
    await client.end();
  }
};

// Asynchronous so that a SIGINT/SIGTERM handler can run while a suite is in progress (spawnSync would block it).
let activeChild;
let activeDatabase;
let exiting = false;
const run = (suite, databaseUrl) =>
  new Promise((resolve) => {
    if (exiting) return; // an interrupt is in progress; the handler exits the process
    const child = spawn(process.execPath, [join(backendCopy, 'node_modules/vitest/vitest.mjs'), ...SUITES[suite].args], {
      cwd: backendCopy,
      env: { ...process.env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeChild = child;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), 300_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      activeChild = undefined;
      // An interrupted run never reports a result; the signal handler exits the process.
      if (exiting) return;
      resolve({ status: code, stdout, stderr });
    });
  });

// Shared by the SIGINT/SIGTERM handler: stops the running suite, drops the scratch database and removes the temp directory.
const interrupt = async (signal) => {
  if (exiting) return;
  exiting = true;
  activeChild?.kill('SIGKILL');
  if (activeDatabase) {
    try {
      await dropScratchDatabase(activeDatabase);
    } catch (error) {
      console.error(`could not drop ${activeDatabase}: ${error.message}`);
    }
  }
  rmSync(scratch, { recursive: true, force: true });
  console.error(`interrupted by ${signal}: scratch database and temp directory removed`);
  process.exit(signal === 'SIGINT' ? 130 : 143);
};

// Writes the init copies (with the mutant's edits applied to the copy) and reports whether every edit applied once.
const prepareCopies = (mutant) => {
  for (const [file, text] of originalSql) writeFileSync(join(sqlDir, file), text);
  if (!mutant) return true;
  const path = join(sqlDir, mutant.file);
  let mutated = originalSql.get(mutant.file);
  for (const [from, to] of mutant.edits) {
    if (mutated.split(from).length !== 2) return false;
    mutated = mutated.replace(from, () => to);
  }
  writeFileSync(path, mutated);
  return true;
};

// Runs one scenario (mutant or baseline) in its own scratch database. Returns { status, by, reason }.
const scenario = async (mutant, suites) => {
  if (!prepareCopies(mutant)) return { status: 'MISAPPLIED', by: '', reason: 'an edit did not match exactly once' };
  const name = await createScratchDatabase();
  const databaseUrl = scratchUrlFor(name);
  try {
    const loadError = await loadSchema(databaseUrl);
    if (loadError) return { status: 'MISAPPLIED', by: '', reason: `schema failed to load (${loadError})` };
    for (const suite of suites) {
      const result = await run(suite, databaseUrl);
      if (result.status !== 0) {
        // The first failing test line shows which assertion killed the mutant.
        const line = (result.stdout + result.stderr).split('\n').find((text) => /\bFAIL\b/.test(text)) ?? '';
        return { status: 'FAILED', by: suite, reason: line.trim().slice(0, 200) };
      }
    }
    return { status: 'PASSED', by: '', reason: '' };
  } finally {
    await dropScratchDatabase(name);
    activeDatabase = undefined;
  }
};

let exitCode = 0;
process.on('SIGINT', () => interrupt('SIGINT'));
process.on('SIGTERM', () => interrupt('SIGTERM'));
try {
  cpSync(root, backendCopy, {
    recursive: true,
    filter: (src) => !/(^|[\\/])(node_modules|dist|coverage|test-results)([\\/]|$)/.test(relative(root, src)),
  });
  symlinkSync(join(root, 'node_modules'), join(backendCopy, 'node_modules'));
  mkdirSync(sqlDir, { recursive: true });

  const suitesUsed = [...new Set(selected.flatMap((m) => m.suites))];
  const baseline = await scenario(undefined, suitesUsed);
  console.log(`baseline (clean init, ${suitesUsed.join(', ')}): ${baseline.status === 'PASSED' ? 'green' : 'NOT GREEN'}`);
  if (baseline.status !== 'PASSED') {
    console.log(`baseline failed in suite ${baseline.by || '(load)'}: ${baseline.reason}`);
    exitCode = 2;
  } else {
    const tally = { killed: 0, survived: 0, equivalent: 0, misapplied: 0 };
    for (const m of selected) {
      const result = await scenario(m, m.suites);
      let status;
      if (result.status === 'MISAPPLIED') {
        status = 'MISAPPLIED';
        tally.misapplied += 1;
      } else if (result.status === 'FAILED') {
        status = 'killed';
        tally.killed += 1;
      } else if (m.equivalent) {
        status = 'equivalent';
        tally.equivalent += 1;
      } else {
        status = 'SURVIVED';
        tally.survived += 1;
      }
      console.log(`${m.id.padEnd(8)} ${status.padEnd(10)} ${result.by.padEnd(18)} ${m.name}`);
      if (result.reason) console.log(`         first failing test: ${result.reason}`);
    }
    console.log(
      `\n${selected.length} trigger mutants: ${tally.killed} killed, ${tally.equivalent} equivalent, ${tally.survived} survived, ${tally.misapplied} misapplied`,
    );
    if (tally.survived || tally.misapplied) exitCode = 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

let untouched = true;
for (const [file, hash] of initHashes) {
  if (sha(join(initDir, file)) !== hash) {
    console.error(`ERROR: ${file} changed on disk during the run`);
    untouched = false;
  }
}
console.log(`database/postgresql/init untouched: ${untouched ? 'yes' : 'no'}`);
if (!untouched) exitCode ||= 1;
process.exit(exitCode);
