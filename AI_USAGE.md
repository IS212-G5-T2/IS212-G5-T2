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

- kishorek888 - CI test correction - SPM-131 - Fix PR #97 frontend fixture failures: Updated the confirmed-event readiness fixture with the required saved-disabled registration status and kept existing equipment item ID `item-1` in both edit-request payload assertions. Reproduced the three PR CI failures before changes. With lockfile-installed frontend dependencies (Vitest 5.0.5), the two affected files pass 25/25; `npm run build` passes and `npm run lint` passes with 13 existing warnings. Full `npm run test:cov` passes 154/155 files (2393 passed, 1 skipped, 1 todo) but has one unrelated `REQ-CLAR-02-A` locale-format assertion in `EventDetailPage.clarifications.test.tsx`: Windows renders `18 Sept 2026`, while the test expects `Sep 18`. The prior CI failures in the assigned files are resolved. No production changes; CI rerun pending.
- swr - version control - SPM-132 - Prepare authorized pull request: Archived the nine active SPM-132 work entries in `docs/archived/SPM-132.md`; PR targets `dev`. Cycle 23 evidence and review results are summarized in the PR description. SPM-54 record changes only refresh line references for shared test files.
- swr - rebase/integration correction - SPM-132 - Rebase the PR branch onto dev: Rebased the SPM-132 commit onto current dev and reconciled shared files. Renumbered the SPM-132 migration from 026 to 030 because dev already uses 026 for SPM-156; added dev migration 029 and SPM-132 migration 030 to the PostgreSQL E2E setup. Checks: backend targeted units 245/245, frontend targeted tests 127/127, test-workflow tests 102/102, SPM-132 PostgreSQL E2E 43/43, backend/frontend builds pass. The adjacent venues-booking-requests E2E has 2 unrelated SPM-55 special-request assertion failures (89/91 pass). Full cycle/reviews remain pre-rebase evidence and need rerun before merge. Local disposable DB removed; shared local postgres remains running.
