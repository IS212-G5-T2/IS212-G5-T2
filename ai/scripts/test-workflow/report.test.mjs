import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HISTORY_HEADER, historyRow, overall } from './report.mjs';

const pass = (summary = {}) => ({ status: 'PASS', summary, findings: [], gaps: [] });
const allPass = () => ({
  G1: pass({ invented: 0, orphans: 0, pendingApproval: 0 }),
  G2: pass({ conflicts: { open: 0, decided: 1, pendingConfirmation: 0 }, tierCells: { present: 10, na: 5, missing: 0 } }),
  G3: pass({ oracle: { SPEC: 1, DERIVED: 0, ASSUMED: 0, 'CODE-DERIVED': 0, UNTRACEABLE: 0 }, records: 1, withRegisteredId: 1 }),
  G4: pass({ unjustifiedTimers: 0, unjustifiedClockOrRandom: 0, zones: { UTC: { total: 5, passed: 5, failed: 0 } } }),
  G5: pass({ lineStatus: { OPEN: 0 }, floorMissed: [], total: { statements: { pct: 100 }, branches: { pct: 100 }, functions: { pct: 100 }, lines: { pct: 100 } } }),
  G6: pass({ total: 4, killed: 4, survived: 0, equivalent: 0, equivalentButKilled: 0, score: 100 }),
  G7: pass({ total: 5, passed: 5, failed: 0, skipped: 0 }),
});

test('GREEN when every gate passes and nothing is open', () => {
  assert.equal(overall(allPass()).status, 'GREEN');
});

test('RED when any gate is not passing or not run', () => {
  const gates = allPass();
  gates.G3 = { ...gates.G3, status: 'BLOCKED' };
  delete gates.G6;
  const verdict = overall(gates);
  assert.equal(verdict.status, 'RED');
  assert.match(verdict.reasons.join(' '), /G3, G6/);
});

test('RED on a CODE-DERIVED oracle, an equivalent-but-killed mutant or an unregistered id even if gates pass', () => {
  const a = allPass();
  a.G3.summary.oracle['CODE-DERIVED'] = 1;
  const b = allPass();
  b.G6.summary.equivalentButKilled = 1;
  const c = allPass();
  c.G1.summary.invented = 1;
  for (const gates of [a, b, c]) assert.equal(overall(gates).status, 'RED');
});

test('AMBER for open items when all gates pass', () => {
  for (const patch of [
    (g) => { g.G5.summary.lineStatus.OPEN = 2; },
    (g) => { g.G5.summary.floorMissed = ['branches']; },
    (g) => { g.G2.summary.conflicts.pendingConfirmation = 1; },
    (g) => { g.G1.summary.pendingApproval = 3; },
    (g) => { g.G2.summary.tierCells.missing = 1; },
  ]) {
    const gates = allPass();
    patch(gates);
    assert.equal(overall(gates).status, 'AMBER');
  }
});

test('historyRow has exactly the history columns and reads values from the gates', () => {
  const row = historyRow({ gates: allPass(), cycleNumber: 3, story: 'S', date: '2026-10-14', commit: 'abc', status: 'GREEN' });
  assert.deepEqual(Object.keys(row).sort(), [...HISTORY_HEADER].sort());
  assert.equal(row.tests_total, 5);
  assert.equal(row.mutation_score, 100);
  assert.equal(row.tz_zones_passing, 1);
  assert.equal(row.g3, 'PASS');
});

test('a gate that did not run is recorded as NOT RUN with blank numbers', () => {
  const gates = allPass();
  delete gates.G7;
  const row = historyRow({ gates, cycleNumber: 1, story: 'S', date: 'd', commit: 'c', status: 'RED' });
  assert.equal(row.g7, 'NOT RUN');
  assert.equal(row.tests_total, '');
});
