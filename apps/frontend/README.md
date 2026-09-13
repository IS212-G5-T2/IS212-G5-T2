# Frontend

This directory contains the React/Vite frontend for the workspace.

## Development

Start from the latest `dev`, create a focused feature/fix/docs/chore branch, and open a GitHub pull request back into `dev`.

Coding agents follow the [global policy](../../AGENTS.md), [app rules](../AGENTS.md), and [frontend-specific rules](AGENTS.md).

Install dependencies:

```sh
npm ci
```

Run the development server:

```sh
npm run dev
```

The shared Docker Compose stack can also run the frontend from `development/local-dev`:

```sh
cd ../../development/local-dev
docker compose up --build frontend
```

## Checks

Run the configured frontend checks from this directory:

```sh
npm run lint
npx vitest run
npx playwright test
npm run build
```

No deployment command is configured for this repository.

## Draft requests

Required submission fields have red asterisks. Submit event request lists missing fields, displays inline errors and focuses the first missing field; whitespace-only text is incomplete. Draft saves bypass this completeness check. Selecting No for registration counts as filled. The submission action currently validates completeness only: a complete form reports that submission is unavailable, pending the separate submission integration; it does not change request status.

Use Node.js 24 LTS. `/events` shows My Requests, `/events/create` creates a draft, and `/requests/:id` reopens it. All draft fields may be incomplete. Saves display confirmation or a retryable error; uncertain saves retain the exact operation and disable field edits until retried. Submitted requests show a message directing organisers to the Event Change Requests workflow.

The Vite development server proxies `/event-requests` to `http://localhost:3000`. Set `VITE_API_BASE_URL` at build/start time if using a different API base URL. For cross-origin access, configure the backend's `FRONTEND_ORIGIN` to the exact frontend origin. Run the backend migration described in `services/backend/README.md` before using the feature.

Draft list/read/save currently works without login and sends no credentials. Anonymous drafts are shared within this backend instance. Authentication and organisation isolation will be integrated later; the placeholder profile does not determine draft ownership.

To run the real browser/database test, start the backend `scripts/testing/browser-fixture.mjs` with `NODE_ENV=test` and `TEST_DATABASE_URL`, then set `DRAFT_TEST_API_URL=http://127.0.0.1:3001` when running Playwright. This test saves and reopens a real PostgreSQL draft without cookies or tokens.

Component tests live beside their components and pages under src/; run them with npx vitest run. Playwright browser tests live beside their pages as .playwright.spec.ts; run npx playwright test. Vitest excludes these browser files. Extend the same module suite for later stories instead of creating Jira-key folders. The package manifests currently match dev exactly: dev does not declare the frontend test dependencies or npm test scripts, so a clean install requires test-tooling setup before these commands and the CI test entrypoint can run.
