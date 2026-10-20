import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  executionStatus, extractTests, globToRegExp, idFamily, idsIn, isMain, levelOf, parseArgs, parseCsv, parseTables, testIdOf, timezoneStatus, toCsv, worst,
} from './lib.mjs';

test('parseArgs reads flags, values, repeats and positionals', () => {
  const { flags, positional } = parseArgs(['--scope', 'a.json', '--skip=mutation', '--record', '--tz', 'UTC', '--tz', 'SGT', 'file']);
  assert.equal(flags.scope, 'a.json');
  assert.equal(flags.skip, 'mutation');
  assert.equal(flags.record, true);
  assert.deepEqual(flags.tz, ['UTC', 'SGT']);
  assert.deepEqual(positional, ['file']);
});

test('globToRegExp: * stays in a folder, ** crosses folders', () => {
  assert.ok(globToRegExp('backend/src/*.ts').test('backend/src/a.ts'));
  assert.ok(!globToRegExp('backend/src/*.ts').test('backend/src/x/a.ts'));
  assert.ok(globToRegExp('backend/**/a.ts').test('backend/src/x/a.ts'));
  assert.ok(globToRegExp('backend/**/a.ts').test('backend/a.ts'));
  assert.ok(!globToRegExp('a.ts').test('bts'));
});

test('idsIn finds registry-style ids and not fixtures with three digits', () => {
  assert.deepEqual(idsIn('CONFIRM-EVENT-04-B (B, deterministic) EVT-201 EVENT-UPDATE-04-SEC-2 SPM-135 TR-13'), ['CONFIRM-EVENT-04-B', 'EVENT-UPDATE-04-SEC-2', 'TR-13']);
  assert.equal(idFamily('CONFIRM-EVENT-04-B'), 'CONFIRM-EVENT');
  assert.equal(idFamily('SAFETY-RESET-UPDATE-01'), 'SAFETY-RESET-UPDATE');
});

test('levelOf maps file names to runners', () => {
  assert.equal(levelOf('a.e2e-spec.ts'), 'Integration');
  assert.equal(levelOf('a.spec.ts'), 'Unit');
  assert.equal(levelOf('a.test.tsx'), 'Frontend');
  assert.equal(levelOf('a.playwright.spec.ts'), 'E2E');
});

test('parseTables normalises headers and tracks the heading', () => {
  const tables = parseTables('## SPM-135\n\n| AC | Not Applicable |\n|---|---|\n| AC1 | x |\n| AC2 | y |\n');
  assert.equal(tables.length, 1);
  assert.equal(tables[0].heading, 'SPM-135');
  assert.deepEqual(tables[0].header, ['ac', 'not_applicable']);
  assert.deepEqual(tables[0].rows.map((r) => r.ac), ['AC1', 'AC2']);
});

test('parseTables recognises SPM tier headings and tables with Windows CRLF endings', () => {
  const tables = parseTables('## SPM-118\r\n\r\n| AC | Happy |\r\n|---|---|\r\n| AC1 | PRESENT (SPM118-AC1-01-UI) |\r\n');
  assert.equal(tables[0].heading, 'SPM-118');
  assert.equal(tables[0].rows[0].ac, 'AC1');
});

test('isMain resolves Windows-style entry paths against file URLs', () => {
  const path = process.platform === 'win32' ? 'C:\\IS212-G5-T2\\ai\\scripts\\test-workflow\\check-spec.mjs' : '/repo/ai/scripts/test-workflow/check-spec.mjs';
  const url = new URL(`file:///${path.replaceAll('\\', '/')}`).href;
  assert.equal(isMain(url, path), true);
  assert.equal(isMain(url, `${path}.other`), false);
});

