# AI Usage Log

Record current AI-assisted work in this file. Archive entries under
[`docs/archived/`](docs/archived/README.md) when the user explicitly requests
archival or asks the agent to create a pull request.

Add entries under one date per day, using this format:

```md
## YYYY-MM-DD

- <user or general> - <type> - <Jira ticket or branch name> - <title>: <concise result>
```

Where user is the user's github username.

## 2026-11-02

- swr - CI test correction - SPM-159 - Stabilize backend E2E schema replays: Updated the replayable SPM-54 booking lifecycle migration in both backend and fresh-volume init copies to preserve the later `expired` booking status. This addresses migration reapplication failures where existing expired rows violated the older check constraint. CI log also shows inconsistent venue schedule migration state (`operating_days` NOT NULL); further targeted E2E setup correction is still needed.
- kishorek888 - CI test correction - SPM-131 - Fix PR #97 frontend fixture failures: Updated the confirmed-event readiness fixture with the required saved-disabled registration status and kept existing equipment item ID `item-1` in both edit-request payload assertions. Reproduced the three PR CI failures before changes. With lockfile-installed frontend dependencies (Vitest 5.0.5), the two affected files pass 25/25; `npm run build` passes and `npm run lint` passes with 13 existing warnings. Full `npm run test:cov` passes 154/155 files (2393 passed, 1 skipped, 1 todo) but has one unrelated `REQ-CLAR-02-A` locale-format assertion in `EventDetailPage.clarifications.test.tsx`: Windows renders `18 Sept 2026`, while the test expects `Sep 18`. The prior CI failures in the assigned files are resolved. No production changes; CI rerun pending.
- swr - version control - SPM-132 - Prepare authorized pull request: Archived the nine active SPM-132 work entries in `docs/archived/SPM-132.md`; PR targets `dev`. Cycle 23 evidence and review results are summarized in the PR description. SPM-54 record changes only refresh line references for shared test files.
- swr - rebase/integration correction - SPM-132 - Rebase the PR branch onto dev: Rebased the SPM-132 commit onto current dev and reconciled shared files. Renumbered the SPM-132 migration from 026 to 030 because dev already uses 026 for SPM-156; added dev migration 029 and SPM-132 migration 030 to the PostgreSQL E2E setup. Checks: backend targeted units 245/245, frontend targeted tests 127/127, test-workflow tests 102/102, SPM-132 PostgreSQL E2E 43/43, backend/frontend builds pass. The adjacent venues-booking-requests E2E has 2 unrelated SPM-55 special-request assertion failures (89/91 pass). Full cycle/reviews remain pre-rebase evidence and need rerun before merge. Local disposable DB removed; shared local postgres remains running.
- swr - CI test correction - SPM-132 - Fix backend E2E failures after rebase: The full CI run exposed SPM-132 setup reapplying historical migration 019 after rows may already have `expired` status, which rolls back the lifecycle check before migration 030; removed that replay because the E2E init DB already includes 019. VEN-REV-12-B/C queried the pending-only endpoint while asserting rejected attempts, so their shared list helper now sets `includeDecided=true`. Against a disposable local PostgreSQL DB, SPM-132 E2E passes 43/43 and venue booking requests pass 91/91. Full backend E2E still needs CI rerun; no production code changed.
