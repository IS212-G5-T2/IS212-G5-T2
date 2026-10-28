import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate } from './check-ids.mjs';

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

test('readRegistry reads registry rows from every table in the file, not only the first', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readRegistry } = await import('./check-ids.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'registry-'));
  const file = join(dir, 'registry.md');
  const header = '| ID | Type | Story | Parent AC | Source | Owning test file | Approved | Status |\n|---|---|---|---|---|---|---|---|\n';
  writeFileSync(file, `## Test IDs\n\n${header}| P-01-A | PRIMARY | S | AC1 | m | a.spec.ts | n/a | Active |\n\n## Notes\n\nA paragraph.\n\n${header}| SUP-01 | SUPPORTING | S | AC1 | m | a.spec.ts | pending | Active |\n`);
  const { rows } = readRegistry(file, 'S');
  assert.deepEqual(rows.map((row) => row.id), ['P-01-A', 'SUP-01']);
});

test('collectCodeIds traces a registered id whose test sits outside the titleMatch (no orphan without a scope change)', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { collectCodeIds, activeStoryIds } = await import('./check-ids.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'collect-ids-'));
  const file = join(dir, 'calendar.test.tsx');
  writeFileSync(file, [
    "describe('calendar', () => {",
    '  /** VEN-AVL-SUP-04 (SPM-51): an empty initialDate keeps the default date. */',
    "  it('keeps the default calendar date when initialDate is empty', () => {});",
    "  it('SPM54-COVERAGE-ONLY-NO-IDS renders the grid', () => {});",
    "  it('VEN-OTHER-01-A belongs to another story', () => {});",
    '});',
  ].join('\n'));
  const scope = { story: 'S', tests: { frontend: [{ glob: file, titleMatch: 'SPM54-COVERAGE-ONLY-NO-IDS' }] } };
  const rows = [row('VEN-AVL-SUP-04', 'SUPPORTING'), row('SPM54-COVERAGE-ONLY-NO-IDS', 'SUPPORTING', { status: 'retired' })];
  const withRegistry = collectCodeIds(scope, new Set(['SPM']), activeStoryIds(rows));
  assert.deepEqual([...withRegistry.keys()].sort(), ['VEN-AVL-SUP-04']);
  const result = evaluate({ rows, codeIds: withRegistry, matrixIds: matrix([]) });
  assert.equal(result.counts.orphans, 0);
  assert.equal(collectCodeIds(scope, new Set(['SPM'])).has('VEN-AVL-SUP-04'), false);
});
