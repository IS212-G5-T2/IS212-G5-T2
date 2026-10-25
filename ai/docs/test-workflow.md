# Test Workflow: Controls and Metrics

Controls for every test cycle: the gates a story's tests must pass, the records the workflow keeps, and the metrics report that closes each cycle. They exist so that a review cannot report a number it did not observe, an ID it did not verify, or a conflict it settled silently.

Where this fits:

- [`ai/docs/sub-agents.md`](sub-agents.md) is the shared contract (assignments, reports, findings). This file adds the test-specific gates and metrics to it.
- [`test-generation`](../../.agents/skills/test-generation/SKILL.md) is how tests are written; [`test-review`](../../.agents/skills/test-review/SKILL.md) is how they are reviewed. This file is what both must satisfy and record.
- [`ai/agents/test-code-reviewer.md`](../agents/test-code-reviewer.md) runs the cycle as the independent gate; [`ai/agents/implementation.md`](../agents/implementation.md) maintains the records while writing tests.

Tooling lives in `ai/scripts/test-workflow/` (dependency-free Node). Durable records live in `docs/test-cases/workflow/`. Cycle evidence goes to the ignored `ai/runtime/test-cycles/<story>/cycle-NN/`.

## 0. Rules the workflow never breaks

1. **No unobserved results.** Every number in a report comes from a file in the cycle folder. Write `NOT RUN` where nothing ran.
2. **No invented IDs.** An ID is either in the Confluence matrix or in the registry (section 2). Verify with the script before citing one.
3. **No silent spec decisions.** When two sources disagree, record a conflict (section 3), decide it with a stated basis or tag the affected tests `ASSUMPTION`, and do not call those tests passing until it is resolved.
4. **No equivalent flag on a killed mutant.** A mutant that any test kills is not equivalent; an equivalent mutant needs a written argument in its name.
5. **No coverage exclusion without a recorded reason** (`coverage-exclusions.md`, including any ignore comment in code).
6. **The implementation is never the oracle.** Expected values come from the AC, the test case or a stated rule.
7. **No uncontrolled time, sleeps, polling or random values in tests.** Use fake timers, fixed fixtures and deterministic gates. A hit that cannot be removed needs a row in `determinism-exceptions.md` that says why, bounds it and shows that the outcome is asserted (section 7, G4).

## 1. Gap-to-control map

| # | Gap this prevents | Control | Gate | Blocks |
|---|---|---|---|---|
| 1 | Missing `kills` link | Every test record has a `kills` value: mutant ids, or a suite-level link that the script derives from the mutation runner | G3 | Yes |
| 2 | Unrecorded spec conflict (for example 422 vs 409) | Spec-conflict register; OPEN conflicts block | G2 | Yes |
| 3 | IDs with no authoritative source | ID registry; code ids must equal registry ids | G1 | Yes |
| 4 | Coverage below target, or a file missing from the measurement | Scope check plus a status for every uncovered line | G5 | Yes |
| 5 | Timing-dependent tests | Determinism scan, exceptions register, three timezone runs | G4 | Yes |
| 6 | Uneven documentation | Record field `explained`; a comment is required when it is `No` | G3 | Yes for `explained: No` without a comment |
| 7 | Tiers silently absent | Tier matrix: every cell is PRESENT, N/A (reason) or MISSING (reason) | G2 | Yes for a blank or unreasoned cell |
| 8 | Equivalent flag on a killed mutant | Mutation reconciliation | G6 | Yes |

## 2. Who does what

| Role | Does | Must not |
|---|---|---|
| Implementation | Writes tests and keeps the tracked records current as it writes them: registry rows, tier matrix, conflict register, test records, determinism exceptions, coverage line statuses, the story scope | Approve its own gate |
| Test Code Reviewer | Runs the cycle, verifies the records against the code, reports each gate and the metrics report | Edit tracked files; write anywhere except the assigned ignored cycle folder |
| Orchestrator | Assigns the cycle (story, scope file, cycle folder), saves the Confluence matrix IDs into the cycle folder, decides what BLOCKED and AMBER items do next | Treat a report as complete while a gate is blocked or not run |

