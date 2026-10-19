import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLog, reconcile, suiteLinks } from './reconcile-mutation.mjs';

const SUITES = new Set(['unit', 'e2e', 'removal', 'service']);
const defs = [
  { id: 'A1', name: 'a real mutant', file: 'x.ts' },
  { id: 'E1', name: 'unreachable (equivalent: the database CHECK allows only these values)', file: 'x.ts', equivalent: true },
];
const log = (lines) => `baseline unit: green\nbaseline e2e: green\n${lines.join('\n')}\n\n2 mutants: ...\n`;

test('parseLog reads results, killing suites and baselines', () => {
  const parsed = parseLog('\x1b[32mbaseline unit: green\x1b[0m\nA1       killed     e2e | unit a real mutant\nE1       equivalent  unreachable\n', SUITES);
  assert.deepEqual(parsed.baselines, [{ suite: 'unit', state: 'green' }]);
  assert.deepEqual(parsed.results.get('A1'), { status: 'killed', killers: ['e2e', 'unit'] });
  assert.deepEqual(parsed.results.get('E1'), { status: 'equivalent', killers: [] });
});

test('parseLog reads the mutation runner killed by syntax with CRLF output', () => {
  const parsed = parseLog('baseline service: green\r\nA1 killed           killed by: service: SPM118-AC2-04-UNIT proves it works mutation title\r\n', SUITES);
  assert.deepEqual(parsed.results.get('A1'), { status: 'killed', killers: ['service'] });
});

test('parseLog normalizes raw runner status casing and records misapplied results', () => {
  const parsed = parseLog('baseline e2e: green\r\nBE-57-23 SURVIVED      concurrent mutant\r\nBE-57-05 MISAPPLIED   request list edit did not apply\r\n', SUITES);
  assert.equal(parsed.results.get('BE-57-23').status, 'survived');
  assert.equal(parsed.results.get('BE-57-05').status, 'misapplied');
});

test('a clean run reconciles with a score and no findings', () => {
  const out = reconcile('t', defs, parseLog(log(['A1       killed     unit a real mutant', 'E1       equivalent  unreachable']), SUITES));
  assert.deepEqual(out.findings, []);
  assert.equal(out.counts.killed, 1);
  assert.equal(out.counts.equivalent, 1);
});

test('a mutant flagged equivalent that a suite kills is an error (the M11 mistake)', () => {
  const out = reconcile('t', defs, parseLog(log(['A1       killed     unit a real mutant', 'E1       killed     e2e unreachable']), SUITES));
  assert.match(out.findings.join('\n'), /E1: flagged equivalent but killed by e2e/);
});

test('a survivor, a misapplied mutant and a missing result each block', () => {
  const three = [...defs, { id: 'S1', name: 's' }];
  const out = reconcile('t', three, parseLog(log(['A1       survived   unit a real mutant', 'E1       misapplied  x']), SUITES));
  const text = out.findings.join('\n');
  assert.match(text, /A1: SURVIVED/);
  assert.match(text, /E1: MISAPPLIED/);
  assert.match(text, /S1: defined but the log has no result/);
});

test('an equivalent result needs a written argument and the flag', () => {
  const bare = [{ id: 'E2', name: 'no argument', equivalent: true }, { id: 'E3', name: 'argued (equivalent: the guard cannot fail)' }];
  const out = reconcile('t', bare, parseLog(log(['E2       equivalent  x', 'E3       equivalent  y']), SUITES));
  const text = out.findings.join('\n');
  assert.match(text, /E2: equivalent without a written argument/);
  assert.match(text, /E3: reported equivalent but not flagged/);
});

test('a baseline that is not green means no result can be trusted; a skipped mutant is unable to verify', () => {
  const parsed = parseLog('baseline unit: NOT GREEN\nA1       skipped    needs DATABASE_URL\n', SUITES);
  const out = reconcile('t', [defs[0]], parsed);
  assert.match(out.findings.join('\n'), /baseline unit is not green/);
  assert.equal(out.unable, true);
});

test('suiteLinks maps each suite to its test files and non-equivalent mutants', () => {
  const module = {
    SUITES: { removal: { args: ['run', '--config', './vitest.config.e2e.ts', 'test/a.e2e-spec.ts', 'test/b.e2e-spec.ts'] }, unit: { args: ['run', 'src/x.spec.ts'] } },
    MUTANTS: [{ id: 'R1', suites: ['removal'] }, { id: 'R2', suites: ['removal', 'unit'] }, { id: 'R3', suites: ['removal'], equivalent: true }],
  };
  const links = suiteLinks({ id: 'be', cwd: 'backend', export: 'MUTANTS' }, module);
  assert.deepEqual(links.find((l) => l.suite === 'removal'), { entry: 'be', suite: 'removal', files: ['backend/test/a.e2e-spec.ts', 'backend/test/b.e2e-spec.ts'], mutants: ['R1', 'R2'] });
  assert.deepEqual(links.find((l) => l.suite === 'unit').mutants, ['R2']);
});

test('reads the killing suite from the runner format "killed by: <suite> <mutant name>"', () => {
  const SUITES = new Set(['unit', 'e2e', 'assignE2e']);
  const parsed = parseLog('baseline e2e: green\nM2       killed           killed by: e2e owner filter removed from the organiser list (01-A)\nM3e      killed           killed by: assignE2e the 404 owner branch disabled only\n', SUITES);
  assert.deepEqual(parsed.results.get('M2').killers, ['e2e']);
  assert.deepEqual(parsed.results.get('M3e').killers, ['assignE2e']);
});
