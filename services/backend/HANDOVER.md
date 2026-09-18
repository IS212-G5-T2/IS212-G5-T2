# Backend handover

## Current State

`services/backend` is a NestJS backend scaffold generated with the official Nest CLI. It uses Node.js, TypeScript, ESM, npm, Vitest, oxlint, and Prettier.

The generated starter endpoint currently returns `Hello World!`. The events controller/service validates and persists submitted requests in PostgreSQL. User accounts and email delivery are deferred. Draft saving and submission are implemented below.

## Continuity Notes

- Start backend feature work from Jira acceptance criteria.
- Keep API contract changes coordinated with the frontend under `apps/`.
- Add persistence, validation, and authorization deliberately when the first backend story requires them.
- Keep exactly one CI unit-test entrypoint at `scripts/ci/unit-test.sh`.
- No deployment path is configured in this repository.

## Event persistence

`src/events` owns submission validation and the API. Local schema initialization belongs to `development/database`; production migrations remain outside this ticket. The `DEMO_ORGANISER_ENABLED` switch must be replaced by authenticated server identity integration before multi-user use. Never trust an organiser ID or status supplied by the client. Keep the nested TypeScript 5 lock entry when using local npm 11; Docker npm 10 requires it.

## Draft continuity

`event_drafts` holds partial JSON fields separately from strictly validated `events`. DraftsService calls EventsService.create with its existing transaction connection on submission; preserve that shared transaction and row lock. Do not expose the internal transaction/event-ID arguments as client input. Apply migrations/001_event_drafts.sql to existing databases; Compose mounts it for new volumes. Real organisation isolation remains deferred: shared demo identity cannot isolate organisations. Current AC7 is submitted-draft lockout. Event Change Requests remain the workflow for post-submit changes. `fields.formStep` is an optional integer (0-2, matching the frontend's three wizard steps) validated in `validateDraft`; it is opaque server-side and only round-trips for the client to resume on save.

Keep TypeScript on 6.0.3 until the Nest CLI supports the installed compiler API; the previous TypeScript 7.0 declaration prevented clean-install builds.
