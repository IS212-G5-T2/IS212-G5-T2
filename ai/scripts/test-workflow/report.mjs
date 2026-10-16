#!/usr/bin/env node
// Section 7 metrics report.  Usage:
//   node ai/scripts/test-workflow/report.mjs --scope <scope.json> --cycle <dir> [--cycle-number N] [--record]
// Builds <cycle>/metrics.md and <cycle>/gap-list.md from the gate files in <cycle>/gates/ and compares with the
// previous cycle of the same story in docs/test-cases/workflow/metrics-history.csv. Every number comes from a
// saved file; a gate whose file is missing is reported as NOT RUN. --record appends this cycle to the history.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  BLOCKED, PASS, UNABLE, WORKFLOW_DIR, fileExists, isMain, loadScope, parseArgs, parseCsv, parseTables, readJson, readText, toCsv, worst, writeText,
} from './lib.mjs';

export const HISTORY_HEADER = [
  'cycle', 'story', 'date', 'commit', 'status', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7',
  'tests_total', 'tests_passed', 'tests_failed', 'tests_skipped', 'cov_statements', 'cov_branches', 'cov_functions', 'cov_lines',
  'mutants_total', 'mutants_killed', 'mutants_survived', 'mutants_equivalent', 'mutation_score', 'equivalent_but_killed', 'cov_open',
  'ids_invented', 'ids_orphan', 'tests_recorded', 'tests_registered_id', 'tests_with_ac', 'tests_with_kills', 'tests_with_comment', 'tests_unexplained',
  'conflicts_open', 'conflicts_decided', 'tiers_present', 'tiers_na', 'tiers_missing', 'det_timers', 'det_clock_random', 'tz_zones_passing',
];

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

export function readGates(cycle) {
  const load = (name) => (fileExists(join(cycle, 'gates', `${name}.json`)) ? readJson(join(cycle, 'gates', `${name}.json`)) : undefined);
  const scan = load('G4scan');
  const tz = load('G4tz');
  const g4 = scan || tz
    ? {
        gate: 'G4',
        name: 'Determinism',
        status: worst([scan?.status ?? UNABLE, tz?.status ?? UNABLE]),
        summary: { ...(scan?.summary ?? {}), zones: tz?.summary?.zones },
        findings: [...(scan?.findings ?? []), ...(tz?.findings ?? (tz ? [] : ['timezone runs NOT RUN']))],
        gaps: [],
      }
    : undefined;
  return { G1: load('G1'), G2: load('G2'), G3: load('G3'), G4: g4, G5: load('G5'), G6: load('G6'), G7: load('G7') };
}

const num = (value) => (value === undefined || value === null || value === '' ? undefined : Number(value));
const fmt = (value, suffix = '') => (value === undefined || Number.isNaN(value) ? 'NOT RUN' : `${value}${suffix}`);
const change = (cur, prev) => (cur === undefined || prev === undefined || Number.isNaN(cur) || Number.isNaN(prev) ? '' : cur - prev === 0 ? '0' : `${cur - prev > 0 ? '+' : ''}${Math.round((cur - prev) * 100) / 100}`);
const table = (header, rows) => `| ${header.join(' | ')} |\n|${header.map(() => '---').join('|')}|\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`;

