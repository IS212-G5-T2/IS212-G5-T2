import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expandLines, ignoreCommentLines, mergeEntry, summarise, totals, withoutLines } from './coverage-scope.mjs';

const loc = (line, col = 0, endLine = line, endCol = 10) => ({ start: { line, column: col }, end: { line: endLine, column: endCol } });

/** An istanbul-style entry: statements on lines 1..n with the given counts, one function, one two-way branch. */
const entry = (counts, { fn = 1, branch = [1, 0] } = {}) => ({
  statementMap: Object.fromEntries(counts.map((_, i) => [String(i), loc(i + 1)])),
  s: Object.fromEntries(counts.map((c, i) => [String(i), c])),
  fnMap: { 0: { name: 'f', loc: loc(1) } },
  f: { 0: fn },
  branchMap: { 0: { type: 'if', loc: loc(2), locations: [loc(2), loc(3)] } },
  b: { 0: branch },
});

const fresh = () => ({ statements: {}, functions: {}, branches: {} });

test('a statement counts as covered when any run executed it', () => {
  const merged = fresh();
  mergeEntry(merged, entry([1, 0, 0]), 'unit');
  mergeEntry(merged, entry([0, 1, 0], { fn: 0, branch: [0, 1] }), 'e2e');
  const summary = summarise(merged, ['unit'], ['e2e']);
  assert.deepEqual(summary.statements, { covered: 2, total: 3 });
  assert.deepEqual(summary.uncoveredLines, [3]);
  assert.deepEqual(summary.functions, { covered: 1, total: 1 });
  assert.deepEqual(summary.branches, { covered: 2, total: 2 });
});

test('lines covered only by the e2e run are reported separately', () => {
  const merged = fresh();
  mergeEntry(merged, entry([1, 0]), 'unit');
  mergeEntry(merged, entry([0, 4]), 'e2e');
  const summary = summarise(merged, ['unit'], ['e2e']);
  assert.deepEqual(summary.e2eOnlyLines, [2]);
  assert.deepEqual(summary.uncoveredLines, []);
});

test('without an e2e run nothing is classified as e2e-only', () => {
  const merged = fresh();
  mergeEntry(merged, entry([1, 1]), 'unit');
  assert.deepEqual(summarise(merged, ['unit'], []).e2eOnlyLines, []);
});

test('uncovered branch lines are listed even when the line itself is covered', () => {
  const merged = fresh();
  mergeEntry(merged, entry([1, 1, 1]), 'unit');
  assert.deepEqual(summarise(merged, ['unit'], []).uncoveredBranchLines, [3]);
});

test('expandLines reads single lines and ranges', () => {
  assert.deepEqual([...expandLines('121, 161, 383-385')].sort((a, b) => a - b), [121, 161, 383, 384, 385]);
  assert.equal(expandLines('').size, 0);
});

test('totals add covered and total counts and round the percentage', () => {
  const files = [{ lines: { covered: 1, total: 3 } }, { lines: { covered: 3, total: 3 } }];
  assert.deepEqual(totals(files, 'lines'), { covered: 4, total: 6, pct: 66.67 });
  assert.equal(totals([], 'lines').pct, 100);
});

test('ignoreCommentLines finds v8, istanbul and c8 ignore comments only', () => {
  const text = ['const a = 1;', '/* v8 ignore start -- reason */', '// istanbul ignore next', '/* c8 ignore stop */', '// a comment about ignoring v8 things', 'const ignore = 2;'].join('\n');
  assert.deepEqual(ignoreCommentLines(text), [2, 3, 4]);
});

test('EXCLUDED lines leave the statement, branch, function and line totals', () => {
  // Line 3 holds an uncovered statement and the uncovered arm of the branch; the function is on line 1.
  const merged = fresh();
  mergeEntry(merged, entry([1, 0, 0]), 'unit');
  const before = summarise(merged, ['unit'], []);
  assert.deepEqual(before.statements, { covered: 1, total: 3 });
  assert.deepEqual(before.branches, { covered: 1, total: 2 });
  const after = summarise(withoutLines(merged, new Set([3])), ['unit'], []);
  assert.deepEqual(after.statements, { covered: 1, total: 2 });
  assert.deepEqual(after.branches, { covered: 1, total: 1 });
  assert.deepEqual(after.functions, { covered: 1, total: 1 });
  assert.deepEqual(after.lines, { covered: 1, total: 2 });
  assert.deepEqual(after.uncoveredLines, [2]);
  assert.deepEqual(after.uncoveredBranchLines, []);
});

test('withoutLines with no excluded lines returns the merged data unchanged', () => {
  const merged = fresh();
  mergeEntry(merged, entry([1, 0]), 'unit');
  assert.equal(withoutLines(merged, new Set()), merged);
});
