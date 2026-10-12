Written for: the story owner and the PO, to decide what remains. Test audit. Production code: one approved text change (see section 21); nothing else.

# Test audit: SPM-39, SPM-61, SPM-62, SPM-63, SPM-120

Branch: `chore/SPM-145-Audit-test-cases-registration-and-clarification`, uncommitted (see Decisions needed). `dev` is untouched. Date: 2026-10-12.

## 1. Pre-Generation Checkpoint

```
Confidence: Medium
Mode: REVIEW (audit), then RED (added unit tests only)
Framework assumptions:
- Runner: Vitest 5.0.0 (backend `vitest run`, frontend `vitest run`). Coverage: Vitest v8 via `--coverage`.
- HTTP helper: Supertest in e2e only (backend/test/*.e2e-spec.ts). Not used by the new unit spec.
- Frontend component helper: React Testing Library + vitest-axe (per frontend/AGENTS.md).
- Mutation: manual harness on a scratch copy (scratchpad/mut). Repo scripts exist (backend/scripts/mutation/run.mjs, frontend/scripts/testing/mutation/run.mjs) but were not run (need DATABASE_URL).
- DB engine: PostgreSQL 15 (docker-compose `postgres` image). Confirmed from database/postgresql/init/*.sql and backend/AGENTS.md. The "MySQL 8.0+" in the guide template is stale for this repo.
- E2E credentials: the container user is `spm` with password `spm_dev_password` (docker-compose/.env.example). backend/.env.example still says `spm:spm`, which is stale.
- Test guide: found at ~/Desktop/test_gen_based_on_ACs/test-code-generation-guide-updated.md. The brief's name (test-code-generation-guide.md) is not in the repo.
Oracle assumptions:
- A-NULL: blank strings for NULL legacy detail columns (VIEW-REG-INFO-03-A-NULL, VIEW-REG-DET-03-A). The AC is silent.
Interface assumptions:
- Route names and error codes are taken from helpers/messages.ts (locked MSG wording) and the in-code comments. Not from Confluence (see Gap List).
Clarifications needed: see section 9.
```

