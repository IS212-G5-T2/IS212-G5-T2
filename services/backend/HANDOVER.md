# Backend handover

## Current State

`services/backend` is a NestJS backend scaffold generated with the official Nest CLI. It uses Node.js, TypeScript, ESM, npm, Vitest, oxlint, and Prettier.

The starter endpoint returns `Hello World!`. The event-requests module persists drafts in PostgreSQL through `pg`. Its service-owned migration creates `event_requests`; apply it before serving draft traffic.

Draft saves use row locks, optimistic versions and operation IDs to prevent concurrent overwrites and duplicate retries. Reads and writes use a shared anonymous workspace. All visitors to this instance can collaborate on its anonymous drafts. Submitted requests cannot be changed through this module.

Authentication is deferred at the user's request. Draft endpoints work without cookies or tokens. Later integration must replace anonymousDraftWorkspace with verified ownership, decide how anonymous drafts transfer to users, and restore AC7 organisation-isolation tests. Submission and Event Change Requests remain separate integrations; preserve the draft-only write guard.

The browser fixture in `scripts/testing/browser-fixture.mjs` runs the real anonymous API on loopback port 3001 against TEST_DATABASE_URL and cleans up its own request IDs. Never use it as an application entrypoint. PostgreSQL API tests cover anonymous persistence across application restart. Set DRAFT_TEST_API_URL=http://127.0.0.1:3001 when running the real-API Playwright test.

## Continuity Notes

- Start backend feature work from Jira acceptance criteria.
- Keep API contract changes coordinated with the frontend under `apps/`.
- Add persistence, validation, and authorization deliberately when the first backend story requires them.
- Keep exactly one CI unit-test entrypoint at `scripts/ci/unit-test.sh`.
- No deployment path is configured in this repository.
