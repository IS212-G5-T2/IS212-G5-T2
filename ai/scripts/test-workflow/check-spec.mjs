#!/usr/bin/env node
// G2 Spec conflicts and tiers.  Usage:
//   node ai/scripts/test-workflow/check-spec.mjs --scope <scope.json> --cycle <dir>
// Reads docs/test-cases/workflow/spec-conflicts.md and tier-matrix.md for the scope's story.
//   - every conflict is DECIDED (with a decision) or ASSUMED (with a decision and a tag); OPEN blocks the gate
//   - every tier cell of every AC is PRESENT (existing registry ids), N/A (reason) or MISSING (reason)
//   - MISSING cells become gap-list items; a blank cell, or N/A / MISSING without a reason, blocks the gate
import {
  BLOCKED, PASS, WORKFLOW_DIR, exitCodeFor, isMain, loadScope, parseArgs, parseTables, printGate, readText, stripTicks, writeGate,
} from './lib.mjs';
import { readRegistry } from './check-ids.mjs';

export const TIERS = ['happy', 'sad', 'boundary', 'interaction', 'configuration', 'state', 'isolation', 'security', 'concurrency'];

export function checkConflicts(rows, story) {
  const findings = [];
  const gaps = [];
  const mine = rows.filter((row) => (row.story ?? '') === story);
  const counts = { open: 0, decided: 0, assumed: 0, pendingConfirmation: 0 };
  for (const row of mine) {
    const status = (row.status ?? '').trim().toUpperCase();
    const id = row.id || '(no id)';
    if (status === 'OPEN') {
      counts.open += 1;
      findings.push(`${id}: conflict is OPEN (${row.subject})`);
    } else if (status === 'DECIDED') {
      counts.decided += 1;
      if (!(row.decision ?? '').trim()) findings.push(`${id}: DECIDED without a written decision`);
    } else if (status === 'ASSUMED') {
      counts.assumed += 1;
      if (!(row.decision ?? '').trim()) findings.push(`${id}: ASSUMED without a written decision`);
      if (!(row.tag ?? '').trim()) findings.push(`${id}: ASSUMED without the tag that marks the affected tests`);
    } else findings.push(`${id}: status must be OPEN, DECIDED or ASSUMED (found "${row.status}")`);
    if (status !== 'OPEN' && /^pending/i.test((row.confirmed_by ?? '').trim())) {
      counts.pendingConfirmation += 1;
      gaps.push({ type: 'spec-conflict-confirmation', ref: id, reason: `decision not yet confirmed by the owner: ${row.follow_up || row.subject}` });
    }
  }
  return { findings, gaps, counts };
}

/** `PRESENT (A, B)`, `N/A (reason)` or `MISSING (reason)` -> { kind, detail } or an error string. */
export function parseCell(raw) {
  const text = stripTicks(raw ?? '');
  if (!text) return { error: 'blank' };
  const match = text.match(/^(PRESENT|N\/A|MISSING)\s*(?:\((.*)\))?$/i);
  if (!match) return { error: `cannot read "${text}"` };
  const kind = match[1].toUpperCase();
  const detail = (match[2] ?? '').trim();
  if (kind === 'PRESENT') {
    const ids = detail.split(',').map((id) => id.trim()).filter(Boolean);
    return ids.length ? { kind, ids } : { error: 'PRESENT without test ids' };
  }
  return detail ? { kind, detail } : { error: `${kind} without a reason` };
}

export function checkTiers(table, registryIds) {
  const findings = [];
  const gaps = [];
  const cells = { present: 0, na: 0, missing: 0 };
  for (const row of table.rows) {
    const ac = row.ac || '(no AC)';
    for (const tier of TIERS) {
      const cell = parseCell(row[tier]);
      if (cell.error) {
        findings.push(`${ac} ${tier}: ${cell.error}`);
        continue;
      }
      if (cell.kind === 'PRESENT') {
        cells.present += 1;
        for (const id of cell.ids) if (!registryIds.has(id)) findings.push(`${ac} ${tier}: ${id} is not in the registry`);
      } else if (cell.kind === 'N/A') cells.na += 1;
      else {
        cells.missing += 1;
        gaps.push({ type: 'tier-missing', ref: `${ac} ${tier}`, reason: cell.detail });
      }
    }
  }
  return { findings, gaps, cells };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.scope || !flags.cycle) {
    console.error('usage: check-spec.mjs --scope <scope.json> --cycle <dir>');
    process.exit(2);
  }
  const scope = loadScope(flags.scope);
  const findings = [];
  const gaps = [];

  const conflictTable = parseTables(readText(`${WORKFLOW_DIR}/spec-conflicts.md`)).find((table) => table.header.includes('status'));
  const conflicts = checkConflicts(conflictTable?.rows ?? [], scope.story);
  findings.push(...conflicts.findings);
  gaps.push(...conflicts.gaps);

  const { rows } = readRegistry(`${WORKFLOW_DIR}/test-id-registry.md`, scope.story);
  const registryIds = new Set(rows.map((row) => row.id));
  const tierTable = parseTables(readText(`${WORKFLOW_DIR}/tier-matrix.md`)).find((table) => table.heading === scope.story);
  let tiers = { cells: { present: 0, na: 0, missing: 0 } };
  if (!tierTable) findings.push(`tier-matrix.md has no "## ${scope.story}" table`);
  else {
    tiers = checkTiers(tierTable, registryIds);
    findings.push(...tiers.findings);
    gaps.push(...tiers.gaps);
  }

  const status = findings.length ? BLOCKED : PASS;
  const gate = {
    gate: 'G2',
    name: 'Spec conflicts and tiers',
    status,
    summary: { conflicts: conflicts.counts, tierCells: tiers.cells },
    findings,
    gaps,
  };
  writeGate(flags.cycle, gate);
  printGate(gate);
  process.exit(exitCodeFor(status));
}

if (isMain(import.meta.url)) main();
