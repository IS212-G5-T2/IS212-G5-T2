# Coverage line status

Every uncovered line of an in-scope source file needs a row here (gate G5). Lines covered only by an end-to-end run are classified COVERED-BY-E2E automatically and need no row.

| Status | Meaning | Note required |
|---|---|---|
| COVERED-BY-E2E | Only an end-to-end test runs it; a unit or integration test is still preferred | Name the e2e test |
| ADD-TEST | A test will be added this cycle | Test id |
| UNREACHABLE | No valid input can execute it | Why |
| LOW-VALUE | Reachable, but only logging or trivial; no test added | Why |
| OPEN | Not yet decided; counts as a gap in the metrics | What is undecided |

| File | Lines | Status | Note |
|---|---|---|---|
| backend/src/events/status/arrangements.reader.ts | 43 | UNREACHABLE | NoSafetyRecordSource is still registered in app.module.ts but nothing injects it: SAFETY_OUTCOME_SOURCE now points at EventSafetyCheckSource. The class is dead code; remove it in a follow-up. |
| backend/src/events/status/status.service.ts | 121, 161, 383 | OPEN | Locked re-check that the coordinator is still assigned, after the row lock. The pre-check refuses first, so it only fires if the coordinator is reassigned between the pre-check and the lock. A deterministic test needs the CONFIRM-EVENT-04-B pattern (hold the row lock, reassign, commit). Mutants M7b, M8b, M9b are flagged equivalent only because no such test exists. |
| backend/src/events/status/status.service.ts | 450 | UNREACHABLE | Body used when the guarded UPDATE finds no Planning row. The UPDATE runs under FOR UPDATE after the status was re-read as Planning, so it cannot match no row (the same argument as mutant M11). Defensive. |