export function historyRow(ctx) {
  const { gates, cycleNumber, story, date, commit, status } = ctx;
  const g3 = gates.G3?.summary ?? {};
  const g5 = gates.G5?.summary ?? {};
  const g6 = gates.G6?.summary ?? {};
  const g7 = gates.G7?.summary ?? {};
  const g1 = gates.G1?.summary ?? {};
  const g2 = gates.G2?.summary ?? {};
  const g4 = gates.G4?.summary ?? {};
  const zones = g4.zones ? Object.values(g4.zones).filter((z) => z.failed === 0 && z.total > 0).length : '';
  return {
    cycle: cycleNumber, story, date, commit, status,
    ...Object.fromEntries(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].map((g) => [g.toLowerCase(), gates[g]?.status ?? 'NOT RUN'])),
    tests_total: g7.total ?? '', tests_passed: g7.passed ?? '', tests_failed: g7.failed ?? '', tests_skipped: g7.skipped ?? '',
    cov_statements: g5.total?.statements?.pct ?? '', cov_branches: g5.total?.branches?.pct ?? '', cov_functions: g5.total?.functions?.pct ?? '', cov_lines: g5.total?.lines?.pct ?? '',
    mutants_total: g6.total ?? '', mutants_killed: g6.killed ?? '', mutants_survived: g6.survived ?? '', mutants_equivalent: g6.equivalent ?? '', mutation_score: g6.score ?? '',
    equivalent_but_killed: g6.equivalentButKilled ?? '', cov_open: g5.lineStatus?.OPEN ?? '',
    ids_invented: g1.invented ?? '', ids_orphan: g1.orphans ?? '',
    tests_recorded: g3.records ?? '', tests_registered_id: g3.withRegisteredId ?? '', tests_with_ac: g3.withAc ?? '', tests_with_kills: g3.withKills ?? '',
    tests_with_comment: g3.withComment ?? '', tests_unexplained: g3.unexplained ?? '',
    conflicts_open: g2.conflicts?.open ?? '', conflicts_decided: g2.conflicts?.decided ?? '',
    tiers_present: g2.tierCells?.present ?? '', tiers_na: g2.tierCells?.na ?? '', tiers_missing: g2.tierCells?.missing ?? '',
    det_timers: g4.unjustifiedTimers ?? '', det_clock_random: g4.unjustifiedClockOrRandom ?? '', tz_zones_passing: zones,
  };
}

/** RED / AMBER / GREEN by section 7I. */
export function overall(gates) {
  const notPassing = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].filter((name) => !gates[name] || gates[name].status !== PASS);
  const red = [];
  if (notPassing.length) red.push(`gates not passing: ${notPassing.join(', ')}`);
  const g3 = gates.G3?.summary;
  if (g3 && (g3.oracle['CODE-DERIVED'] || g3.oracle.UNTRACEABLE)) red.push('CODE-DERIVED or UNTRACEABLE oracle');
  if (gates.G6?.summary?.equivalentButKilled) red.push('equivalent mutant that a test kills');
  if (gates.G1?.summary?.invented) red.push('unregistered test id');
  if (red.length) return { status: 'RED', reasons: red };
  const amber = [];
  if (gates.G5?.summary?.lineStatus?.OPEN) amber.push('OPEN coverage gaps');
  if (gates.G2?.summary?.conflicts?.open) amber.push('OPEN spec conflicts');
  if (gates.G6?.summary?.survived) amber.push('survived mutants');
  if (gates.G5?.summary?.floorMissed?.length) amber.push('coverage floor missed');
  if (gates.G1?.summary?.pendingApproval) amber.push('registry approvals pending');
  if (gates.G2?.summary?.conflicts?.pendingConfirmation) amber.push('spec decisions awaiting confirmation');
  if (gates.G2?.summary?.tierCells?.missing) amber.push('tiers MISSING with a reason');
  return amber.length ? { status: 'AMBER', reasons: amber } : { status: 'GREEN', reasons: [] };
}