Reviewers fetch the Confluence matrix IDs through the available Atlassian tools and save them to `<cycle>/confluence-matrix-ids.txt` (one ID per line). If Confluence is not reachable, G1 is `UNABLE_TO_VERIFY`; do not substitute the code's IDs.

## 3. Records and where they live

All under `docs/test-cases/workflow/`, one set per repository, keyed by story.

| File | Holds | Written by |
|---|---|---|
| `scopes/<story>.json` | The test files (with an optional `titleMatch` for shared files), source files, suites, timezones, coverage floor, mutation runners and the optional `linesFrom` of the story (`"changed-lines"` measures G5 only on the lines `story-lines.mjs` derives for the story) | Implementation |
| `test-id-registry.md` | Every test ID with type, story, parent AC, source, owning files and approval; the non-test token families | Implementation |
| `spec-conflicts.md` | Spec conflicts with sources, decision, status and confirmation | Implementation |
| `tier-matrix.md` | One table per story: AC by tier | Implementation |
| `records/<story>.csv` | One row per test definition (section 5) | Script plus Implementation |
| `determinism-exceptions.md` | Allowed hits of the determinism scan, each bounded and explained | Implementation |
| `coverage-exclusions.md`, `coverage-line-status.md` | Excluded files and the status of each uncovered line | Implementation |
| `metrics-history.csv` | One row per recorded cycle | `report.mjs --record` |

## 4. ID registry (gap 3)

| ID | Type | Story | Parent AC | Source | Owning test file | Approved | Status |
|---|---|---|---|---|---|---|---|

- `PRIMARY`: a row of the Confluence matrix. Each needs at least one test and a matrix row.
- `SUPPORTING`: a group of tests that supports a parent AC and is not a matrix row. It must name its parent AC and be approved by the story owner (`pending` is reported as a gap). Supporting IDs stay out of the summary matrix.
- A test may not carry an ID that is absent from the registry. Fixture labels, message codes, Jira keys and review labels are listed under "Non-test tokens" so they are not mistaken for test IDs.
- A test with no ID of its own inherits the ID of the nearest enclosing `describe`.

G1 compares three sets: IDs in the scope's test files, IDs in the registry, IDs in the Confluence matrix.

## 5. Per-test record (gaps 1, 3, 6)

One row per `it` / `test` / `it.each` call site (an `it.each` is one row). The script fills what it can determine; a reviewer fills the judgement fields and the script never overwrites them.

| Field | Source | Rule |
|---|---|---|
| `test_id`, `file`, `title`, `line`, `level` | script | `test_id` must be in the registry |
| `ac` | script from the registry, else reviewer | One or more ACs of the story |
| `tier`, `tier_status` | reviewer | Tier from the allowed list; matches the tier matrix |
| `oracle_class` | reviewer | `SPEC`, `DERIVED`, `ASSUMED`, `CODE-DERIVED` (blocker), `UNTRACEABLE` (blocker) |
| `assumption_ref` | reviewer | Required when `ASSUMED` |
| `kills` | script | A suite-level link (`mutants:<entry>/<suite>(n)`) from the mutation runner, or mutant ids written by hand |
| `explained` | reviewer | `Yes` or `No`: can the setup, action and expected result be explained (review question 3) |
| `comment_present` | script | A comment must exist when `explained` is `No` |
| `deterministic` | script | From the determinism scan of the file |
| `result` | script | PASS, FAIL, NOT RUN from the cycle's test run |

The five review questions each map to a field: which AC (`ac`), which wrong implementation fails it (`kills`), can I explain it (`explained`), is the expected value justified independently of the code (`oracle_class`), is it deterministic and non-vacuous (`deterministic` plus the assertion check in review).

## 6. Tier matrix (gap 7)

`tier-matrix.md` has one table per story with a row per AC and a column per tier: Happy, Sad, Boundary, Interaction, Configuration, State, Isolation, Security, Concurrency. Each cell is exactly one of:

- `PRESENT (ID, ID)` with IDs that are in the registry
- `N/A (reason)`, for example "no configurable parameter in the AC"
- `MISSING (reason)`, which becomes a gap-list item

