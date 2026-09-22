# Frontend agent rules

Scope: `frontend`, within the [global policy](../AGENTS.md).

## Current state

- This directory is the front-facing application. It is covered by the repository-level [security workflow](../.github/workflows/security.yml). Keep setup, test, lint, and build documentation aligned with implemented files.
- The current implementation uses React, Vite, TypeScript, Tailwind CSS, React Router, Zustand, and npm. Verify current files and Jira requirements before changing these conventions.
- The GitHub Actions workflow runs security scanning. That is security scanning configuration, not evidence of a working application or passing browser checks.

## Implementation guidance

- When changing the client implementation, update [README.md](README.md) with setup, development, test, build, and environment commands.
- Add frontend checks that match the chosen stack before reporting the application as verified. Backend validation alone is not evidence that a browser workflow works.
- Coordinate API contracts with `backend/`. Do not make claims about end-to-end connectivity from local or infrastructure intent alone.

## Event workflow checks

Use `npm test` for Vitest/jsdom component interaction checks, `npm run lint`, and `npm run build`. CI entrypoint: `scripts/ci/unit-test.sh`. Event create/list/detail pages use `/api/events`; drafts and My Requests use `/api/requests`. Keep both contracts aligned with `backend/`. Real account/organisation integration and email delivery are separate work.

Keep unit tests beside pages as `.test.tsx` and browser tests as `.playwright.spec.ts`. Playwright tests are excluded from the frontend production TypeScript build and Vitest discovery. Use the backend `scripts/testing/run-browser.mjs` harness with a dedicated test database for browser checks and record cleanup.
