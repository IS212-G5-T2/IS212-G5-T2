import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judge, scanText } from './scan-determinism.mjs';

test('scanText finds sleeps, timers, clock and random values', () => {
  const hits = scanText([
    'await sleep(10);',
    'setTimeout(done, 5);',
    'const t = Date.now();',
    'const d = new Date();',
    'const r = Math.random();',
    'const id = randomUUID();',
  ].join('\n'));
  assert.deepEqual(hits.map((h) => h.pattern), ['sleep', 'setTimeout', 'Date.now', 'new-Date', 'Math.random', 'random-id']);
});

test('scanText ignores comments and a fixed Date', () => {
  const hits = scanText(['// setTimeout in a comment', '/* Date.now() in a block', 'still a comment Math.random() */', 'const d = new Date("2026-10-13T09:00:00Z");'].join('\n'));
  assert.deepEqual(hits, []);
});

test('scanText flags a loop that waits as a poll-loop', () => {
  const hits = scanText(['for (let i = 0; i < 200; i += 1) {', '  const rows = await pool.query("select 1 from pg_stat_activity");', '  await new Promise((r) => setTimeout(r, 10));', '}'].join('\n'));
  assert.deepEqual(hits.map((h) => h.pattern).sort(), ['poll-loop', 'setTimeout']);
});

const exception = (extra) => ({ id: 'DX-1', glob: 'a/*.ts', pattern: 'random-id', max: 2, reason: 'unique fixture key', cls: 'isolation-id', ...extra });
const hit = (pattern, line = 1) => ({ pattern, line, text: '' });

test('judge: an exception covers up to Max hits per file and no more', () => {
  const outcome = judge([{ file: 'a/x.ts', hits: [hit('random-id', 1), hit('random-id', 2), hit('random-id', 3)] }], [exception()]);
  assert.equal(outcome.unjustified.length, 1);
  assert.equal(outcome.unjustified[0].line, 3);
  assert.equal(outcome.used.get('DX-1'), 2);
});

test('judge: a different pattern or file is not covered', () => {
  const outcome = judge([{ file: 'a/x.ts', hits: [hit('setTimeout')] }, { file: 'b/y.ts', hits: [hit('random-id')] }], [exception()]);
  assert.equal(outcome.unjustified.length, 2);
});

test('judge: an exception without a reason or a numeric Max justifies nothing and is reported', () => {
  const outcome = judge([{ file: 'a/x.ts', hits: [hit('random-id')] }], [exception({ reason: '' }), exception({ id: 'DX-2', max: Number.NaN })]);
  assert.equal(outcome.unjustified.length, 1);
  assert.equal(outcome.invalid.length, 2);
});