A blank cell, or `N/A` / `MISSING` without a reason, fails G2. Boundary is required wherever the spec states a limit; Interaction wherever two rules apply to one input. The `-BND`, `-INT` and similar name suffixes are optional: the matrix is the source of truth.

## 7. Gates

Run in order. A failed gate is reported, not skipped. Each script writes `<cycle>/gates/<gate>.json` and exits 0 (PASS), 1 (BLOCKED) or 3 (UNABLE_TO_VERIFY).

| Gate | Script | Pass condition | Evidence |
|---|---|---|---|
| G1 Traceability and IDs | `check-ids.mjs` | Code IDs = registry IDs; each PRIMARY ID is in the matrix and has a test; each SUPPORTING ID names a parent AC; no registry ID without a test | `ids-in-code.txt`, `ids-in-registry.txt` |
| G2 Spec conflicts and tiers | `check-spec.mjs` | No OPEN conflict; every tier cell valid | `gates/G2.json` |
| G3 Test records | `check-records.mjs` | Every test has a registered ID, a parent AC, a `kills` link, a tier, an oracle class, an `explained` value and no blocker oracle | `test-records.csv` |
| G4 Determinism | `scan-determinism.mjs` plus the timezone runs of `run-cycle.mjs` | No unjustified hit; the scope's suites pass in UTC, Asia/Singapore and America/Los_Angeles with no failed or skipped tests | `determinism-scan.txt`, `tz-runs/` |
| G5 Coverage scope | `coverage-scope.mjs` | Source files in scope = measured files (minus recorded exclusions); every uncovered line has a status | `coverage/`, `gates/G5.json` |
| G6 Mutation | `reconcile-mutation.mjs` | Every defined mutant has a result and every baseline is green; KILLED has a killing suite; EQUIVALENT has no killing suite and a written argument; no survivor, no misapplied mutant | `mutation-report.md` |
| G7 Execution | `run-cycle.mjs` | Every suite in scope ran; none failed or skipped | `test-run/`, `test-run.log` |

**G4.** Prefer removing the hit. Where that is not possible, `determinism-exceptions.md` needs a reason, a per-file `Max`, and (for a wait on an external signal) a bound and an asserted outcome. A fixed `Date` replaces `new Date()` in fixtures; `randomUUID()` as a unique fixture key against the shared database is a standing exception with a per-file cap. The timezone runs apply to the scope's suites; the scope can be widened to the full suites for a release cycle.

**G5.** Report statement, branch, function and line coverage separately, per file and in total, for the scope's source files. Runs are merged per file, so a line counts as covered if any run executed it; a line that only a real-database run covers is classified `COVERED-BY-E2E` automatically. A coverage ignore comment in a scope source file needs an `ignore-comment` row in `coverage-exclusions.md` with the same reason (rule 5); G5 blocks on one without it. Every other uncovered line needs a row in `coverage-line-status.md` with `ADD-TEST`, `UNREACHABLE`, `LOW-VALUE` or `OPEN` and a note; `OPEN` is allowed but counts as a gap. The floor comes from the scope file (`coverageFloor`), which defaults to the changed-code rule in [`implementation.md`](../agents/implementation.md) (100% of changed testable code); a missed floor is reported, and each shortfall is explained by a line status, not left as a bare percentage. Coverage measures what ran, not how well it was checked.

**Changed lines (`linesFrom: "changed-lines"`).** `story-lines.mjs` derives the story's owned lines from origin attribution: a line is owned when the commit that first introduced its content (its origin, replayed commit by commit with `-w` diffs and rename/copy tracking in `line-origin.mjs`) is one of the story's commits (non-merge commits whose subject names the story). Whitespace-only and formatting-only commits keep the origin of the lines they touch, and are listed in `changed-lines.json` as `formattingOnlyCommits`. A multi-story origin commit does not identify an owner, so such a line is excluded by a row in `story-line-corrections.json` with the reason. G5 then measures only the owned lines, and a line that a story does not own is not counted for it.

**G6.** The repository's mutation runners are the executors (`backend/scripts/mutation/`, `frontend/scripts/testing/mutation/`); this gate reads their saved output. A survivor blocks the gate, as in the Test Code Reviewer playbook.

## 8. Metrics report

