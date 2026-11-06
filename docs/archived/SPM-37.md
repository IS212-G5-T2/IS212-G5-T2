# SPM-37 AI usage history

Historical AI-assisted work associated with SPM-37.

## 2026-09-22

- swr - implementation - Convert event-assignment E2E authentication to PostgreSQL sessions: Replaced the obsolete Firebase-token mock in the event-assignment E2E suite with temporary PostgreSQL users and real login cookies, including cleanup of test users and events.
- swr - fix - Restore event-assignment API import: Restored the `api` helper import removed during merge resolution so coordinator assignments can persist after their optimistic state update.

## 2026-09-21

- kirub - testing - Verify My Drafts frontend changes and close test gaps: Reviewed the My Drafts rename and submitted-request filtering, then closed related test gaps.
- general - maintenance - Rebase SPM-37 fix branch onto dev: Rebased fix/SPM-37-Update-Draft-request-workflow from e7a73c6 onto latest origin/dev 90e8a60; resulting HEAD 1f0e67e.
- general - investigation - Attempt local container startup: Docker engine socket failure prevented Compose startup; no containers or data were removed.
- general - fix - Restore manual coordinator assignment: Reverted the store's automatic coordinator assignment and assignment notifications to the implementation before 05da9db.
- general - fix - Remove event approval/rejection outside SPM-37: Removed Review Event entrypoint, decision modal/state/handler, and the reviewEvent store action that changed status and sent approval/rejection notifications.
- general - investigation - Diagnose comments error after manual assignment: Found that the running backend lacked the comments route present in source, indicating a runtime version mismatch.

## 2026-09-20

- kirub - implementation - Role-based request & event access control, coordinator boundaries, and venue/tech support role separation: Enforced role-based request and event access across frontend and backend.
- general - fix - Remove My Requests creation link: Removed the + Create event request link above the request list.
- general - testing - Expand Confluence draft test procedures: With explicit user authorization, updated 26 cases with 209 numbered steps covering setup, concrete inputs, browser/API/database actions and verification.
- general - investigation - Audit Confluence pre-conditions against dev: Audited 26 draft cases, identified branch and fixture mismatches, then corrected the reference to the requested fix branch.
- general - documentation - Update Confluence pre-conditions from SPM-37 fix branch: Replaced pre-conditions for all 26 cases with numbered branch-specific setup covering live browser versus mocked component tests, PostgreSQL/schema setup, stubbed token identities, initial fixture state, failure injection and validation helpers.

## 2026-09-19

- general - review - Review SPM-37 commit message accuracy: Commit-message feature claims match the inspected implementation.
- kirub - testing - SPM-37 coverage to 100% and test-case documentation: Brought the SPM-37 modules to 100% per-file coverage.
- kirub - review - Address SPM-37 pull-request review feedback: Reverted the backend Vitest `include` glob from `src/**/*.spec.ts` back to `**/*.spec.ts` as requested in review.
- general - investigation - Inspect SPM-37 merge conflicts for user decisions: Current merge joins local HEAD 75e03df (rebuild feature commit 61bab0d) with older remote dfc7e64 (original feature 69c5986).
- general - maintenance - Resolve and validate SPM-37 feature merge: Resolved the feature merge around the newer implementation and fixed toolchain and attachment-limit conflicts.
- general - review - Check earlier SPM-37 review comments: Compared earlier review comments with current code and identified unresolved test discovery, injection and migration questions.
- kirub - fix - Remove redundant @Inject in draft service/controller: Removed the redundant `@Inject(EventsService)` / `@Inject(DraftsService)` decorators (Nest resolves these by type since `emitDecoratorMetadata` is enabled), per review.

## 2026-09-16

- general - implementation - Rebuild SPM-37 on current dev: Rebuilt the draft workflow on current dev with saved steps, PostgreSQL persistence, retry identity and atomic submission.
- kirub - implementation - Finish SPM-37 wizard-step resume left in progress: Finished and tested saved wizard-step restoration when reopening a draft.

## 2026-09-11

- kirub - testing - SPM-37 implementation and testing checkpoint: Implemented PostgreSQL-backed draft create/read/list/update, incomplete fields, repeated saves with retry identity and version conflict handling, My Requests and editable form, save feedback, organisation isolation, and server-side rejection of non-draft writes.
- kirub - maintenance - Prepare SPM-37 feature branch: Pulled dev with fast-forward-only; local dev and origin/dev match df9a0b1ecff768865526ba723755574ea68be0be.
