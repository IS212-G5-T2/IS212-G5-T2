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

test('G1 skips an id registered to another story when a shared test file carries it (not invented, not orphan)', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { collectCodeIds, activeStoryIds } = await import('./check-ids.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'foreign-ids-'));
  const file = join(dir, 'calendar.test.tsx');
  writeFileSync(file, [
    "describe('SPM-51 calendar', () => {",
    '  /** VEN-AVL-SUP-04 (SPM-51): owned by SPM-54 after the merge. */',
    "  it('SPM-51 keeps the default date when initialDate is empty', () => {});",
    "  it('VEN-AVL-01-A shows the grid', () => {});",
    '});',
  ].join('\n'));
  const scope = { story: 'SPM-51', tests: { frontend: [{ glob: file, titleMatch: 'SPM-51|VEN-AVL-' }] } };
  const own = [row('VEN-AVL-01-A', 'PRIMARY', { story: 'SPM-51', owning_test_file: file })];
  const foreign = new Set(['VEN-AVL-SUP-04']);
  const ids = collectCodeIds(scope, new Set(['SPM']), activeStoryIds(own), foreign);
  assert.deepEqual([...ids.keys()], ['VEN-AVL-01-A']);
  const result = evaluate({ rows: own, codeIds: ids, matrixIds: matrix(['VEN-AVL-01-A']) });
  assert.equal(result.counts.invented, 0);
  assert.equal(result.counts.orphans, 0);
  assert.deepEqual(result.findings, []);
});

test('G1 still reports an id that no registry row holds as invented, even inside a shared test file', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { collectCodeIds, activeStoryIds } = await import('./check-ids.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'unknown-ids-'));
  const file = join(dir, 'calendar.test.tsx');
  writeFileSync(file, "describe('SPM-51 calendar', () => {\n  it('VEN-AVL-99-Z is not registered anywhere', () => {});\n});\n");
  const scope = { story: 'SPM-51', tests: { frontend: [{ glob: file, titleMatch: 'SPM-51|VEN-AVL-' }] } };
  const own = [row('VEN-AVL-01-A', 'PRIMARY', { story: 'SPM-51' })];
  const ids = collectCodeIds(scope, new Set(['SPM']), activeStoryIds(own), new Set(['VEN-AVL-SUP-04']));
  const result = evaluate({ rows: own, codeIds: ids, matrixIds: matrix(['VEN-AVL-01-A']) });
  assert.equal(result.counts.invented, 1);
  assert.match(result.findings.join('\n'), /VEN-AVL-99-Z is used in .*invented/);
});

test('readRegistry reports ids of other stories as foreign and keeps them out of this story rows', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { readRegistry } = await import('./check-ids.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'registry-foreign-'));
  const file = join(dir, 'registry.md');
  const header = '| ID | Type | Story | Parent AC | Source | Owning test file | Approved | Status |\n|---|---|---|---|---|---|---|---|\n';
  writeFileSync(file, `## Test IDs\n\n${header}| VEN-AVL-01-A | PRIMARY | SPM-51 | AC1 | m | a.test.tsx | n/a | Active |\n| VEN-AVL-SUP-04 | SUPPORTING | SPM-54 | AC4 | d | b.test.tsx | approved | Active |\n`);
  const { rows, foreignIds } = readRegistry(file, 'SPM-51');
  assert.deepEqual(rows.map((r) => r.id), ['VEN-AVL-01-A']);
  assert.deepEqual([...foreignIds], ['VEN-AVL-SUP-04']);
});