Confidence is Medium, not Low: the five Jira ACs are read directly, and the core rules are testable from them. The Confluence test case pages were not read (Atlassian search returned no test case pages in this session, and the repo's own specs say the source test case documents were absent).

## 2. Scope

Stories are all Jira status **Done**. The repo's status gate (ai/agents/orchestrator.md rule 3) lists To Do / In Progress / In Review for Jira-governed implementation. See Decisions.

| File | Class | Owning story | My lines | Tests found |
|---|---|---|---|---|
| backend/src/registrations/registrations.service.ts | Mine (SPM-61, 62, 63 report, 120) | 61, 62, 63, 120 | whole file | `registrations.service.spec.ts` (new, 38 tests) + `registrations.withdraw.spec.ts` |
| backend/src/registrations/withdrawal/event-start.ts | Mine | 120 | whole | event-start.spec.ts |
| backend/src/registrations/withdrawal/registrations.withdraw.spec.ts | Mine | 120 | n/a | 4 `it` blocks, WITHDRAW-EVENT-REG-03/04/05/07 STATE IDs |
| backend/src/registrations/registration/registration-window.ts | Mine | 61 | whole | registration-window.spec.ts (header says "ASSUMED") |
| backend/src/registrations/registration/dto/validation.ts | Mine | 61 | whole | validation.spec.ts |
| backend/src/registrations/helpers/messages.ts | Mine | 61, 63, 120 | whole | none directly; exercised via service spec |
| backend/src/registrations/helpers/sanitization.ts | Mine | 61 | whole | validation.spec.ts |
| backend/src/registrations/report/*.ts (access, format, export) | Mine | 63 | whole | report-access/format/export specs |
| backend/src/registrations/registrations.controller.ts | Mine | 61, 62, 63, 120 | whole | e2e only |
| backend/src/clarifications/clarifications.service.ts | Mine | 39 | whole | clarifications.service.spec.ts (27 cases, **no test IDs**) |
| backend/src/clarifications/dto/clarification-input.ts | Mine | 39 | whole | clarification-input.spec.ts (7 cases, no IDs) |
| backend/src/clarifications/clarifications.controller.ts | Mine | 39 | whole | controller.spec.ts (1 case, no IDs) |
| backend/src/clarifications/repository/clarifications.repository.ts | Mine | 39 | whole | none in unit; e2e only |
| backend/src/events/events.service.ts | Shared | SPM-40, 83 (approve/reject), SPM-36, SPM-38 | Mine: none found in audit | out of scope |
| frontend/src/features/events/pages/detail/EventDetailPage.tsx | Shared | SPM-40/83/36, 61 (registration section), 120 (withdraw), 39 (clarifications) | my lines: registration section, withdraw, clarifications, registrations modal | out of scope except my sections, not audited in this run |
| frontend/src/features/events/pages/list/EventListPage.tsx | Shared | SPM-38, SPM-61 (attendee filters) | not audited | out of scope |
| frontend/src/store/useAppStore.ts | Shared, no owner | none | n/a | out of scope (brief 3.2) |
| frontend/src/features/events/pages/detail/registration/* | Mine | 61, 62, 120 | whole | colocated `.test.tsx` files (not re-run this session) |
| frontend/src/features/registrations/** | Mine | 63 | whole | colocated `.test.tsx` files (not re-run this session) |
| frontend/src/features/events/lib/registration.ts | Mine | 61 | whole | registration.test.ts |

Out of scope for this run, because they are other owners' lines or not audited: SPM-36, SPM-38, SPM-40, SPM-83, SPM-99, SPM-138; the Venue pages (other stories, which also carry some legacy REG-* IDs); useAppStore.ts.

## 3. Findings

Severity: High = AC untested or test can never fail; Medium = weak oracle, missing boundary or sad path; Low = naming, header, stale comment.

| # | Story | File / Test ID | Dimension | Severity | Finding | Action taken | Status |
|---|---|---|---|---|---|---|---|
| F1 | 61, 62, 63 | backend/src/registrations/registrations.service.ts: register, findMine, getReport | G, A | High | No unit test called these three methods. Unit line coverage of the file was 40.3%; the rest was reachable only from the PostgreSQL e2e suite, which does not count. | New spec `registrations.service.spec.ts` (38 tests). | Fixed |
| F2 | 61 | register(): window boundary | C | Medium | Opening instant as inclusive not pinned at service level (mutant `<=` for `<` survived). | Added EVENT-REG-01-BND-1 (2 cases). | Fixed |
| F3 | 61 | register(): window status rule | C | Medium | Dropping the "Confirmed only" rule survived: Completed and Cancelled events (visible to attendees) would be registrable. | Added EVENT-REG-02-A (2). | Fixed |
| F4 | 120 | requireEmptyBody | C | Medium | Valid empty `{}` body on withdraw was never exercised at unit level (dropping the accept branch was not caught). | Added WITHDRAW-EVENT-REG-03-A. | Fixed |
| F5 | 63 | getReport(): unknown event | A, C | Medium | No test for 404 on an unknown event. | Added VIEW-REG-INFO-05-A (5). | Fixed |
| F6 | 62, 63 | record() / getReport(): NULL legacy details and special requirements | B | Medium | Legacy rows (SPM-99, nullable detail columns per migration 004) were untested. | Added VIEW-REG-INFO-03-A, VIEW-REG-INFO-03-A-NULL, VIEW-REG-DET-02-A. Expected blanks are ASSUMPTION A-NULL. | Fixed; PO to confirm A-NULL |
| F7 | 61 | register(): row lock | C | Medium | Lock removal was caught only by a SQL-text check (first statement is FOR UPDATE). That is a weak oracle: it proves the statement is issued, not that concurrent requests serialise. | Kept (documented in the test comment). Real concurrency is covered by EVENT-REG-05-B in the e2e suite, which passed (section 14). | Partly mitigated (see Gap List G3) |
| F8 | 39 | clarifications.service.spec.ts, clarification-input.spec.ts, controller.spec.ts | A | Medium | 35 unit cases carry no test case ID. Test IDs CLAR-01-* / CLAR-02-* live only in backend/test/clarifications.e2e-spec.ts. Traceability cannot be checked from unit tests. | Not changed in this run. | Open (Gap G1) |
| F9 | 39 | clarifications.repository.ts | G | Medium | 12.5% lines in unit tests, 0 functions covered. Only e2e reaches it. | Not changed. | Open (Gap G2) |
| F10 | 63 | frontend/src/features/events/pages/detail/EventDetailPage.registrationsModal.test.tsx | A | Low | Still uses the superseded `REG-AC*` / `REG-DETAIL-*` prefix (brief section 4.1 says these are superseded). | Not changed. | Open |
| F11 | 61 | docs/specs/SPM-61-test-results.md | A | Low | Points to `backend/src/registrations/registrations.e2e-spec.ts`. The real file is `backend/test/registrations.e2e-spec.ts`. Says Test Case IDs are ASSUMED. | Not changed (docs outside test scope). | Open |
| F12 | 62 | SPM-62 AC2 vs schema | Spec drift | Medium | AC2 says statuses include "Cancelled, etc.". The table CHECK only allows `Registered` / `Withdrawn` (database/postgresql/init/003). A4 assumed Confirmed/Withdrawn/Cancelled. The implementation has no registration Cancelled status. | No test added for Cancelled registration. | Decision needed (PO) |
| F13 | 61 | window bounds optional | Spec drift | Low | The SPM-61 spec (docs/specs) says a missing window bound is unbounded on the server. The code's `?? null` arms (registrations.service.ts lines 65-66) are therefore untested. | Left uncovered, see section 4. | Decision needed (PO) |
| F14 | 120 | Waiting list | Spec drift | None | Current SPM-120 Jira ACs (AC1-AC6) contain no waiting-list behaviour. Commit history removed AC7/waiting list. Confirmed, no tests reference waitlist as behaviour. | None. | Clean |

No suspected production defect was found. No test is skipped because of a defect (section 8 of the brief).

## 4. Coverage (unit and component only; my lines)

| File | Lines before | Lines after | Branches before | Branches after | Uncovered branches and reason |
|---|---|---|---|---|---|
| backend/src/registrations/registrations.service.ts | 40.27% | **100%** | 40.96% | **97.59%** | Lines 65-66: `registration_opens_at ?? null` and `registration_closes_at ?? null` when a bound is absent. Reason: unbounded window is an open PO decision (F13). |
| backend/src/clarifications/clarifications.service.ts | 97.43% | 97.43% (not changed) | 85.93% | 85.93% | Not audited for branches in this run (Gap G1). |
| backend/src/clarifications/repository/clarifications.repository.ts | 12.5% | 12.5% | 50% | 50% | Not changed (Gap G2). |
| backend/src/registrations/withdrawal/event-start.ts | 100% (baseline) | 100% | 100% | 100% | none |
| backend/src/registrations/registration/registration-window.ts | 100% (baseline) | 100% | 100% | 100% | none |
| backend/src/registrations/registration/dto/validation.ts | 100% (baseline) | 100% | 100% | 100% | none |
| backend/src/registrations/report/report-access.ts | 100% (baseline) | 100% | 100% | 100% | none |
| backend/src/registrations/helpers/messages.ts | 57.14% | **100%** | 100% | 100% | none (formatSgt and the registration messages are now reached by the new spec) |
| frontend files in scope | — | — | — | — | Not re-run or re-measured in this run. Frontend code was not changed. Baseline in docs/test-audit/baseline/frontend-unit-cov.txt. |

Coverage figures come from `vitest run --coverage` in backend. Backend totals: baseline 1073 tests; after 1111 tests (+38), all passing.

## 5. Evidence Table (new or changed tests)

| Test ID | AC | Level | Oracle source | Mutant it kills (`Kills:` in code) |
|---|---|---|---|---|
| EVENT-REG-03-A | AC3, AC4 | Unit | AC3/AC4 and MSG wording (messages.ts) | Swapped name/email; attendee id from body |
| EVENT-REG-03-A (2) | AC3 | Unit | AC3 | Empty string stored instead of NULL |
| EVENT-REG-01-B | AC1 | Unit | AC1; 20 Oct 10:00 SGT literal | Window check moved after INSERT |
| EVENT-REG-01-BND-1 | AC1 | Unit | Inclusive open (D6) | `<=` for `<` in not-yet-open |
| EVENT-REG-02-A | AC2 | Unit | AC2; exclusive close | `>` for `>=` in closed check |
| EVENT-REG-02-A (2) | AC1/AC2 | Unit | Confirmed-only rule | Confirmed-only rule dropped |
| EVENT-REG-05-A | AC5 | Unit | AC5 | Duplicate check removed |
| EVENT-REG-05-A (2) | AC5 | Unit | AC5 | Upsert miss reported as success |
| EVENT-REG-05-C | AC5 | Unit | Capacity boundary N-1, N | `>` for `>=` in capacity |
| EVENT-REG-05-C (2) | AC5 | Unit | Capacity boundary | Fourth place allowed |
| EVENT-REG-05-C (3) | AC5 | Unit | Lock and per-event count | Lock dropped (weak: see F7) |
| EVENT-REG-05-SEC-1 (1-4) | Auth | Unit | Role and visibility rules | Role guard removed; draft visible |
| EVENT-REG-03-D | AC3 | Unit | Strict body (D15) | Validation moved inside transaction |
| WITHDRAW-EVENT-REG-03-A | AC3, AC5 | Unit | AC3/AC5; message literal | Empty body rejected |
| VIEW-REG-DET-02-A (1-2) | AC2 | Unit | AC2; SPM-120 AC6 | Withdrawn row hidden; withdrawnAt dropped; status mapping |
| VIEW-REG-DET-03-A | AC3 | Unit | AC3; A-NULL | Requirements dropped; NULL shown as "null" |
| VIEW-REG-DET-01-A (1-2) | AC1 | Unit | Caller scoping | Owner filter dropped; any attendee reads |
| VIEW-REG-DET-01-A (3) and VIEW-REG-DET-04-A | AC1, AC4 | Unit | null for none; visible-status list | Error thrown instead of null; Completed/Cancelled dropped from the lookup |
| VIEW-REG-INFO-02-A (1-3) | AC2 | Unit | Count and availableSpots literals | Spaces unclamped |
| VIEW-REG-INFO-03-A | AC3 | Unit | Requirements in report | Requirements dropped |
| VIEW-REG-INFO-03-A-NULL | AC3 | Unit | A-NULL | Literal "null" shown |
| VIEW-REG-INFO-05-A (1-5) | AC5 | Unit | AC5; assigned coordinator / owning organiser | Access check bypassed; role not checked; unknown event not 404 |

Mutation kills are recorded in section 8. Every new test has a `Kills:` or inline "Kills" comment.

## 6. Review Checklist (guide 10C)

| Question | Answer |
|---|---|
| Does every new test trace to an AC? | Yes. |
| Does every new test have a plausible failing implementation? | Yes. Verified by mutation (section 8). |
| Can each setup, action and expected result be explained? | Yes. |
| Are expected values justified independently of the code? | Yes, except A-NULL (assumption). |
| Deterministic and non-vacuous? | Yes. Fixed clock (T0), no real time, scripted DB, no order dependence. Two repeats and one shuffled run: 1111 passed each time. |

## 7. Gap List

- **G1 (SPM-39):** clarification unit tests have no IDs and no ID-to-AC map. Needs IDs (CLAR-01-*, CLAR-02-*) and a traceability matrix. Not done.
- **G2 (SPM-39):** `clarifications.repository.ts` has 12.5% line coverage in unit tests. Only e2e reaches it. Not done.
- **G3 (SPM-61):** the row-lock check is a SQL-text assertion. Real serialisation is proven by EVENT-REG-05-B (five concurrent POSTs, one 201, four 409), which passed in the PostgreSQL e2e run (section 14).
- **G4 (SPM-62 / SPM-63 frontend):** not audited in this run. Frontend lines in scope were not re-measured.
- **G5 (SPM-120, SPM-63):** the repo mutation harnesses were run; results in section 15.
- **G6 (traceability matrices, section 7.3 of brief):** per-story matrices are not written. The ACs and test coverage above are the basis, but a full AC-to-test matrix per story was not finished.
- **G7 (Confluence drafts, 7.4):** drafts for the 38 new cases are in `confluence-test-cases/SPM-61-62-63-120.md`. Not published. Confluence test case pages were not located.

## 8. Mutation results (scratch copy, `scratchpad/mut`; originals never edited)

Mutants applied to a copy of `backend/src` (`registrations.service.ts`, `registration-window.ts`) and run against `registrations.service.spec.ts`.

| Mutant | Result |
|---|---|
| M1 capacity `>=` to `>` | Killed |
| M2 close inclusive | Killed |
| M3 row lock removed | Killed (weak, F7) |
| M4 duplicate check removed | Killed |
| M5 attendee role guard removed | Killed |
| M6 name and email swapped | Killed |
| M7 findMine status list narrowed | Killed (after the spec used exact status list) |
| M8 report access check bypassed | Killed |
| M9 availableSpots not clamped | Killed |
| M10 Confirmed-only window rule dropped | Survived first; **killed after EVENT-REG-02-A (2)** |
| M11 optional contact stored as '' | Killed |
| M12 withdrawn row reported as registered | Killed |
| M13 closed check dropped | Killed |
| M14 open instant exclusive (`<=`) | Survived first; **killed after EVENT-REG-01-BND-1** |
| M15 findMine `LIMIT 1` to `LIMIT 2` | **Equivalent**: the service reads only rows[0]; no observable change |
| M16 findMine ignores the caller | Killed |
| M17 getReport unknown event not 404 | Killed |
| M18 empty-object withdraw body rejected | Killed |
| M19 legacy NULL name shown as "null" | Killed |
| M20 requirements always present | Killed |
| M21 requirements dropped in report | Killed |
| M22 findMine legacy name shown as null | Killed |

Totals: 22 mutants, 21 killed, 1 equivalent (M15), 0 non-equivalent survivors. The mutation run was a manual harness; the repo's own mutation scripts were not run (see G5).

## 9. Assumption index and PO decisions

| Assumption | Used by | Needs PO |
|---|---|---|
| A-NULL: NULL legacy details display as blank text; no requirements line when NULL | VIEW-REG-INFO-03-A-NULL, VIEW-REG-DET-03-A | Yes |
| A4 (registration status Confirmed/Withdrawn/Cancelled) | Not used by any new test. The schema allows only Registered/Withdrawn. | Yes (F12) |
| A5 (re-register after withdrawal), A7 (cut-off = start time), A8 (report excludes Withdrawn) | Covered by existing specs; not re-checked in this run beyond the report query filter (status = 'Registered'). | No, already in place |

## 10. Suspected defects and spec drift

- **No suspected production defect.**
- **Spec drift F12:** SPM-62 AC2 mentions a "Cancelled" registration status; the schema and code do not have one.
- **Spec drift F13:** SPM-61 unbounded window is an open decision in the repo spec, untested.
- **Spec drift F14:** none for SPM-120 waiting list (clean).

## 11. Spec drift notes (brief section 4.3)

- SPM-120 suite counts: the brief reports 11 vs 23 in different documents. Counted in this run: the withdrawal unit spec has 4 `it` blocks; the withdrawal e2e spec has 38 lines that carry a withdrawal ID. No reconciliation against Confluence was possible.
- SPM-39 rewritten ACs: the current Jira ACs are five (AC2 merged the blank and error cases). The unit clarification tests cover blank and whitespace input (AC2), the thread entry with name and time (AC3 partly), and the status flag for awaiting reply (AC5). The thread-history AC4 and the indicator in the UI were not audited in this run.
- SPM-63 Coordinator and Organiser: the access rule covers both roles (VIEW-REG-INFO-05-A), so the earlier Coordinator-only suites are not an issue in the backend.

## 12. Run commands used

```
cd backend && npx vitest run                      # 44 files, 1111 passed (after), 1073 (baseline)
cd backend && npx vitest run --sequence.shuffle   # 1111 passed
cd backend && npx vitest run --coverage           # coverage summary (baseline and after)
cd backend && npm run lint                        # exit 0
cd frontend && npx vitest run --coverage          # baseline only: 62 files, 871 passed, 1 todo (not re-run)
```

E2E (added after Docker was started; see section 14): `npx vitest run --config ./vitest.config.e2e.ts` with `DATABASE_URL` pointing at the fresh `spm_audit_e2e` database.
Mutation (repo harness, section 15): `node scripts/mutation/run.mjs` (SPM-120) and `node scripts/mutation/run.mjs --mutants spm63.mutants.mjs` (SPM-63), run in the backend with `DATABASE_URL` set.

## 13. Decisions needed

1. **Jira status gate:** all five stories are Done. The repo gate (ai/agents/orchestrator.md) lists only To Do / In Progress / In Review for Jira-governed implementation. The new tests were written under your explicit request. Confirm whether to proceed on Done stories, or move them.
2. **Commit:** the work is uncommitted on a new branch. AGENTS.md says do not commit without authorisation. Confirm and I will commit per story (or as one commit), not push.
3. **A-NULL:** confirm blank display for NULL legacy details (F6).
4. **F12:** does SPM-62 AC2 "Cancelled" mean a registration status, or an event status? If registration status, it is unimplemented.
5. **Window bounds (F13):** is an unbounded registration window allowed?
6. **Remaining scope:** SPM-39 unit IDs and repository coverage (G1, G2), frontend re-measurement (G4), e2e run (needs Docker). Continue, or stop here?

## 14. E2E results (PostgreSQL, Docker compose `postgres`)

Database: fresh `spm_audit_e2e`, built the same way compose builds `spm`: `database/postgresql/init/*.sql` in order, then `backend/migrations/001_event_drafts.sql`. The pre-existing `spm_test` database was left untouched (it has a partial schema and 5 events of unknown origin). `spm` (dev data) was not used.

| Run | Suites | Result |
|---|---|---|
| Story suites: registrations, registrations.withdraw, registrations.report, clarifications | 4 files | 123 passed, 1 todo (EVENT-REG-01-C [B], manual close, Blocked by design in the repo spec) |
| Full backend e2e | 16 files | 244 passed, 11 failed, 1 todo |

The 11 failures are all in `test/drafts.e2e-spec.ts` (SPM-37, another owner's story). They fail with `401 Unauthorized` where the test expects `404`, so the test's session setup is not what it expects. The earlier audit notes record the same 11 failures before this work. Not investigated further (out of scope).

Repeat run of the four story suites is pending (determinism, see section 6).

Schema conflict found: `backend/migrations/003_event_rejection.sql` narrows `events.status` to `Submitted, Under_Review, Approved, Rejected`. This drops `Planning`, `Confirmed`, `Completed` and `Cancelled`, which the init schema and the current code use. Applying it to an init-built database fails on existing rows. Compose only mounts `backend/migrations/001`, so the conflicting migrations are not part of the local stack. Recorded as Gap G8.

Config note: the container password is `spm_dev_password`. `backend/.env.example` says `spm:spm`, which does not work against the compose stack.

## 15. Fault-injection results (repo harnesses, run on scratch copies)

Command: `node scripts/mutation/run.mjs` (backend, SPM-120 mutants) and `node scripts/mutation/run.mjs --mutants spm63.mutants.mjs` (backend, SPM-63 mutants). Both need `DATABASE_URL`. The harness reports that the original files were untouched (sha256 check).

| Harness | Mutants | Killed | Equivalent | Survived | Exit |
|---|---|---|---|---|---|
| SPM-120 (`spm120.mutants.mjs`) | 16 | 16 | 0 | 0 | 0 |
| SPM-63 (`spm63.mutants.mjs`) | 44 | 42 | 2 | 0 | 0 |

Equivalents (not killable by any test; reasoning in the harness):
- SPM-63 M1, status filter `= 'Registered'` changed to `<> 'Withdrawn'`: the CHECK constraint allows only Registered and Withdrawn (Q8).
- SPM-63 M6a, service backstop 401 changed to 403: the authentication middleware answers 401 first.

Outputs: `docs/test-audit/baseline/backend-mutation-spm120.txt`, `backend-mutation-spm63.txt`.

Mutation scope for this audit: the new SPM-61 unit spec (section 8) and the repo's SPM-120 and SPM-63 harnesses. Frontend mutation harnesses (`frontend/scripts/testing/mutation/`) were not run.

## 16. Updated summary

| Check | Before this run | Now |
|---|---|---|
| Backend unit (Vitest) | 1073 passed | 1111 passed, 2 repeats and 1 shuffled run identical |
| Backend lint | not reported | exit 0 |
| Frontend unit | 871 passed, 1 todo | unchanged, re-run 871 passed, 1 todo |
| Story e2e (registrations, withdraw, report, clarifications) | not run (Docker down) | 123 passed, 1 todo; repeat identical |
| Full backend e2e | not run | 244 passed, 11 failed (SPM-37 drafts, pre-existing, 401), 1 todo |
| `registrations.service.ts` unit line / branch | 40.3% / 41.0% | 100% / 97.6% |
| Mutation: new unit spec (scratch) | none | 22 mutants: 21 killed, 1 equivalent |
| Mutation: repo SPM-120 harness | not run | 16/16 killed |
| Mutation: repo SPM-63 harness | not run | 42/44 killed, 2 equivalent |
| Production files changed | none | none (`git diff dev -- backend/src frontend/src backend/test` empty) |

## 17. Next steps (in order)

1. **Decide on commits (you):** the work is uncommitted on `chore/SPM-145-…`. Approve and I commit per story. Nothing is pushed.
2. **Confirm the Jira status exception (you):** all five stories are Done; the repo gate lists To Do / In Progress / In Review only.
3. **Confirm A-NULL (PO):** blank display for NULL legacy details.
4. **Resolve spec drift (PO):** SPM-62 AC2 "Cancelled" registration status (F12); unbounded registration window (F13).
5. **SPM-39 (me, if approved):** add CLAR-* IDs to the clarification unit specs (G1), and unit-test `clarifications.repository.ts` (G2).
6. **Frontend (me, if approved):** remove the legacy `REG-AC*` IDs from `EventDetailPage.registrationsModal.test.tsx` (F10); run `frontend/scripts/testing/mutation/` for SPM-63 and SPM-120 (not run).
7. **Backend migration conflict (dev team):** `backend/migrations/003_event_rejection.sql` and `004` conflict with the init schema's status values (section 14). Decide whether these files are stale before anyone applies them to a live volume.
8. **SPM-37 drafts (other owner):** the 11 failing `drafts.e2e-spec.ts` tests return 401 where 404 is expected. Raise with the owner.
9. **Docs (dev team):** `backend/.env.example` credentials are stale (`spm:spm`). `docs/specs/SPM-61-test-results.md` has stale paths (F11).
10. **Publish Confluence drafts (you):** review `docs/test-audit/confluence-test-cases/SPM-61-62-63-120.md` and publish manually. Nothing was written to Confluence or Jira.

## 18. SPM-39 test case map (comments added, tests unchanged)

Source: the "SPM-39 Test Cases" document (REQ-CLAR-01-A/B/C, 02-A/B). Each test file now has a header map and per-test comments with the case ID and AC. Comment-only change; the three SPM-39 test files still pass (backend unit 40, e2e clarifications 8, frontend 7).

| Case | AC | Backend unit | Backend e2e | Frontend |
|---|---|---|---|---|
| REQ-CLAR-01-A | AC1 | `clarifications.service.spec.ts` "accepts a valid message..." | `clarifications.e2e-spec.ts` REQ-CLAR-01-A | `EventDetailPage.clarifications.test.tsx` REQ-CLAR-01-A |
| REQ-CLAR-01-B | AC2 | `clarifications.service.spec.ts` "rejects a blank message..."; `dto/clarification-input.spec.ts` "rejects a blank message" | REQ-CLAR-01-B | REQ-CLAR-01-B |
| REQ-CLAR-01-C | AC2 | `clarifications.service.spec.ts` "rejects a whitespace-only..."; `dto/clarification-input.spec.ts` "rejects a whitespace-only message" | REQ-CLAR-01-C | REQ-CLAR-01-C |
| REQ-CLAR-02-A | AC3, AC4 | `clarifications.service.spec.ts` "returns the thread for the assigned coordinator" (weak: length only) | REQ-CLAR-02-A | REQ-CLAR-02-A |
| REQ-CLAR-02-B | AC5 | `clarifications.service.spec.ts` "accepts a valid message..." (flag only) | not covered | REQ-CLAR-02-B (runs as the Organiser; no real-time update) |

Discrepancies between the document and the repo (not changed in the tests; for the PO and the document owner):
1. File paths in the document are `frontend/src/pages/...`. The real path is `frontend/src/features/events/pages/detail/...`.
2. Counts: the document says e2e 15/15 and frontend 6/6. The repo has 8 e2e tests and 7 frontend tests.
3. Error text: the document expects "Clarification message is required". The code returns "Clarification message cannot be blank." (`clarifications.service.ts:45`).
4. Test environment: the document says Firebase Auth Emulator. The e2e suite uses PostgreSQL-backed sessions.
5. REQ-CLAR-02-B: the document describes a WebSocket real-time update. No WebSocket code exists in the repo. The frontend test checks the "Pending" badge with mocked responses only.
6. REQ-CLAR-02-B role: the test is named for the Coordinator but runs as the Organiser (`organiser-1`).
7. REQ-CLAR-02-B after reply: the test expects "Pending" to remain after the Organiser replies. AC5 ("awaiting the Organiser's reply") suggests it should clear. Open PO question.
8. REQ-CLAR-02-B has no backend e2e test, although the document lists E2E + Integration for it.
9. REQ-CLAR-03 is in the repo but not in the document.
10. Older AC numbers in `clarifications.service.spec.ts` comments (AC2/AC3, AC4/AC5, AC7) do not match the current five SPM-39 ACs.
11. The unit thread-listing test asserts only the length of the thread (weak for REQ-CLAR-02-A).

Gap G1 status: the SPM-39 unit tests now carry the REQ-CLAR-* IDs in comments. A formal traceability matrix is still not written.

## 19. SPM-39 follow-up: decisions applied

| Item | Decision | Applied |
|---|---|---|
| Coordinator view of REQ-CLAR-02-B | Test both views | Frontend: Organiser test renamed "(Organiser view)"; new "(Coordinator view)" test (Pending (1), no Answered). |
| No real-time update | Intentional | Removed from the discrepancy list. |
| "Pending" after reply | Keep. A reply does not clear it; only resolve does. | Frontend unchanged. Backend e2e pins it (`awaiting_reply` cleared only by resolve). |
| Error text | Match the document | Production change: `clarifications.service.ts` and `ClarificationThread.tsx` now say "Clarification message is required". Two frontend assertions updated. Reply text ("Reply message cannot be blank.") unchanged; the document does not cover it. |
| Counts | Update | e2e clarifications 8 to 9; frontend clarifications 7 to 8. Backend clarification unit files: 40 tests. The document's "15/15" and "6/6" are not used. |
| Missing e2e for REQ-CLAR-02-B | Add | New e2e test: awaiting reply for both parties before, after a reply, and only cleared after resolve. |
| REQ-CLAR-03 | Keep as extra | Labelled as not in the document. |
| Weak thread-listing test | Strengthen | Unit test now checks order (repository order kept), author, role, message, flags and timestamps with literal values. |
| Stale AC numbers | Match the five ACs | Service spec: AC9 to AC1 (assigned coordinator); "AC7/AC8 (inferred addition)" labelled as reply notification, not an SPM-39 AC. E2E: AC6 notification comments labelled as not an SPM-39 AC; AC7/AC8 to AC4. |
| Wrong paths and environment | Later, on your request | Not changed. |

Verification:
- Backend unit (`clarifications`): 40 passed. Full backend unit: 1111 passed.
- E2E clarifications: 9 passed. Full backend e2e: 245 passed, 11 failed (SPM-37 drafts, pre-existing), 1 todo.
- Frontend clarifications: 8 passed. Eslint on the two frontend files: clean. Backend lint: exit 0.
- Mutants on scratch copies: reversed thread order (killed by the new unit test); author role swapped (killed); resolve no longer clears `awaiting_reply` (killed by the new e2e test).
- Full frontend suite: flaky under load. Without my frontend edits it also failed 3 to 5 tests (timeouts in EventCreatePage, VenueCreatePage, VenueUnavailabilityPanel, EventDetailPage.planning). The same files pass when run alone. Load average was about 13 during these runs. Not caused by these changes, but not fixed either.

Production change: this audit was test-only until this follow-up. The error text in `clarifications.service.ts:45` and `ClarificationThread.tsx:60` changed as you asked. Review that diff before committing.

## 20. Frontend suite flakiness under load: fixed

Symptom: the full frontend run failed 3 to 7 tests per run (timeouts and missing elements in EventCreatePage, VenueCreatePage, VenueUnavailabilityPanel and EventDetailPage.planning). Each file passed alone.

Causes (from the saved run output):
1. Per-test timeout: the default 5000ms was too short for form-heavy tests that render a full page and type through it. Under CPU contention a single test took 4 to 5 seconds on its own.
2. Testing Library's default 1000ms budget for `findBy*` and `waitFor` was too short for a page to render under load (EVENT-VIEW-01-A).
3. Per-keystroke delay: 201 `userEvent.setup()` calls use the default delay. Removing it from the three failing files did not fix the failures alone, but it cuts the time per test.

Changes (shared test infrastructure only; no assertions weakened):
- `frontend/vitest.config.ts`: `testTimeout: 20000` with a comment. This is the config Vitest actually reads (it takes precedence over `vite.config.ts`).
- `frontend/src/test/setup.ts`: `configure({ asyncUtilTimeout: 5000 })`.

Owner-file edits (follow-up): the per-keystroke `delay: null` and `findByText` edits in `EventCreatePage.test.tsx`, `VenueCreatePage.test.tsx` and `VenueUnavailabilityPanel.test.tsx` were reverted to their `dev` contents. Those files belong to SPM-36 and SPM-50/122. The shared config alone is sufficient (see Verification in section 22).

Verification (machine load average about 10 to 12 from an unrelated Python job, `preprocess_celeba.py`, plus editor processes; not stopped):
- Full frontend suite: 4 consecutive runs, 872 passed, 1 todo, 0 failed (before: 3 to 7 failed per run).
- `npm run lint` (`eslint .`): exit 0. The two pre-existing lint errors are no longer reported.

Not changed: `vmThreads` pool in `vitest.config.ts`. It was added deliberately in commit 8d008ae ("speed up vitest").

## 21. Approved production exception

The brief's acceptance criterion 5 requires no production change. You approved one text change, and it is the only production change against `dev`:

```diff
# backend/src/clarifications/clarifications.service.ts
-    const message = validateMessage(body, 'Clarification message cannot be blank.');
+    const message = validateMessage(body, 'Clarification message is required');

# frontend/src/features/events/pages/detail/ClarificationThread.tsx
-      setDraftError("Clarification message cannot be blank.");
+      setDraftError("Clarification message is required");
```

Reply text ("Reply message cannot be blank.") is unchanged. The change is in commit `b5f470a` on `chore/SPM-145-…`, which is already on `origin`. It has not been split out into its own commit. Reporting it in the PR description as an approved exception is required.

## 22. Follow-up: owner files reverted; config-only verification

- Owner files reverted to `dev` (working tree): `EventCreatePage.test.tsx` (SPM-36), `VenueCreatePage.test.tsx` and `VenueUnavailabilityPanel.test.tsx` (SPM-50/122). They now match `dev` exactly.
- Config only (`vitest.config.ts` `testTimeout: 20000`, `setup.ts` `asyncUtilTimeout: 5000`, owner files at `dev`):
  - 4 consecutive full frontend runs: 872 passed, 1 todo.
  - Stress: 2 rounds of 2 concurrent full runs (load average 12 to 13): 4 of 4 green, 872 passed each.
- Evidence the config is the fix: with the owner-file edits applied but the config unchanged, the suite still failed 3 to 5 tests per run under load (section 20).
- Earlier `delay: null` and `findByText` edits did not fix the failures alone.

## 23. Coverage (unit and component only; my lines), final

Backend (`vitest run --coverage`, 1135 tests):

| File | Lines | Branches | Uncovered branches and reason |
|---|---|---|---|
| clarifications/clarifications.controller.ts | 100% | 75% | `@Controller('api')` conditional: TypeScript decorator output, not application logic. |
| clarifications/clarifications.service.ts | 100% | 98.4% | `@Injectable()` conditional: decorator output. |
| clarifications/dto/clarification-input.ts | 100% | 100% | none |
| clarifications/repository/clarifications.repository.ts | 100% | 50% | `@Injectable()` conditional: decorator output. Repository SQL and parameters are covered by clarifications/repository/clarifications.repository.spec.ts (new, 9 tests). |
| registrations/registrations.service.ts | 100% | 97.6% | Lines 65-66: `registration_opens_at ?? null` and `registration_closes_at ?? null` when a bound is absent. Open PO decision (unbounded window, see section 3, F13). |
| registrations/report/report-format.ts | 100% | 87.5% | Line 30: `parts.find(...)?.value ?? ''`. The date options always produce every part, so the fallback cannot run. |
| registrations/report/export.service.ts | 100% | 100% | none (empty-report PDF and ExportService methods now covered) |
| registrations/helpers/messages.ts, sanitization.ts, registration-window.ts, dto/validation.ts, report-access.ts, event-start.ts | 100% | 100% | none |

Frontend (`vitest run --coverage`, 911 tests, 1 todo):

| File | Remaining uncovered | Reason |
|---|---|---|
| events/pages/detail/ClarificationThread.tsx | Labels and avatar for a clarification authored by an Organiser (lines 175, 214, 224); two colour-class arms (211, 245) | Only a Coordinator can create a clarification (backend `createClarification` sets `authorRole: 'coordinator'`), so the Organiser arm cannot be reached through the API. Colour classes are presentational and not asserted. |
| events/pages/detail/registration/WithdrawalConfirmation.tsx | Line 47: `if (!panel) return;` | The Escape listener is removed on unmount and the panel is mounted for the component's lifetime, so the guard cannot run. |
| registrations/lib/registrationReport.ts | Line 71 and the implicit else at 68 | `FilterType` is a closed union (`all`, `today`, `special-requirements`); the last return cannot be reached. |

Covered in this pass (new tests): clarification service not-found paths and author-name fallbacks; repository SQL and parameters; CSV/PDF empty report and ExportService; DTO non-object bodies; ClarificationThread (errors, filter, empty states, labels, coordinator reply); report download (network, 5xx, 4xx JSON and non-JSON, filename); report hooks (export 401 and error text, load error text, late 401 after unmount); modal (partial bounds, empty contact, load error with Retry); registration section and form (1 spot, optional rows, double-submit guard, server validation without fields, focus fallback, failed reload after conflict).

## 24. Mutation results

| Check | Scope | Mutants | Killed | Equivalent | Survived |
|---|---|---|---|---|---|
| Scratch, new registrations spec | registrations.service.ts | 22 | 21 | 1 (M15) | 0 |
| Scratch, new clarification tests (section 22 and 19) | service, e2e | 3 | 3 | 0 | 0 |
| Scratch, new frontend tests (section 21 follow-up) | hooks, download, modal, section, form | 8 | 8 | 0 | 0 |
| Repo harness, backend SPM-120 | backend withdrawal | 16 | 16 | 0 | 0 |
| Repo harness, backend SPM-63 | backend report | 44 | 42 | 2 (M1, M6a) | 0 |
| Repo harness, frontend SPM-63 (after fixes) | frontend report | 25 | 25 | 0 | 0 |
| Repo harness, frontend SPM-120 (after fixes) | frontend withdrawal | 29 | 28 | 1 | 0 |

Frontend harness fixes (test tooling, not production):
- Stale targets repointed to the current code: SPM-63 X8 and X17 (SGT formatting moved to `src/utils/sgtDate.ts` and `registrationReport.ts`), X19 (export error handling moved to `useReportExport.ts`); SPM-120 M8-fe and M21 (`src/utils/sgtDate.ts`).
- SPM-63 suite group now includes `registrationReport.download.test.ts`, which had been missing.

Test strengthening found by the harness:
- X21 (first-load failure not retryable) survived. The existing retry test passed because the 5-second poll refetched on its own. It now asserts the refetch immediately after Retry is clicked. The modal retry test was given the same check.

Frontend mutant results in `docs/test-audit/baseline/frontend-mutation-spm63*.txt` and `frontend-mutation-spm120*.txt`.

## 25. Review of existing tests (dimensions A-H, sampled)

Anti-pattern scan over the in-scope test files (31 files):
- `toBeDefined`/`toBeTruthy`: 3 weak assertions, all replaced by exact checks: a clarification status test (now checks type, awaiting reply and resolved), the registration service 1-ms-before-close test (now checks status), and the e2e registration id (now equals the stored row's id).
- `toHaveBeenCalled()`: 31 uses, each paired with an outcome assertion (returned value, rendered text, or stored row). No mock-only test found.
- `not.toThrow()`: 6 uses; checked as part of outcome assertions.
- Skipped tests: none. Todos: 1 frontend (blocked by design in the repo spec) and EVENT-REG-01-C [B] (manual close, blocked by design).
- No `Date.now()`, `Math.random()`, real timers, console logging or snapshots in in-scope tests.

Dimension A (traceability) and B (oracles): the new tests carry AC or test-case IDs. Existing headers that cite superseded AC numbers were relabelled (section 19). The thread-listing unit test now verifies order, author, role, message, flags and timestamps.

Not done in this pass: a line-by-line review of every frontend SPM-62, SPM-63 and SPM-120 test. Those files were run and mutation-checked, but not fully read for weak assertions.

## 26. Determinism

| Run | Result |
|---|---|
| Backend unit, normal order, two runs | 1135 passed both times |
| Backend unit, shuffled | 1135 passed |
| Frontend unit, normal order | 911 passed, 1 todo |
| Frontend unit, shuffled | 911 passed, 1 todo |
| Frontend unit under stress (two concurrent runs, load average 12-13), 4 runs | 872 passed each (before the coverage tests; config-only fix, section 22) |
| Story e2e (registrations, withdraw, report, clarifications), runs A and B | 124 passed, 1 todo, identical |
| Full backend e2e | 245 passed, 11 failed (SPM-37 drafts, pre-existing, not my story, not edited), 1 todo |

Database: `spm_audit_e2e`, built from the init scripts and `backend/migrations/001`. Docker was stopped during part of the session (PostgreSQL unreachable), which is why the earlier e2e results came from a restored run; the stack is up again.

## 27. Remaining items before wrap-up

- Decision on the commit `b5f470a` on `origin` (see the earlier question). Nothing has been rewritten.
- Decision on the 3 owner-file reverts (uncommitted in the working tree).
- Items 5 and 6 (traceability matrices and Confluence drafts for SPM-39 and the rest) are for later, as agreed.
- The SPM-37 drafts failures (item 3) are not edited, as agreed.
- Open PO questions: A-NULL display, SPM-62 "Cancelled" status, unbounded registration window.


## 28. SPM-62 renumbering (2026-10-12)

The SPM-62 test IDs now match their ACs: `VIEW-REG-DET-01` access (AC1), `-02` status (AC2), `-03` details (AC3), `-04` visible after the event (AC4). The earlier numbers did not match the content. The change is in the test names and comments only.

| Old ID | New ID | Content |
|---|---|---|
| VIEW-REG-DET-01-A (status) | VIEW-REG-DET-02-A | Registered and withdrawn status |
| VIEW-REG-DET-02-A (details) | VIEW-REG-DET-03-A | Details, requirements, legacy NULL |
| VIEW-REG-DET-03-A (scoped lookup, 403) | VIEW-REG-DET-01-A | Caller scoping, non-attendee refused |
| VIEW-REG-DET-04-A (null) | VIEW-REG-DET-01-A | No registration returns null |
| (new) | VIEW-REG-DET-04-A | Visible-status list keeps Completed and Cancelled |
| VIEW-REG-DETAIL-01-A, -01-A-NON-OWNING | VIEW-REG-INFO-05-E, -05-F | Who may see the report button (SPM-63 AC5) |
| VIEW-REG-DETAIL-02-A | VIEW-REG-INFO-01-D | Modal opens (SPM-63 AC1) |
| VIEW-REG-INFO-CLOSE-1 to -4 | VIEW-REG-INFO-01-E to -01-H | Modal closes (SPM-63 AC1) |
| EVENT-REG-01-C (e2e, after-close cases) | EVENT-REG-02-A | Error after the period closed (AC2) |
| VIEW-REG-DET-01-A (EventListPage) | removed | The browse filters are SPM-61; only the status badge (VIEW-REG-DET-02-A) remains |
