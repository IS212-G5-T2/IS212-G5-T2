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
- Draft and event routes require a verified Firebase Bearer token with the ORGANISER role. Pass request.currentUser explicitly to services; scope every list/read/save/submit to its UID. Never use a shared demo identity or a body/header owner ID. Submission must preserve the same UID in events. Legacy demo-owned records require an explicit verified ownership migration, never automatic assignment.
- Unit tests live beside the events module. `src/events/drafts.e2e-spec.ts` exercises middleware and PostgreSQL with two verified test identities; run it with TEST_DATABASE_URL and the dedicated integration configuration.