`report.mjs` renders `<cycle>/metrics.md` from the gate files and compares it with the previous cycle of the same story in `metrics-history.csv`. Sections: 7A header and gate line, 7B execution, 7C coverage by type, 7D coverage by file, 7E coverage quality (mutation), 7F traceability and IDs, 7G spec quality and assumptions, 7H determinism and automation, 7J progress and the next three actions. Items the tooling cannot measure are printed as `NOT MEASURED`, never as zero.

**Overall status.** RED when any gate is not passing, any oracle is `CODE-DERIVED` or `UNTRACEABLE`, an equivalent mutant is killed, or a test ID is unregistered. AMBER when every gate passes but there is an OPEN coverage gap or spec conflict, a missed coverage floor, a pending approval or confirmation, or a tier that is MISSING with a reason. GREEN otherwise.

**Mapping to the review contract** ([`sub-agents.md`](sub-agents.md) section 3):

| Metrics status | Gate result |
|---|---|
| GREEN | `PASS` |
| AMBER | `PASS` only when the Orchestrator has accepted a disposition for each AMBER item; otherwise `BLOCKED` |
| RED with a BLOCKED gate or a red condition | `BLOCKED` |
| RED only because gates are `UNABLE_TO_VERIFY` or `NOT RUN` | `UNABLE_TO_VERIFY` |

## 9. Running a cycle

```bash
# 1. Save the Confluence matrix IDs (one per line) to <cycle>/confluence-matrix-ids.txt
# 2. Real-database suites and mutation need a database built from database/postgresql/init
export DATABASE_URL=postgresql://spm:spm_dev_password@localhost:5432/<db> TEST_DATABASE_URL=$DATABASE_URL
# 3. Run the whole cycle (add --record to append the result to metrics-history.csv)
node ai/scripts/test-workflow/run-cycle.mjs --scope docs/test-cases/workflow/scopes/<story>.json
# Selected steps, or a dry run that only prints the commands
node ai/scripts/test-workflow/run-cycle.mjs --scope ... --steps ids,spec,determinism,records,report
node ai/scripts/test-workflow/run-cycle.mjs --scope ... --skip mutation --dry-run
# Refresh the test records after tests change (adds new tests, drops removed ones, keeps judgement fields)
node ai/scripts/test-workflow/check-records.mjs --scope ... --cycle <dir> --scaffold
```

Order of work (`run-cycle.mjs` follows it): spec conflicts and IDs first (G1, G2), then the determinism scan, the suite and timezone runs with coverage (G4, G7, G5), the mutation runs (G6), the records (G3) and the report. If any gate fails, stop and report it; the cycle is not complete.

Cycle folder: `ids-in-code.txt`, `ids-in-registry.txt`, `confluence-matrix-ids.txt`, `determinism-scan.txt`, `test-run/`, `tz-runs/`, `coverage/<suite>/`, `mutation/<entry>.log`, `mutation-report.md`, `test-records.csv`, `gates/*.json`, `gap-list.md`, `metrics.md`, `cycle.log`, `test-run.log`.

The scripts have their own tests: `node --test "ai/scripts/test-workflow/*.test.mjs"`.

## 10. What the tooling cannot judge

The scripts check structure and arithmetic; people and agents still judge the following, and the record keeps their answer: the tier and oracle class of each test, whether a test can be explained, whether an `N/A` reason is valid, whether an equivalent-mutant argument holds, whether assertions are non-vacuous, and whether a supporting ID is mapped to the right AC. The Confluence matrix has to be fetched by an agent with access. Shared mutable fixtures and tests marked "not automated" are not measured and are reported as such.

## 11. Pre-submit checklist

- [ ] Every number in the report traces to a file in the cycle folder; steps that did not run say `NOT RUN`.
- [ ] G1 to G7 all ran, and each failure is reported with its file.
- [ ] Every test has a record with all required fields, and every `kills` value names a real suite link or mutant.
- [ ] Coverage is reported by statement, branch, function and line, per file and in total; the measured set was compared with the source set; every uncovered line has a status; every exclusion has a reason.
- [ ] No equivalent mutant has a killing test.
- [ ] Open items are counted in the overall status, previous values are shown with the change, and the next three actions name a gate or a metric row.
