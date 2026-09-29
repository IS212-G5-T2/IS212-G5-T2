# Backend Agent Rules

Scope: `backend/`, within the repository-wide policy in [../AGENTS.md](../AGENTS.md).

## Ownership and Runtime

`backend/` owns the NestJS service source, service-level tests, package scripts, migrations, and backend documentation. It does not own frontend UI, shared Docker Compose orchestration, GitHub workflow orchestration, or production infrastructure.

- Framework: NestJS; runtime: Node.js; language: TypeScript with ESM; package manager: npm.
- Test runner: Vitest; lint/format tools: oxlint and Prettier.
- Local commands: `npm run start:dev`, `npm run lint`, `npm test`, `npm run test:e2e`, and `npm run build`.
- CI unit-test entrypoint: [scripts/ci/unit-test.sh](scripts/ci/unit-test.sh).

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

Authentication uses verified, server-side PostgreSQL sessions. Do not reintroduce Firebase/Bearer-token assumptions unless an explicit approved requirement changes the authentication architecture.

## Adding or Extending a Feature

Keep an existing small feature flat, as `events/` and `clarifications/` currently are. Do not move working files merely to match a template. When a new or growing feature needs clearer boundaries, use this structure inside `src/<feature>/`:

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

- Add `dto/` when a feature has multiple request/response contracts or validation objects. A DTO is not a repository type; keep SQL row mappings in `models/` or next to the repository.
- Add `models/` for feature-local interfaces, types, and database row shapes. Keep a type local unless more than one feature genuinely owns or consumes it.
- Add `helpers/` only for pure, feature-specific reusable functions. Do not create a generic helper folder for one-off code; promote a helper to a carefully named shared location only after at least two features need it.
- Add a repository when persistence/query concerns need isolation from a service. Repositories perform persistence mapping and queries, not HTTP validation or business orchestration.
- Controllers parse transport input and delegate; services enforce use cases; repositories access PostgreSQL; DTOs validate transport contracts. Validate input before business logic and keep API errors free of secrets, stack traces, and sensitive request data.
- Register modules/providers/controllers deliberately in the feature module, then import that module into `AppModule`. Do not let `AppModule` become the implementation home for new feature behavior.

Coordinate API contract changes with `frontend/`, schema assumptions and migrations with `database/`, and local environment changes with `docker-compose/`. Update this component's README, HANDOVER, and CHANGELOG when its setup, behavior, scripts, or contracts change.

## Test Placement and Quality

- Put unit tests beside the owned behavior as descriptive `.spec.ts` files. Put all database/API E2E suites under `backend/test/` as `<feature>.e2e-spec.ts`; keep cross-feature application smoke tests there too. The existing `src/events/drafts.e2e-spec.ts` is a legacy exception that the runner supports, but do not add new E2E suites under `src/`.
- Keep fixtures within `backend/`, outside production entrypoints. Include short plain-English comments above each case and its important setup, action, and assertion sections.
- Maintain one behavior-focused suite as a module changes rather than creating a Jira-keyed test tree. Capture relevant Jira keys and acceptance-criterion wording in test names or nearby comments for traceability.
- Use the dedicated integration configuration and `TEST_DATABASE_URL` for database-backed tests. Run affected unit tests and, where applicable, E2E tests before reporting work verified; record any environment limitation.
- Follow the shared test-case-generation standard in [../.ai/workflows/test-case-generation.md](../.ai/workflows/test-case-generation.md). Tests must be fast, isolated, repeatable, self-validating, and meaningful; coverage is a diagnostic, not proof of quality.
