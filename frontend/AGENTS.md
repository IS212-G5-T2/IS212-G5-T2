# Frontend agent rules

Scope: `frontend`, within the [global policy](../AGENTS.md).

## Current state

- This directory is the front-facing application. It is covered by the repository-level [security workflow](../.github/workflows/security.yml). Keep setup, test, lint, and build documentation aligned with implemented files.
- The current implementation uses React, Vite, TypeScript, Tailwind CSS, React Router, Zustand, and npm. Verify current files and Jira requirements before changing these conventions.
- Group feature-owned pages, components, tests, fixtures, API clients, and types under `src/features/<feature>/`. Keep app routing in `src/app/`, reusable UI/auth/layout in `src/components/`, and cross-feature store, types, libraries, and helpers in their existing shared directories. Preserve public routes when reorganizing files.
- The GitHub Actions workflow runs security scanning. That is security scanning configuration, not evidence of a working application or passing browser checks.

## Implementation guidance

- When changing the client implementation, update [README.md](README.md) with setup, development, test, build, and environment commands.
- Add frontend checks that match the chosen stack before reporting the application as verified. Backend validation alone is not evidence that a browser workflow works.
- Coordinate API contracts with `backend/`. Do not make claims about end-to-end connectivity from local or infrastructure intent alone.

## Event workflow checks

Use `npm test` for Vitest/jsdom component interaction checks, `npm run lint`, and `npm run build`. CI entrypoint: `scripts/ci/unit-test.sh`. Event create/list/detail pages use `/api/events`; drafts and My Requests use `/api/requests`. Keep both contracts aligned with `backend/`. Real account/organisation integration and email delivery are separate work.

Keep unit tests beside pages as `.test.tsx` and browser tests as `.playwright.spec.ts`. Playwright tests are excluded from the frontend production TypeScript build and Vitest discovery. Use the backend `scripts/testing/run-browser.mjs` harness with a dedicated test database for browser checks and record cleanup.

Dialog accessibility is checked with `vitest-axe` (colour-contrast rule disabled: jsdom cannot compute colour). Layout, zoom, target-size and contrast checks need a real browser and are recorded as manual.

The SPM-120 fault-injection check is `node scripts/testing/mutation/run.mjs` (mutants in `spm120.mutants.mjs`, about 10 minutes; `--only M14,M30` for a subset). It mutates a scratch copy and exits 1 if a non-equivalent mutant survives.

The SPM-63 registration report lives in `src/features/registrations/`; it depends on `GET /api/events/:eventId/registrations/report` and `.../report/export?format=csv|pdf` in `backend/`. The same report is also shown as a modal from the People card on the event detail page (`src/features/registrations/components/report/RegistrationsModal.tsx`, mounted only while open so it fetches and polls only then); it uses the same endpoints and `useRegistrationReport` / `useReportExport`, and gains no new API fields. Do not add a client role redirect to that route (the server answers 403 and the page shows MSG-08). Fault-injection check: `node scripts/testing/mutation/run.mjs --mutants spm63.mutants.mjs`.
