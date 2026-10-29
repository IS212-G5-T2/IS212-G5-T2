import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkConflicts, checkTiers, parseCell } from './check-spec.mjs';

const conflict = (extra) => ({ id: 'SC-1', story: 'S', subject: 'x', decision: 'd', status: 'DECIDED', tag: '', confirmed_by: 'yes', ...extra });

test('an OPEN conflict blocks', () => {
  const result = checkConflicts([conflict({ status: 'OPEN', decision: '' })], 'S');
  assert.equal(result.counts.open, 1);
  assert.match(result.findings.join('\n'), /OPEN/);
});

test('DECIDED needs a decision; ASSUMED needs a decision and a tag', () => {
  const text = checkConflicts([conflict({ decision: '' }), conflict({ id: 'SC-2', status: 'ASSUMED', tag: '' })], 'S').findings.join('\n');
  assert.match(text, /SC-1: DECIDED without a written decision/);
  assert.match(text, /SC-2: ASSUMED without the tag/);
});

test('a decision awaiting confirmation is a gap, not a block', () => {
  const result = checkConflicts([conflict({ confirmed_by: 'pending (PO)' })], 'S');
  assert.deepEqual(result.findings, []);
  assert.equal(result.counts.pendingConfirmation, 1);
  assert.equal(result.gaps.length, 1);
});

test('conflicts of other stories are ignored', () => {
  assert.deepEqual(checkConflicts([conflict({ story: 'OTHER', status: 'OPEN' })], 'S').findings, []);
});

test('parseCell accepts the three forms and rejects blanks and unexplained cells', () => {
  assert.deepEqual(parseCell('PRESENT (A-01, B-02)'), { kind: 'PRESENT', ids: ['A-01', 'B-02'] });
  assert.deepEqual(parseCell('N/A (no configurable parameter)'), { kind: 'N/A', detail: 'no configurable parameter' });
  assert.deepEqual(parseCell('MISSING (ids not registered yet)'), { kind: 'MISSING', detail: 'ids not registered yet' });
  assert.equal(parseCell('').error, 'blank');
  assert.equal(parseCell('N/A').error, 'N/A without a reason');
  assert.equal(parseCell('MISSING ()').error, 'MISSING without a reason');
  assert.equal(parseCell('PRESENT ()').error, 'PRESENT without test ids');
  assert.match(parseCell('maybe').error, /cannot read/);
});

const TIERS = ['happy', 'sad', 'boundary', 'interaction', 'configuration', 'state', 'isolation', 'security', 'concurrency'];
const full = (overrides = {}) => ({ ac: 'AC1', ...Object.fromEntries(TIERS.map((t) => [t, 'N/A (not applicable here)'])), ...overrides });

test('tiers: a PRESENT id must be registered, MISSING becomes a gap, a blank cell blocks', () => {
  const table = { rows: [full({ happy: 'PRESENT (A-01)', sad: 'PRESENT (NOT-REG-01)', boundary: 'MISSING (needs a test)', state: '' })] };
  const result = checkTiers(table, new Set(['A-01']));
  const text = result.findings.join('\n');
  assert.match(text, /sad: NOT-REG-01 is not in the registry/);
  assert.match(text, /state: blank/);
  assert.equal(result.cells.missing, 1);
  assert.equal(result.gaps[0].type, 'tier-missing');
  assert.equal(result.cells.present, 2);
});

test('tiers: a fully valid row has no findings', () => {
  assert.deepEqual(checkTiers({ rows: [full({ happy: 'PRESENT (A-01)' })] }, new Set(['A-01'])).findings, []);
});

test('conflictRows reads every conflict table, not only the first (the register is split by headings and notes)', async () => {
  const { conflictRows } = await import('./check-spec.mjs');
  const markdown = [
    '# Register',
    '',
    '| ID | Story | Subject | Decision | Status | Tag | Confirmed by | Follow-up |',
    '|---|---|---|---|---|---|---|---|',
    '| SC-A | S1 | a | d | DECIDED | - | x | - |',
    '',
    '## Second section',
    '',
    'A note paragraph that ends the first table.',
    '',
    '| ID | Story | Subject | Decision | Status | Tag | Confirmed by | Follow-up |',
    '|---|---|---|---|---|---|---|---|',
    '| SC-B | S2 | b | - | OPEN | - | - | - |',
  ].join('\n');
  const rows = conflictRows(markdown);
  assert.deepEqual(rows.map((row) => row.id), ['SC-A', 'SC-B']);
  assert.equal(checkConflicts(rows, 'S2').counts.open, 1);
});
