import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, idsForScopedTests } from './check-ids.mjs';

const row = (id, type, extra = {}) => ({ id, type, story: 'S', parent_ac: 'AC1', owning_test_file: 'a.spec.ts', status: 'Active', approved: 'yes', ...extra });
const codeIds = (ids) => new Map(ids.map((id) => [id, new Set(['a.spec.ts'])]));
const matrix = (ids) => new Set(ids);

test('G1 passes when code, registry and matrix agree', () => {
  const result = evaluate({ rows: [row('P-01-A', 'PRIMARY'), row('SUP-01', 'SUPPORTING')], codeIds: codeIds(['P-01-A', 'SUP-01']), matrixIds: matrix(['P-01-A']) });
  assert.deepEqual(result.findings, []);
  assert.equal(result.matrixUnverified, false);
  assert.equal(result.counts.primary, 1);
});

test('G1 reports an id used in code but absent from the registry (invented)', () => {
  const result = evaluate({ rows: [row('SUP-01', 'SUPPORTING')], codeIds: codeIds(['SUP-01', 'MADE-UP-01']), matrixIds: matrix([]) });
  assert.equal(result.counts.invented, 1);
  assert.match(result.findings.join('\n'), /MADE-UP-01.*invented/);
});

test('G1 reports a registry id that no test uses (orphan)', () => {
  const result = evaluate({ rows: [row('SUP-01', 'SUPPORTING'), row('SUP-02', 'SUPPORTING')], codeIds: codeIds(['SUP-01']), matrixIds: matrix([]) });
  assert.equal(result.counts.orphans, 1);
  assert.match(result.findings.join('\n'), /SUP-02.*orphan/);
});

test('G1 rejects a SUPPORTING id with no parent AC and a duplicate row', () => {
  const result = evaluate({ rows: [row('SUP-01', 'SUPPORTING', { parent_ac: '' }), row('SUP-01', 'SUPPORTING')], codeIds: codeIds(['SUP-01']), matrixIds: matrix([]) });
  const text = result.findings.join('\n');
  assert.match(text, /no parent AC/);
  assert.match(text, /more than once/);
});

test('G1 compares PRIMARY ids with the Confluence matrix in both directions', () => {
  const result = evaluate({ rows: [row('P-01-A', 'PRIMARY'), row('P-01-B', 'PRIMARY')], codeIds: codeIds(['P-01-A', 'P-01-B']), matrixIds: matrix(['P-01-A', 'P-09-Z']) });
  const text = result.findings.join('\n');
  assert.match(text, /P-01-B is PRIMARY but not in the Confluence matrix/);
  assert.match(text, /P-09-Z is in the Confluence matrix but not in the registry/);
});

test('G1 cannot verify PRIMARY ids without the matrix file', () => {
  const result = evaluate({ rows: [row('P-01-A', 'PRIMARY')], codeIds: codeIds(['P-01-A']), matrixIds: undefined });
  assert.equal(result.matrixUnverified, true);
});

test('G1 flags a registry file that does not use the id, and counts pending approvals as gaps', () => {
  const rows = [row('SUP-01', 'SUPPORTING', { owning_test_file: 'b.spec.ts', approved: 'pending (proposed)' })];
  const result = evaluate({ rows, codeIds: codeIds(['SUP-01']), matrixIds: matrix([]) });
  assert.match(result.findings.join('\n'), /registry names b\.spec\.ts/);
  assert.equal(result.counts.pendingApproval, 1);
  assert.equal(result.gaps.length, 1);
});

test('G1 scopes shared-file IDs to each selected test rather than unrelated comments', () => {
  const tests = [
    { title: 'EQUIP-AVAIL-08-A creates a record', comment: 'EQUIP-CRE-02 is a historical reference', describes: [] },
  ];
  const ids = idsForScopedTests(tests, new Set());
  assert.deepEqual(ids, ['EQUIP-AVAIL-08-A']);
});