function render(ctx) {
  const { gates, prev, scope, cycleNumber, date, commit, env, verdict } = ctx;
  const p = (name) => num(prev?.[name]);
  const last = (name, suffix = '') => (prev ? fmt(p(name), suffix) : 'n/a');
  const g1 = gates.G1?.summary ?? {};
  const g2 = gates.G2?.summary ?? {};
  const g3 = gates.G3?.summary ?? {};
  const g4 = gates.G4?.summary ?? {};
  const g5 = gates.G5?.summary ?? {};
  const g6 = gates.G6?.summary ?? {};
  const g7 = gates.G7?.summary ?? {};
  const gateLine = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].map((g) => `${g} ${gates[g] ? (gates[g].status === PASS ? 'P' : gates[g].status === BLOCKED ? 'F' : 'U') : 'N'}`).join(' ');
  const out = [];
  out.push(`# Test workflow metrics: ${scope.story} ${scope.title ?? ''}`.trim(), '');
  out.push('## 7A Header', '', '```', `Cycle: ${cycleNumber} | Date: ${date} | Commit: ${commit} | Environment: ${env}`, `Gates: ${gateLine}   (P pass, F blocked, U unable to verify, N not run)`, `Overall status: ${verdict.status}${verdict.reasons.length ? `  (${verdict.reasons.join('; ')})` : ''}`, '```', '');

  const zones = g4.zones ?? {};
  const zoneText = Object.keys(zones).length ? Object.entries(zones).map(([zone, z]) => `${zone} ${z.total ? Math.round((z.passed / z.total) * 100) : 0}%`).join(' / ') : 'NOT RUN';
  out.push('## 7B Test execution', '', table(['Metric', 'This cycle', 'Last cycle', 'Change'], [
    ['Total tests', fmt(g7.total), last('tests_total'), change(g7.total, p('tests_total'))],
    ['Passed', fmt(g7.passed), last('tests_passed'), change(g7.passed, p('tests_passed'))],
    ['Failed', fmt(g7.failed), last('tests_failed'), change(g7.failed, p('tests_failed'))],
    ['Skipped', fmt(g7.skipped), last('tests_skipped'), change(g7.skipped, p('tests_skipped'))],
    ['Flaky reruns (passed only on retry)', g7.total === undefined ? 'NOT RUN' : '0 (no retries are configured)', '', ''],
    ['Pass rate by timezone', zoneText, '', ''],
    ['Suite run time (sum of suites)', g7.durationSeconds === undefined ? 'NOT RUN' : `${g7.durationSeconds} s`, '', ''],
  ]));

  const metric = (name) => g5.total?.[name];
  const floorOf = (name) => g5.floor?.[name];
  out.push('## 7C Coverage by type (total over the scope source files)', '', table(['Type', 'This cycle', 'Last cycle', 'Change', 'Floor', 'Status'], ['statements', 'branches', 'functions', 'lines'].map((name) => [
    { statements: 'Statement', branches: 'Branch', functions: 'Function', lines: 'Line' }[name], metric(name) ? `${metric(name).pct}% (${metric(name).covered}/${metric(name).total})` : 'NOT RUN', last(`cov_${name}`, '%'), change(metric(name)?.pct, p(`cov_${name}`)), floorOf(name) === undefined ? '' : `${floorOf(name)}%`, !metric(name) ? 'NOT RUN' : floorOf(name) === undefined ? 'no floor set' : metric(name).pct >= floorOf(name) ? 'met' : 'MISSED',
  ])));

  out.push('## 7D Coverage by file', '');
  if (gates.G5?.files) {
    const line = (f, m) => `${f[m].total === 0 ? 100 : Math.round((f[m].covered / f[m].total) * 10000) / 100}%`;
    out.push(table(['File', 'Statement', 'Branch', 'Function', 'Line', 'Uncovered lines', 'Status of each uncovered line'], gates.G5.files.map((f) => [
      f.file.replace(/^(backend|frontend)\//, ''), line(f, 'statements'), line(f, 'branches'), line(f, 'functions'), line(f, 'lines'),
      f.uncoveredLines.length ? f.uncoveredLines.join(', ') : 'none',
      f.uncoveredLines.length ? [...new Set(f.uncoveredLines.map((n) => f.lineStatus[n] ?? 'NO STATUS'))].join(', ') : '',
    ])));
    out.push(`Not measured: ${gates.G5.notMeasured?.length ? gates.G5.notMeasured.join(', ') : 'none'}`, '');
    const e2eOnly = gates.G5.files.reduce((sum, f) => sum + f.e2eOnlyLines.length, 0);
    out.push(`Lines covered only by an end-to-end run (COVERED-BY-E2E): ${e2eOnly}`, '');
  } else out.push('NOT RUN', '');

  out.push('## 7E Coverage quality', '', table(['Metric', 'This cycle', 'Last cycle', 'Target'], [
    ['Mutation score (killed / (total - equivalent))', fmt(g6.score, '%'), last('mutation_score', '%'), 'team-set'],
    ['Mutants killed', fmt(g6.killed), last('mutants_killed'), ''],
    ['Mutants survived (real gaps)', fmt(g6.survived), last('mutants_survived'), '0'],
    ['Mutants equivalent (each argued in its name)', fmt(g6.equivalent), last('mutants_equivalent'), 'small; reviewed'],
    ['Equivalent but killed (error)', fmt(g6.equivalentButKilled), last('equivalent_but_killed'), '0'],
    ['Mutation runs not run', g6.entries ? String(g6.entries.filter((e) => !e.run).length) : 'NOT RUN', '', '0'],
    ['Coverage gap UNREACHABLE', fmt(g5.lineStatus?.UNREACHABLE), '', 'each with a reason'],
    ['Coverage gap LOW-VALUE', fmt(g5.lineStatus?.['LOW-VALUE']), '', 'each with a reason'],
    ['Coverage gap OPEN', fmt(g5.lineStatus?.OPEN), last('cov_open'), '0'],
  ]));

  const rate = (n, d) => (d ? `${n} of ${d}` : 'NOT RUN');
  out.push('## 7F Traceability and IDs', '', table(['Metric', 'This cycle', 'Last cycle', 'Change', 'Target'], [
    ['ACs in scope', fmt(ctx.acs), '', '', ''],
    ['ACs with at least one test (Happy or Sad present)', fmt(ctx.acsWithTest), '', '', 'all'],
    ['PRIMARY ids (matrix)', fmt(g1.primary), '', '', ''],
    ['SUPPORTING ids registered', fmt(g1.supporting), '', '', ''],
    ['Code ids not in registry (invented)', fmt(g1.invented), last('ids_invented'), change(g1.invented, p('ids_invented')), '0'],
    ['Registry ids with no test (orphan)', fmt(g1.orphans), last('ids_orphan'), change(g1.orphans, p('ids_orphan')), '0'],
    ['Tests with a registered id', rate(g3.withRegisteredId, g3.records), last('tests_registered_id'), change(g3.withRegisteredId, p('tests_registered_id')), 'all'],
    ['Tests with a parent AC', rate(g3.withAc, g3.records), last('tests_with_ac'), change(g3.withAc, p('tests_with_ac')), 'all'],
    ['Tests with a kills link', rate(g3.withKills, g3.records), last('tests_with_kills'), change(g3.withKills, p('tests_with_kills')), 'all'],
    ['Tests with a comment', rate(g3.withComment, g3.records), last('tests_with_comment'), change(g3.withComment, p('tests_with_comment')), 'recorded'],
    ['Tests marked explained: No', fmt(g3.unexplained), last('tests_unexplained'), change(g3.unexplained, p('tests_unexplained')), '0'],
    ['Registry mappings awaiting owner approval', fmt(g1.pendingApproval), '', '', '0'],
  ]));

  const oracle = g3.oracle ?? {};
  out.push('## 7G Spec quality and assumptions', '', table(['Metric', 'This cycle', 'Last cycle', 'Target'], [
    ['Open spec conflicts', fmt(g2.conflicts?.open), last('conflicts_open'), '0'],
    ['Decided spec conflicts', fmt(g2.conflicts?.decided), last('conflicts_decided'), ''],
    ['Decisions awaiting owner confirmation', fmt(g2.conflicts?.pendingConfirmation), '', '0'],
    ['ASSUMED tests', g3.oracle ? String(oracle.ASSUMED) : 'NOT RUN', '', 'recorded'],
    ['Tiers PRESENT / N/A / MISSING', g2.tierCells ? `${g2.tierCells.present} / ${g2.tierCells.na} / ${g2.tierCells.missing}` : 'NOT RUN', `${last('tiers_present')} / ${last('tiers_na')} / ${last('tiers_missing')}`, 'MISSING only with a reason'],
    ['Oracle class SPEC / DERIVED / ASSUMED / CODE-DERIVED / UNTRACEABLE', g3.oracle ? `${oracle.SPEC} / ${oracle.DERIVED} / ${oracle.ASSUMED} / ${oracle['CODE-DERIVED']} / ${oracle.UNTRACEABLE}` : 'NOT RUN', '', 'CODE-DERIVED = 0, UNTRACEABLE = 0'],
    ['Tests with no oracle class recorded', fmt(g3.blankOracle), '', '0'],
  ]));

  out.push('## 7H Determinism and automation', '', table(['Metric', 'This cycle', 'Last cycle', 'Target'], [
    ['Unjustified sleep / timers / polling in tests', fmt(g4.unjustifiedTimers), last('det_timers'), '0'],
    ['Unjustified Date.now / new Date / Math.random / random ids', fmt(g4.unjustifiedClockOrRandom), last('det_clock_random'), '0'],
    ['Justified hits (see determinism-exceptions.md)', fmt(g4.justified), '', 'recorded'],
    ['Timezones with every test passing', Object.keys(zones).length ? `${Object.values(zones).filter((z) => z.failed === 0 && z.total > 0).length} of ${Object.keys(zones).length}` : 'NOT RUN', last('tz_zones_passing'), 'all'],
    ['Shared mutable fixtures (crosstalk risk)', 'NOT MEASURED (manual review)', '', '0'],
    ['Items marked Not Automated', 'NOT MEASURED (manual: see the results document gap list)', '', 'each has a reason'],
  ]));

  out.push('## 7J Progress summary', '');
  const failing = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].filter((g) => !gates[g] || gates[g].status !== PASS);
  const moved = [];
  if (prev) {
    for (const [label, name, cur] of [['registered ids', 'tests_registered_id', g3.withRegisteredId], ['mutants killed', 'mutants_killed', g6.killed], ['tests passed', 'tests_passed', g7.passed]]) {
      const d = change(cur, p(name));
      if (d && d !== '0') moved.push(`${label} ${d}`);
    }
  }
  out.push(prev ? `Since cycle ${prev.cycle}: ${moved.length ? moved.join('; ') : 'no numeric change'}.` : 'First recorded cycle for this story: no earlier cycle to compare.', '');
  out.push('Next actions:', '');
  const actions = failing.slice(0, 3).map((g, index) => `${index + 1}. [${g}] ${gates[g] ? gates[g].findings?.[0] ?? gates[g].status : 'run this gate (NOT RUN)'}`);
  out.push(actions.length ? actions.join('\n') : 'None: every gate passed.', '');
  return out.join('\n');
}

