#!/usr/bin/env node
// G1 Traceability and IDs.  Usage:
//   node ai/scripts/test-workflow/check-ids.mjs --scope <scope.json> --cycle <dir> [--matrix <ids.txt>] [--scaffold]
// Compares the test ids found in the scope's test files with the registry rows for the story.
//   --matrix  a text file with the Confluence matrix ids, one per line, saved from Confluence by the agent
//             (without it the PRIMARY check cannot be verified and the gate is UNABLE_TO_VERIFY)
//   --scaffold  print registry rows for ids found in code but missing from the registry, then exit 0
import { join } from 'node:path';
import {
  BLOCKED, PASS, UNABLE, WORKFLOW_DIR, exitCodeFor, fileExists, idFamily, idsIn, isMain, loadScope, parseArgs, parseTables,
  printGate, readText, scopeTests, scopedTests, stripTicks, worst, writeGate, writeText,
} from './lib.mjs';

export function readRegistry(registryPath, story) {
  const tables = parseTables(readText(registryPath));
  const registry = tables.find((table) => table.header.includes('id') && table.header.includes('type'));
  const ignore = tables.find((table) => table.header.includes('family') && /non-test/i.test(table.heading));
  return {
    rows: (registry?.rows ?? []).filter((row) => row.story === story).map((row) => ({ ...row, id: stripTicks(row.id) })),
    ignoredFamilies: new Set((ignore?.rows ?? []).map((row) => stripTicks(row.family))),
  };
}

/** Test ids used by the scope's files. Files with a titleMatch only count the matching tests. */
export function collectCodeIds(scope, ignoredFamilies) {
  const byId = new Map();
  for (const entry of scopeTests(scope)) {
    const text = [];
    if (entry.titleMatch) for (const test of scopedTests(entry)) text.push(test.title, test.comment, test.describes.join(' '));
    else text.push(readText(entry.file));
    for (const id of idsIn(text.join('\n'))) {
      if (ignoredFamilies.has(idFamily(id))) continue;
      if (!byId.has(id)) byId.set(id, new Set());
      byId.get(id).add(entry.file);
    }
  }
  return byId;
}

export function evaluate({ rows, codeIds, matrixIds }) {
  const findings = [];
  const gaps = [];
  const registryIds = rows.map((row) => row.id);
  const duplicates = registryIds.filter((id, index) => registryIds.indexOf(id) !== index);
  for (const id of new Set(duplicates)) findings.push(`registry lists ${id} more than once`);

  const active = rows.filter((row) => !/^(retired|withdrawn)$/i.test(row.status));
  const activeIds = new Set(active.map((row) => row.id));
  const invented = [...codeIds.keys()].filter((id) => !activeIds.has(id));
  for (const id of invented) findings.push(`${id} is used in ${[...codeIds.get(id)].join(', ')} but is not in the registry (invented id)`);
  const orphans = [...activeIds].filter((id) => !codeIds.has(id));
  for (const id of orphans) findings.push(`${id} is in the registry but no test in scope uses it (orphan)`);

  for (const row of active) {
    if (!/^(PRIMARY|SUPPORTING)$/.test(row.type)) findings.push(`${row.id}: type must be PRIMARY or SUPPORTING (found "${row.type}")`);
    if (row.type === 'SUPPORTING' && !row.parent_ac.trim()) findings.push(`${row.id}: SUPPORTING id has no parent AC`);
    if (row.type === 'PRIMARY' && !row.parent_ac.trim()) findings.push(`${row.id}: PRIMARY id has no AC`);
    const owners = stripTicks(row.owning_test_file ?? '').split(',').map((file) => file.trim()).filter(Boolean);
    if (!owners.length) findings.push(`${row.id}: no owning test file`);
    for (const file of owners)
      if (codeIds.has(row.id) && !codeIds.get(row.id).has(file))
        findings.push(`${row.id}: registry names ${file} but the id is used in ${[...codeIds.get(row.id)].join(', ')}`);
  }

  let matrixUnverified = false;
  const primary = active.filter((row) => row.type === 'PRIMARY');
  if (primary.length) {
    if (!matrixIds) matrixUnverified = true;
    else {
      for (const row of primary) if (!matrixIds.has(row.id)) findings.push(`${row.id} is PRIMARY but not in the Confluence matrix`);
      for (const id of matrixIds) if (!activeIds.has(id)) findings.push(`${id} is in the Confluence matrix but not in the registry`);
    }
  }
  const pending = active.filter((row) => /^pending/i.test(row.approved ?? ''));
  const pendingByFamily = new Map();
  for (const row of pending) pendingByFamily.set(idFamily(row.id), (pendingByFamily.get(idFamily(row.id)) ?? 0) + 1);
  for (const [family, count] of pendingByFamily) gaps.push({ type: 'registry-approval', ref: `${family} (${count} id${count === 1 ? '' : 's'})`, reason: 'supporting id mapping awaits owner approval' });

  return {
    findings,
    gaps,
    matrixUnverified,
    counts: {
      registry: active.length,
      primary: primary.length,
      supporting: active.length - primary.length,
      codeIds: codeIds.size,
      invented: invented.length,
      orphans: orphans.length,
      pendingApproval: pending.length,
    },
  };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.scope || !flags.cycle) {
    console.error('usage: check-ids.mjs --scope <scope.json> --cycle <dir> [--matrix <ids.txt>] [--scaffold]');
    process.exit(2);
  }
  const scope = loadScope(flags.scope);
  const registryPath = flags.registry || `${WORKFLOW_DIR}/test-id-registry.md`;
  const { rows, ignoredFamilies } = readRegistry(registryPath, scope.story);
  const codeIds = collectCodeIds(scope, ignoredFamilies);

  if (flags.scaffold) {
    const known = new Set(rows.map((row) => row.id));
    for (const [id, files] of [...codeIds].sort()) if (!known.has(id)) console.log(`| ${id} |  | ${scope.story} |  |  | ${[...files].join(', ')} |  | Active |`);
    return;
  }

  let matrixIds;
  if (flags.matrix && fileExists(flags.matrix))
    matrixIds = new Set(readText(flags.matrix).split('\n').map((line) => line.trim()).filter(Boolean));
  const result = evaluate({ rows, codeIds, matrixIds });
  const status = worst([result.findings.length ? BLOCKED : PASS, result.matrixUnverified ? UNABLE : PASS]);
  const findings = result.matrixUnverified
    ? [...result.findings, 'PRIMARY ids could not be checked against the Confluence matrix (no --matrix file supplied)']
    : result.findings;

  writeText(join(flags.cycle, 'ids-in-code.txt'), `${[...codeIds.keys()].sort().join('\n')}\n`);
  writeText(join(flags.cycle, 'ids-in-registry.txt'), `${rows.map((row) => row.id).sort().join('\n')}\n`);
  const gate = { gate: 'G1', name: 'Traceability and IDs', status, summary: result.counts, findings, gaps: result.gaps };
  writeGate(flags.cycle, gate);
  printGate(gate);
  process.exit(exitCodeFor(status));
}

if (isMain(import.meta.url)) main();
