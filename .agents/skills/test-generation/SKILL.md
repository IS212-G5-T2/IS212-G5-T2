---
name: test-generation
description: Design and implement traceable automated tests for an authorized repository change from supplied acceptance criteria or maintained test cases. Use during implementation or an explicitly assigned test-writing task; not for an independent review gate.
---

# Test generation

Use only within the assigned implementation/test-writing scope. Read `AGENTS.md`, the owning component's `AGENTS.md`, authoritative requirements and available test-case specs, then existing nearby tests and runner configuration. If a core expected result is unspecified, seek clarification or report the gap; label any non-material assumption instead of inventing a business rule. Code is technical context, never the oracle.

Map each changed behaviour and supplied test ID to an independently justified expected result. Choose unit, HTTP/PostgreSQL integration, or real-browser coverage by what each can actually prove; select cases by risk, not a fixed count. Include relevant success, refusal, boundary, permission, side-effect, and regression evidence. Ask which plausible incorrect implementation each assertion would catch. Use clear Arrange–Act–Assert sections, specific observable outcomes, and assertions that cover unchanged state after rejection where needed. Avoid circular expectations, swallowed errors, snapshot-only behaviour checks, and mocks that bypass the claimed boundary.

Extend suites beside the owning module/page. Follow test-ID and documentation-comment placement in `ai/agents/implementation.md`; use only verified source IDs. Use isolated fixtures, controlled time/IDs, cleanup, and deterministic async checks. For database work, inspect the suite's actual schema, auth/session helper, and teardown before copying a fixture; E2E suites share mutable PostgreSQL and run without parallel files.

Read the relevant `package.json`, Vitest/Playwright config, and `scripts/ci/unit-test.sh` before selecting commands. From the owning component, `npm test -- <test-path>` runs a focused Vitest suite; backend database suites use `npm run test:e2e -- <test-path>` with the required database, and browser suites use the documented `backend/scripts/testing/run-browser.mjs` harness with its test database and running app. Confirm prerequisites in scoped instructions before executing. Run affected checks, then report requirement/test ID → file/assertion → oracle source → exact command/result or limitation. Coverage is diagnostic; do not invent a per-change threshold. This skill writes tests only when authorized and never approves a review gate.