function gapList(gates) {
  const rows = [];
  for (const gate of Object.values(gates)) for (const gap of gate?.gaps ?? []) rows.push([gate.gate, gap.type, gap.ref, gap.reason]);
  for (const gate of Object.values(gates)) if (gate && gate.status !== PASS) rows.push([gate.gate, 'gate-' + gate.status.toLowerCase(), gate.name, (gate.findings ?? [])[0] ?? '']);
  return `# Gap list\n\n${rows.length ? table(['Gate', 'Type', 'Ref', 'Reason'], rows) : 'No gaps.\n'}`;
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.scope || !flags.cycle) {
    console.error('usage: report.mjs --scope <scope.json> --cycle <dir> [--cycle-number N] [--record]');
    process.exit(2);
  }
  const scope = loadScope(flags.scope);
  const historyPath = `${WORKFLOW_DIR}/metrics-history.csv`;
  const history = fileExists(historyPath) ? parseCsv(readText(historyPath)) : [];
  const mine = history.filter((row) => row.story === scope.story);
  const cycleNumber = Number(flags['cycle-number'] ?? (mine.length ? Math.max(...mine.map((r) => Number(r.cycle))) + 1 : 1));
  const prev = mine.filter((r) => Number(r.cycle) < cycleNumber).sort((a, b) => Number(b.cycle) - Number(a.cycle))[0];
  const gates = readGates(flags.cycle);
  const verdict = overall(gates);
  const matrix = parseTables(readText(`${WORKFLOW_DIR}/tier-matrix.md`)).find((t) => t.heading === scope.story);
  const present = (cell) => /^PRESENT/i.test((cell ?? '').trim());
  const commit = `${git('rev-parse', '--short', 'HEAD')}${git('status', '--porcelain') ? '+uncommitted' : ''}`;
  const date = new Date().toISOString().slice(0, 10);
  const env = `local, node ${process.version}${gates.G7?.summary?.runner ? `, ${gates.G7.summary.runner}` : ''}`;
  const ctx = {
    gates, prev, scope, cycleNumber, date, commit, env, verdict, story: scope.story,
    acs: matrix?.rows.length, acsWithTest: matrix ? matrix.rows.filter((row) => present(row.happy) || present(row.sad)).length : undefined,
  };
  writeText(join(flags.cycle, 'metrics.md'), `${render(ctx)}\n`);
  writeText(join(flags.cycle, 'gap-list.md'), gapList(gates));
  console.log(`wrote ${join(flags.cycle, 'metrics.md')} and gap-list.md; overall ${verdict.status}${verdict.reasons.length ? ` (${verdict.reasons.join('; ')})` : ''}`);
  if (flags.record) {
    const row = historyRow({ gates, cycleNumber, story: scope.story, date, commit, status: verdict.status });
    const kept = history.filter((r) => !(r.story === scope.story && Number(r.cycle) === cycleNumber));
    writeText(historyPath, toCsv(HISTORY_HEADER, [...kept, row]));
    console.log(`recorded cycle ${cycleNumber} in ${historyPath}`);
  }
}

if (isMain(import.meta.url)) main();
