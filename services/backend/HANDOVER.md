# Backend handover

## Current State

`services/backend` is a NestJS backend scaffold generated with the official Nest CLI. It uses Node.js, TypeScript, ESM, npm, Vitest, oxlint, and Prettier.

The generated starter endpoint currently returns `Hello World!`. The events controller/service validates and persists submitted requests in PostgreSQL. User accounts, email delivery, and Save Draft are intentionally deferred.

## Continuity Notes

- Start backend feature work from Jira acceptance criteria.
- Keep API contract changes coordinated with the frontend under `apps/`.
- Add persistence, validation, and authorization deliberately when the first backend story requires them.
- Keep exactly one CI unit-test entrypoint at `scripts/ci/unit-test.sh`.
- No deployment path is configured in this repository.

## Event persistence

`src/events` owns submission validation and the API. Local schema initialization belongs to `development/database`; production migrations remain outside this ticket. The `DEMO_ORGANISER_ENABLED` switch must be replaced by authenticated server identity integration before multi-user use. Never trust an organiser ID or status supplied by the client. Keep the nested TypeScript 5 lock entry when using local npm 11; Docker npm 10 requires it.
