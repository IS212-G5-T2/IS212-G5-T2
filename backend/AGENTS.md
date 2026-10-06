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
- Update [README.md](README.md), [HANDOVER.md](HANDOVER.md), and [CHANGELOG.md](CHANGELOG.md) when setup, behavior, scripts, or service contracts change.

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

- `src/events` owns event request validation, `POST /api/events`, `GET /api/events`, `GET /api/events/:id`, and persistence in the `events` table.
- Coordinate local schema assets with `database/` and API consumers with `frontend/`.
- Draft and event routes require a verified Firebase Bearer token with the ORGANISER role. Pass request.currentUser explicitly to services; scope every list/read/save/submit to its UID. Never use a shared demo identity or a body/header owner ID. Submission must preserve the same UID in events. Legacy demo-owned records require an explicit verified ownership migration, never automatic assignment.
- Unit tests live beside the events module. `src/events/drafts.e2e-spec.ts` exercises middleware and PostgreSQL with two verified test identities; run it with TEST_DATABASE_URL and the dedicated integration configuration.

## Coordinators boundary

- `src/coordinators` owns `GET` and `PUT /api/coordinators/me/availability` (SPM-80) and writes only `users.is_available`. It does not own event assignment; assignment features (SPM-123, SPM-47) read the flag themselves.
- Coordinator-only and always scoped to the session's own account; never accept a user id from the URL or body.
- `src/coordinators/coordinator-availability.e2e-spec.ts` runs through the real app, session login and PostgreSQL; it needs `DATABASE_URL` for a database with `database/postgresql/init/001` to `007` applied.

## Registrations boundary

- `src/registrations` owns attendee registration validation, `POST /api/events/:eventId/registrations`, `GET /api/events/:eventId/registrations/me` (latest registration of any status), `POST /api/registrations/:registrationId/withdraw` (SPM-120), and writes to `event_registrations`. It does not own event authoring. The "event has already occurred" rule is one function, `event-start.ts` (`hasEventStarted`, exclusive at the start instant).
- Registration rules read time only from the injected `CLOCK`; tests freeze it. `src/registrations/registrations.e2e-spec.ts` needs `DATABASE_URL` for a database with `database/postgresql/init/001` to `004` applied; `registrations.withdraw.e2e-spec.ts` (SPM-120) also needs `007` (`withdrawn_at`).
- SPM-120 withdrawal tests: `src/registrations/registrations.withdraw.spec.ts` records the SQL a refusal issues, because `withdraw()` runs in a transaction that rolls back and no database assertion can show a write that was undone. The fault-injection check is `node scripts/testing/mutation/run.mjs` (mutants in `spm120.mutants.mjs`; it mutates a scratch copy, needs `DATABASE_URL` for the integration suite, and exits 1 if a non-equivalent mutant survives).

## Venues boundary

- `src/venues` owns SPM-50 `POST /api/venues` creation plus SPM-124 `GET /api/venues` and `GET /api/venues/:id` reads. Venue Staff reads require the `Venue` read permission and are scoped by the verified user's `venues.owner_user_id`; Coordinator reads with that permission are unscoped. Creation requires `Venue` create permission and uses the verified user as owner.
- Venue schema upgrades live in `backend/migrations/005` through `009`; local fresh-volume initialization lives in `database/postgresql/init/`.
