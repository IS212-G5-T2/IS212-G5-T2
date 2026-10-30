import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REPO_ROOT, executionStatus, extractTests, globToRegExp, idFamily, idsIn, isMain, levelOf, missingFromResults, parseArgs, parseCsv, parseTables, playwrightToVitest, testIdOf, timezoneStatus, toCsv, worst,
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

test('extractTests reads an it.each title on the line below the table, and never borrows the next test title', () => {
  const tests = extractTests(`
describe('EVE-CRE-05-E', () => {
  it.each([
    ['a', 1],
  ])(
    'EVE-CRE-05-E rejects %s',
    () => {},
  );
  it.each([
    ['b', 2],
  ])(
    'EVE-CRE-05-F rejects %s',
    () => {},
  );
  it.each([
    ['c', 3],
  ])('EVE-CRE-05-G rejects %s', () => {});
  it.each([1, 2])(
    'EVE-CRE-05-H, two rows',
    () => {},
  );
  it('EVE-CRE-05-Z after a title-less table', () => {});
});
`);
  assert.deepEqual(tests.map((t) => t.title), [
    'EVE-CRE-05-E rejects %s',
    'EVE-CRE-05-F rejects %s',
    'EVE-CRE-05-G rejects %s',
    'EVE-CRE-05-H, two rows',
    'EVE-CRE-05-Z after a title-less table',
  ]);
});

test('extractTests does not take the title of a later test for an it.each without a title', () => {
  const tests = extractTests(`
  it.each([
    ['a', 1],
  ])(
    () => {},
  );
  it('EVE-CRE-99-A the next test', () => {});
`);
  assert.deepEqual(tests.map((t) => t.title), ['EVE-CRE-99-A the next test']);
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

test('scopedTests keeps a test that carries a story registry id even when its title and comment do not match the titleMatch', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { scopedTests } = await import('./lib.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'scoped-registry-'));
  const file = join(dir, 'calendar.test.tsx');
  writeFileSync(file, [
    "describe('calendar', () => {",
    '  /** VEN-AVL-SUP-04 (SPM-51): an empty initialDate keeps the default date. */',
    "  it('keeps the default calendar date when initialDate is empty', () => {});",
    "  it('SPM54-COVERAGE-ONLY-NO-IDS renders the grid', () => {});",
    "  it('VEN-OTHER-01-A belongs to another story', () => {});",
    '});',
  ].join('\n'));
  const storyIds = new Set(['VEN-AVL-SUP-04']);
  const titles = scopedTests({ file, titleMatch: 'SPM54-COVERAGE-ONLY-NO-IDS' }, storyIds).map((test) => test.title);
  assert.deepEqual(titles, ['keeps the default calendar date when initialDate is empty', 'SPM54-COVERAGE-ONLY-NO-IDS renders the grid']);
  const without = scopedTests({ file, titleMatch: 'SPM54-COVERAGE-ONLY-NO-IDS' }).map((test) => test.title);
  assert.deepEqual(without, ['SPM54-COVERAGE-ONLY-NO-IDS renders the grid']);
});

test('missingFromResults lists scope files that the runner did not report', () => {
  const data = { testResults: [{ name: `${REPO_ROOT}/frontend/src/a.test.tsx` }] };
  assert.deepEqual(missingFromResults(['frontend/src/a.test.tsx', 'frontend/src/b.playwright.spec.ts'], data), ['frontend/src/b.playwright.spec.ts']);
  assert.deepEqual(missingFromResults(['frontend\\src\\a.test.tsx'], data), []); // Windows join() separators
  assert.deepEqual(missingFromResults(['x.test.ts'], undefined), ['x.test.ts']);
  assert.deepEqual(missingFromResults([], data), []);
});

test('playwrightToVitest converts a Playwright report to the vitest json shape', () => {
  const spec = (title, status) => ({ title, file: 'components/n/B.playwright.spec.ts', tests: [{ status }] });
  const report = {
    stats: { startTime: '2026-10-30T00:00:00.000Z', duration: 1500 },
    suites: [{ file: 'components/n/B.playwright.spec.ts', specs: [spec('P-01 a', 'expected')], suites: [{ specs: [spec('P-02 b', 'unexpected'), spec('P-03 c', 'skipped'), spec('P-04 d', 'flaky')] }] }],
  };
  const out = playwrightToVitest(report, ['frontend/src/components/n/B.playwright.spec.ts']);
  assert.equal(out.numTotalTests, 4);
  assert.equal(out.numPassedTests, 1);
  assert.equal(out.numFailedTests, 2);
  assert.equal(out.numPendingTests, 1);
  assert.equal(out.startTime, Date.parse('2026-10-30T00:00:00.000Z'));
  assert.equal(out.testResults.length, 1);
  assert.equal(out.testResults[0].name, `${REPO_ROOT}/frontend/src/components/n/B.playwright.spec.ts`);
  assert.equal(out.testResults[0].endTime - out.startTime, 1500);
  assert.deepEqual(out.testResults[0].assertionResults.map((r) => r.status), ['passed', 'failed', 'pending', 'failed']);
  assert.deepEqual(missingFromResults(['frontend/src/components/n/B.playwright.spec.ts'], out), []);
  assert.deepEqual(missingFromResults(['frontend\\src\\components\\n\\B.playwright.spec.ts'], playwrightToVitest(report, ['frontend\\src\\components\\n\\B.playwright.spec.ts'])), []);
  assert.equal(playwrightToVitest({}, []).numTotalTests, 0);
});
