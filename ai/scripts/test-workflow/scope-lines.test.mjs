import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LINES_FROM, linesFromError, usesChangedLines } from './lib.mjs';
import { changedLinesFinding } from './coverage-scope.mjs';

const scope = (extra = {}) => ({ story: 'SPM-1', tests: {}, ...extra });

test('a scope without linesFrom is valid and does not use changed lines', () => {
  assert.equal(linesFromError(scope()), undefined);
  assert.equal(usesChangedLines(scope()), false);
});

test('linesFrom "changed-lines" is the allowed value and turns the changed-lines measurement on', () => {
  assert.deepEqual(LINES_FROM, ['changed-lines']);
  assert.equal(linesFromError(scope({ linesFrom: 'changed-lines' })), undefined);
  assert.equal(usesChangedLines(scope({ linesFrom: 'changed-lines' })), true);
});

test('an unknown linesFrom value is reported with the allowed values', () => {
  const problem = linesFromError(scope({ linesFrom: 'all' }));
  assert.match(problem, /unknown "linesFrom" "all"/);
  assert.match(problem, /allowed: changed-lines/);
  assert.equal(usesChangedLines(scope({ linesFrom: 'all' })), false);
});

test('a scope that uses changed lines is blocked when changed-lines.json is missing', () => {
  assert.match(changedLinesFinding(scope({ linesFrom: 'changed-lines' }), false), /changed-lines\.json is missing/);
  assert.equal(changedLinesFinding(scope({ linesFrom: 'changed-lines' }), true), undefined);
});

test('a scope without linesFrom keeps the existing behaviour when changed-lines.json is missing', () => {
  assert.equal(changedLinesFinding(scope(), false), undefined);
  assert.equal(changedLinesFinding(scope(), true), undefined);
});
