# Backend Agent Rules

Scope: `backend/`; follow [../AGENTS.md](../AGENTS.md).

## Ownership and Runtime

`backend/` owns NestJS code, service tests, scripts, migrations, and backend docs; not frontend UI, shared Compose, GitHub workflows, or production infrastructure.

- NestJS, Node.js, TypeScript ESM, npm.
- Tests: Vitest; lint/format: oxlint, Prettier.
- Local: `npm run start:dev`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`.
- CI: [scripts/ci/unit-test.sh](scripts/ci/unit-test.sh).

## Current Service Map

```text
src/
├── app.controller.ts / app.service.ts / app.module.ts / main.ts
│   Application bootstrap and root/health endpoints.
├── auth/
│   ├── authentication/
│   │   Login, logout, current-session endpoint, session middleware, and
│   │   PostgreSQL-backed account/session repository.
│   ├── authorization/
│   │   Role and permission-query boundary.
│   └── models/
│       Authenticated-user, role, permission, session, and auth-config types.
├── clarifications/
│   Clarification/comment API, service, repository, input validation, and module.
├── config/
│   Environment loading and typed authentication configuration.
├── database/
│   Shared PostgreSQL module and database service.
└── events/
    Event list/detail/create/assign/reject and notification endpoints; draft
    request endpoints; event input validation; coordinator roster; services;
    event-focused unit tests; and the existing `drafts.e2e-spec.ts` legacy E2E
    suite.

test/
├── app.e2e-spec.ts
├── auth.e2e-spec.ts
├── clarifications.e2e-spec.ts
└── events-assign.e2e-spec.ts

migrations/                 # Backend-owned migration scripts.
scripts/ci/                 # Backend CI entrypoint.
scripts/testing/            # Backend-owned browser/integration test harnesses.
```

Authentication uses verified PostgreSQL sessions. Reintroduce Firebase/Bearer tokens only for an explicit approved requirement.

## Adding or Extending a Feature

Keep small existing features flat; do not move files just to match a template. For new or growing features needing clearer boundaries:

```text
src/<feature>/
├── <feature>.module.ts              # Nest dependency boundary and exports
├── <feature>.controller.ts          # HTTP transport only
├── <feature>.service.ts             # Use cases and business orchestration
├── <feature>.repository.ts          # Optional: database/query boundary
├── dto/                             # Request/response transport shapes and validation
├── models/                          # Feature-local domain types and persistence row types
├── helpers/                         # Pure feature-local transformations or calculations
└── <behavior>.spec.ts               # Unit tests beside the behavior

test/
└── <feature>.e2e-spec.ts            # Database/API E2E suite for one feature
```

- Add `dto/` for multiple transport contracts/validators; keep SQL row mappings in `models/` or near repositories.
- Add `models/` for feature-local types and row shapes; share only when multiple features need them.
- Add `helpers/` for reusable pure feature functions, not one-offs; share across features only after two need them.
- Add a repository when queries/mapping need a separate boundary; keep HTTP validation and orchestration elsewhere.
- Controllers parse/delegate; services orchestrate use cases; repositories query PostgreSQL; DTOs validate transport. Validate before business logic; omit secrets, traces, and sensitive data from API errors.
- Register feature modules/providers/controllers in the feature module, then import it into `AppModule`; keep feature logic out of `AppModule`.

Coordinate API changes with `frontend/`, schemas/migrations with `database/`, and local setup with `docker-compose/`. Update README, HANDOVER, and CHANGELOG when setup, behavior, scripts, or contracts change.

## Test Placement and Quality

- Keep descriptive `.spec.ts` unit tests beside behavior. Put new database/API E2E and cross-feature smoke suites in `backend/test/` as `<feature>.e2e-spec.ts`. Existing `src/events/drafts.e2e-spec.ts` is a supported legacy exception.
- Keep fixtures inside `backend/`, outside production entrypoints. Add brief plain-English comments above cases and key setup/action/assertion sections.
- Maintain behavior-focused suites, not Jira-keyed trees. Put Jira keys and AC wording in test names/nearby comments.
- Use dedicated integration config and `TEST_DATABASE_URL` for database tests. Run affected unit/E2E suites; report environment limits.
- Follow [test-case generation](../.ai/workflows/test-case-generation.md). Keep tests fast, isolated, repeatable, self-validating, and meaningful; coverage is diagnostic.
