# Backend agent rules

Scope: `services/backend`, within the [global policy](../../AGENTS.md) and [service rules](../AGENTS.md).

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
- Coordinate API contract changes with callers under `apps/`.
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
- Coordinate local schema assets with `development/database` and API consumers with `apps/frontend`.
- `src/events/drafts.*` owns draft persistence, versioned saves, and atomic submission into `events`. Its additive schema is `migrations/001_event_drafts.sql`; `scripts/migrate-drafts.mjs` applies it to existing databases.
- Local demo identity is not authentication; account/organisation integration, email and review transitions are outside this implementation. All demo visitors share one organiser; do not claim organisation isolation.
- Unit tests stay beside their modules as `.spec.ts`; database/API tests use `.e2e-spec.ts` and run only through the integration configuration with `TEST_DATABASE_URL` set. Browser harnesses belong in `scripts/testing/`.
- Run `npm run test:e2e` with `TEST_DATABASE_URL` pointing at a dedicated test database; colocated API/database suites clean up their own records.
