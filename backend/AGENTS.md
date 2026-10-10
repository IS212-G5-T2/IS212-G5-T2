# Backend agent rules

Scope: `backend`, within the [global policy](../AGENTS.md).

## Ownership

- This directory owns the NestJS backend service source, service-level tests, package scripts, and backend documentation.
- It does not own frontend UI, shared local integration tooling, GitHub workflow orchestration, or deployment infrastructure.

## Runtime

- Framework: NestJS.
- Runtime: Node.js.
- Language: TypeScript using ESM.
- Package manager: npm.
- Test runner: Vitest.
- Linter/formatter: oxlint and Prettier.

## Implementation Guidance

- Keep module, controller, provider, and DTO boundaries explicit as the service grows.
- Validate request input before it reaches business logic.
- Avoid leaking secrets, storage errors, stack traces, or sensitive request data in API responses or logs.
- Coordinate API contract changes with callers under `frontend/`.
- Update [README.md](README.md) when setup, scripts, or supported service contracts change. Keep durable operational guidance there or in a focused document when needed; use Git history and PRs for change history.

## Local Commands

```sh
npm ci
npm run start:dev
npm run lint
npm test
npm run test:e2e
npm run build
```

The CI unit-test entrypoint is [scripts/ci/unit-test.sh](scripts/ci/unit-test.sh).

## Events boundary

- `src/events` owns event request validation, `POST /api/events`, `GET /api/events`, `GET /api/events/:id`, and persistence in the `events` table. Submission leaves a request unassigned; the Lead assigns it (`src/lead`).
- `src/events` also owns event planning (SPM-97/49/85): `/api/events/:id/planning` routes, reads SPM-124's `venue_bookings`, owns the `equipment_reservations` (placeholder) and `event_flagged_changes` tables (see HANDOVER.md), and the impact rules in `event-impact.ts`.
- Coordinate local schema assets with `database/` and API consumers with `frontend/`.
- Draft and event routes require a verified local session with the ORGANISER role. Pass `request.currentUser` explicitly to services; scope every list/read/save/submit to its UID. Never use a shared demo identity or a body/header owner ID. Submission must preserve the same UID in events. Legacy demo-owned records require an explicit verified ownership migration, never automatic assignment.
- Unit tests live beside the events module. `test/drafts.e2e-spec.ts` exercises middleware and PostgreSQL with two verified test identities; run it with TEST_DATABASE_URL and the dedicated integration configuration.

## Coordinators boundary

- `src/coordinator-availability` owns `GET` and `PUT /api/coordinators/me/availability` (SPM-80) and writes `users.is_available`, plus (SPM-47 AC10) the Lead's `coordinator_unavailable` notification when a coordinator with active events becomes unavailable, marked read when they become available again. It does not own event assignment; assignment features (SPM-123, SPM-47) read the flag themselves.
- Coordinator-only and always scoped to the session's own account; never accept a user id from the URL or body.
- `test/coordinator-availability.e2e-spec.ts` runs through the real app, session login and PostgreSQL; it needs `DATABASE_URL` for a database with `database/postgresql/init/001` to `009` applied.

## Lead boundary

- `src/lead` owns the Event Coordinator Lead's queue, coordinator list and assignment (SPM-123) and reassignment (SPM-47), and writes `events.coordinator_id`/`coordinator_name`, the `event_reassignments` history row (SPM-46), plus the `coordinator_assignment`, `coordinator_reassignment` and `coordinator_unassignment` notifications. It does not own approval/rejection.
- Lead-only (`COORDINATOR_LEAD`); availability is always re-checked inside the assignment transaction. `test/lead-assignment.e2e-spec.ts` needs `DATABASE_URL` for a database with `database/postgresql/init/001` to `010` applied.

## Registrations boundary

- `src/registrations` owns attendee registration validation, `POST /api/events/:eventId/registrations`, `GET /api/events/:eventId/registrations/me` (latest registration of any status), `POST /api/registrations/:registrationId/withdraw` (SPM-120), and writes to `event_registrations`. It also owns the SPM-63 registration report: `GET /api/events/:eventId/registrations/report` and `GET .../report/export?format=csv|pdf` (CSV and PDF writers in `report/export.service.ts`, the single access rule in `report/report-access.ts`). It does not own event authoring. The "event has already occurred" rule is one function, `withdrawal/event-start.ts` (`hasEventStarted`, exclusive at the start instant).
- Registration rules read time only from the injected `CLOCK`; tests freeze it. `test/registrations.e2e-spec.ts` needs `DATABASE_URL` for a database with `database/postgresql/init/001` to `004` applied; `registrations.withdraw.e2e-spec.ts` (SPM-120) also needs `007` (`withdrawn_at`).
- SPM-120 withdrawal tests: `src/registrations/withdrawal/registrations.withdraw.spec.ts` records the SQL a refusal issues, because `withdraw()` runs in a transaction that rolls back and no database assertion can show a write that was undone. The fault-injection check is `node scripts/mutation/run.mjs` (mutants in `spm120.mutants.mjs`; it mutates a scratch copy, needs `DATABASE_URL` for the integration suite, and exits 1 if a non-equivalent mutant survives). SPM-46 has its own `spm46.mutants.mjs` (`--mutants spm46.mutants.mjs`) covering the reassignment history, its tie-break, the viewer check, the 403, and the transaction.
- SPM-63 report rules: the report and both exports must go through `RegistrationsService.getReport`; never add a second access check or a route that reads `event_registrations` for another role. Identity comes from the session only (never from the query or body). The PDF embeds `assets/fonts/NotoSans-Regular.ttf`; keep it copied into the Docker image. Fault-injection check: `node scripts/mutation/run.mjs --mutants spm63.mutants.mjs` (mutates a scratch copy; needs `DATABASE_URL`). Integration tests: `test/registrations.report.e2e-spec.ts`.

## Venues boundary

- `src/venues` owns SPM-50 `POST /api/venues` creation, SPM-124 `GET /api/venues` and `GET /api/venues/:id` reads, and SPM-122 Venue Staff unavailable-period creation and early ending. Any role with the `Venue` read permission can access the shared catalogue and detail records. `GET /api/venues?mine=true` is an optional session-derived owner filter; creation requires `Venue` create permission and uses the verified user as owner.
- Venue schema upgrades live in `backend/migrations/005` through `009`; local fresh-volume initialization lives in `database/postgresql/init/`.
