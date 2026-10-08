---
name: test-review
description: Audit whether existing tests for an assigned repository change detect plausible defects and support required behaviour. Use for the independent Test Code Review gate or a requested read-only test audit; not for generating or editing tests.
---

# Test review

Review the Orchestrator's stable snapshot independently. Read `AGENTS.md`, scoped instructions, `ai/docs/sub-agents.md`, authoritative ACs and available test-case specs, changed code, and tests. Derive expected results from the requirements, not implementation output. Mark missing or conflicting oracles and inaccessible sources explicitly.

Build a compact requirement/test ID → assertion → execution-evidence map. For material behaviour, ask which plausible wrong implementation would pass the suite. Check specified outcomes and relevant rejection, boundary, role, persistence, side-effect, and regression paths. Look for circular/vacuous assertions, swallowed errors, excessive mocking, skipped tests, brittle snapshots, order dependence, uncontrolled time/IDs, leaky fixtures, and async races. Inspect branches only as a supplementary gap check. A unit mock cannot prove a real HTTP/DB interaction; a browser mock cannot prove server authorization.

Confirm the test level and actual runner: frontend Vitest/jsdom (`.test.tsx`), Playwright (`.playwright.spec.ts`), backend Vitest unit (`.spec.ts`), or dedicated Vitest/PostgreSQL E2E (`.e2e-spec.ts`). Read current component configs and CI before citing commands or coverage. Match results or CI checks to the assigned snapshot; distinguish configured, executed, skipped, and unavailable checks. Coverage is diagnostic, and repo-specific mutation scripts are evidence only if actually run.

Return the existing `PASS`, `BLOCKED`, or `UNABLE_TO_VERIFY` gate and finding schema from `ai/docs/sub-agents.md`. Each material gap needs a test location/ID, observed evidence, a concrete escaping defect, affected behaviour, and a useful correction. Remain read-only: do not create or fix tests, change tracked files, or decide Orchestrator transitions.