test('csv round trip keeps commas, quotes and newlines', () => {
  const rows = [{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2' }];
  assert.deepEqual(parseCsv(toCsv(['a', 'b', 'c'], rows)), rows);
});

const SAMPLE = `
describe('CONFIRM-EVENT-01-C: authorisation', () => {
  /** Another coordinator is refused. */
  it('refuses %s with 403', () => {});

  // plain comment
  it.each([
    ['a', 1],
  ])('CONFIRM-EVENT-06-A: %s', () => {});

  it.skip('SAFETY-STALE-01: skipped', () => {});
});
describe('other', () => {
  it('has no id', () => {});
});
`;

test('extractTests finds call sites, titles, comments and describes', () => {
  const tests = extractTests(SAMPLE);
  assert.deepEqual(tests.map((t) => t.title), ['refuses %s with 403', 'CONFIRM-EVENT-06-A: %s', 'SAFETY-STALE-01: skipped', 'has no id']);
  assert.deepEqual(tests.map((t) => t.kind), ['it', 'each', 'it', 'it']);
  assert.equal(tests[0].commentPresent, true);
  assert.match(tests[0].comment, /Another coordinator/);
  assert.equal(tests[2].modifier, 'skip');
  assert.equal(tests[3].commentPresent, false);
});

test('testIdOf: own title, then enclosing describe, ignoring non-test families', () => {
  const tests = extractTests(SAMPLE);
  assert.equal(testIdOf(tests[1]), 'CONFIRM-EVENT-06-A');
  assert.equal(testIdOf(tests[0]), 'CONFIRM-EVENT-01-C');
  assert.equal(testIdOf(tests[3]), '');
  const labelled = { title: 'TR-05: a block', comment: '', describes: [] };
  assert.equal(testIdOf(labelled), 'TR-05');
  assert.equal(testIdOf(labelled, new Set(['TR'])), '');
});

test('worst: BLOCKED beats UNABLE_TO_VERIFY beats PASS', () => {
  assert.equal(worst(['PASS', 'UNABLE_TO_VERIFY']), 'UNABLE_TO_VERIFY');
  assert.equal(worst(['PASS', 'BLOCKED', 'UNABLE_TO_VERIFY']), 'BLOCKED');
  assert.equal(worst(['PASS']), 'PASS');
});

test('executionStatus blocks a suite where setup failed and every test was skipped', () => {
  assert.equal(executionStatus([{ ran: true, failed: 0, skipped: 22 }]), 'BLOCKED');
  assert.equal(executionStatus([{ ran: true, failed: 0, skipped: 0 }]), 'PASS');
  assert.equal(executionStatus([{ ran: false, failed: 0, skipped: 0 }]), 'UNABLE_TO_VERIFY');
});

test('timezoneStatus blocks skipped tests and distinguishes a zone that did not run', () => {
  assert.equal(timezoneStatus({ UTC: { total: 22, failed: 0, skipped: 22, notRun: 0 } }), 'BLOCKED');
  assert.equal(timezoneStatus({ UTC: { total: 22, failed: 0, skipped: 0, notRun: 0 } }), 'PASS');
  assert.equal(timezoneStatus({ UTC: { total: 0, failed: 0, skipped: 0, notRun: 1 } }), 'UNABLE_TO_VERIFY');
});

test('scopedTests keeps a test whose own comment carries the story prefix, even when its title does not', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { scopedTests } = await import('./lib.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'scoped-'));
  const file = join(dir, 'x.spec.ts');
  writeFileSync(file, [
    "describe('other', () => {",
    "  /** EVE-DRF-01-A: a draft saves with incomplete fields. */",
    "  it('saves an incomplete request', () => {});",
    "  // EVE-DRF-02-A line tag above the test",
    "  it('prefills a request', () => {});",
    "  it('TRACK-EVENT-STATUS-01-A unrelated', () => {});",
    '});',
  ].join('\n'));
  const titles = scopedTests({ file, titleMatch: 'EVE-DRF' }).map((test) => test.title);
  assert.deepEqual(titles, ['saves an incomplete request', 'prefills a request']);
});
