# Backend agent rules

Scope: `backend/`, within the [global policy](../AGENTS.md).

## Ownership

- This directory owns the NestJS backend service, API contracts, persistence code, backend migrations, service tests, package scripts, and backend documentation.
- It does not own frontend UI, local database initialization assets, shared Docker Compose tooling, GitHub workflow orchestration, or production infrastructure.
- Coordinate API changes with `frontend/`; coordinate fresh local schema and seed changes with `database/`.

## Shared Jira agent workflow

For Jira work, follow [`.ai/workflow/README.md`](../.ai/workflow/README.md) and [`.ai/agents/implementation.md`](../.ai/agents/implementation.md). Agent 1 owns implementation and automated tests across affected components. Jira and Confluence context is captured once under `.ai/runtime/{ticket_id}/`; use that snapshot and do not make reviewers retrieve it again. Agents 2–4 review independently without editing. The orchestrator reconciles findings, selectively reruns affected reviewers within the bounded retry, and runs final checks. Keep cross-component work in the same ticket workflow and runtime contract.

## Runtime and commands

- Framework: NestJS; runtime: Node.js; language: TypeScript (ESM); package manager: npm.
- Tests: Vitest. Lint: oxlint. Formatting: Prettier.
- Run from `backend/`:

  ```sh
  npm ci
  npm run start:dev
  npm run lint
  npm test
  npm run test:e2e
  npm run build
  ```

- CI unit tests are run by the root [`scripts/ci/unit-test.sh`](../scripts/ci/unit-test.sh) entrypoint; this package owns the `npm test` command it invokes.
- Database/API integration tests use their dedicated test configuration and isolated test data. Record environment limits instead of claiming a skipped check passed.

## Backend file responsibilities

Keep code within its Nest feature/module. The service groups code by top-level domain, with feature-local layers beneath it. Authentication and authorization are separate top-level areas: `src/authentication/` owns identity/session verification and `src/authorization/` owns RBAC policy queries. Keep Nest modules, controllers, services, and middleware at the feature root. Put repositories in a `repositories/` folder when that clarifies persistence ownership, shared types in `models/`, and boundary contracts in `dto/` when they warrant standalone files. Place unit tests beside their implementation. Use these responsibilities:

| Location | Responsibility |
| --- | --- |
| `*.module.ts`, `*.controller.ts`, `*.service.ts` | Nest wiring, HTTP boundary, and business/use-case logic. |
| `*.repository.ts` or `repositories/` | SQL, joins, persistence mapping, and data access. Repository code never belongs under `dto/`. |
| `dto/` | Data Transfer Objects for data crossing the API boundary, such as request/response shapes, with boundary validation/transformation. A DTO is not a database repository and is not the place for SQL. |
| `models/` | Domain/application types, enums, or data shapes used within a feature or shared across its files. For example, shared identity types live in `src/authentication/models/auth.models.ts`. A model type does not by itself validate untrusted input. |
| `helpers/` | Cohesive helper functions that are reused within a feature. Prefer a purpose-named module file for a single helper; avoid a generic catch-all helper directory. |
| `*.spec.ts`, `*.e2e-spec.ts` | Unit tests beside their implementation; database/API integration tests use the dedicated integration configuration. |

Request/input types belong to the DTO/API-boundary responsibility. Internal domain and application types belong to models. SQL and persistence operations belong to repositories. Input validators such as `src/events/dto/event-input.ts`, `src/events/drafts/dto/draft-input.ts`, and `src/clarifications/dto/clarification-input.ts` belong with their DTO boundary: preserve the established validation approach unless the ticket calls for a deliberate change. Don't create empty directories, duplicate types across DTO and model, or add validation libraries solely to impose a folder convention.

Group cohesive backend subfeatures under their owning domain, then use layer folders where they clarify file roles. Clarifications keep API input/response shapes in `dto/`, internal row/write types in `models/`, and SQL in `repositories/`; service, controller, and module remain at the feature root. Events keep shared request validators in `dto/`, shared event types in `models/`, reusable coordinator selection logic in `helpers/`, drafts and their tests in `drafts/` (with draft DTOs in `drafts/dto/`), and rejection routes/tests in `rejections/`. Authentication is a top-level domain rather than `auth/authentication`; its module/controller/service/middleware are at the feature root, with shared types in `models/` and SQL in `repositories/`. Authorization/RBAC is a separate top-level domain. These folders do not create separate Nest modules by themselves: `AppModule` remains the composition root until a subfeature has a real module boundary. Do not split files into generic layer folders solely to make a tree look uniform.

## Implementation guidance

- Validate request input before business logic. Controllers handle HTTP concerns; services implement use cases; repositories own table-specific SQL and persistence.
- Inject `DatabaseService`. Use `query()` for one statement and `transaction()` for related writes that must commit or roll back together. Do not create per-feature `pg.Pool` instances or generic CRUD layers.
- Avoid leaking secrets, credentials, SQL errors, stack traces, or sensitive request data in responses or logs.
- Keep authentication and authorization checks at the required route/use-case and data-query boundaries. Scope reads and writes to the verified identity; never trust a caller-supplied owner ID.
- Add behavior-focused tests beside the code. Include the Jira key in the test name or nearby test-case comment and follow root test naming/comment guidance.
- Extend the existing behavior-focused `.spec.ts` suite for that feature or module; do not create a Jira-specific test file for each ticket. Keep the Jira key and behavior in the `describe`/test name or nearby test-case comment.
- Add JSDoc to exported APIs and new or materially changed functions/methods. Explain intent and use `@param`, `@returns`, and `@throws` where they clarify the contract; document exported types/classes as well.
- Update [README.md](README.md), `HANDOVER.md`, and `CHANGELOG.md` when setup, behavior, scripts, migrations, or service contracts change.

## Database and API boundaries

- `backend/migrations/` owns additive application schema changes for existing databases. Preserve migration order and data; do not use `database/postgresql/init/001_schema.sql` as an upgrade migration.
- `database/` owns fresh local database initialization and seed assets. Read its scoped `AGENTS.md` when crossing that boundary.
- Frontend callers own user-facing behavior. Read `frontend/AGENTS.md` for API-contract changes and keep request/response shapes, errors, authentication, and tests aligned.

## Events boundary

- `src/events` owns event request validation, `POST /api/events`, `GET /api/events`, `GET /api/events/:id`, and persistence in the `events` table.
- Coordinate local schema assets with `database/` and API consumers with `frontend/`.
- Draft and event routes require a verified Firebase Bearer token with the ORGANISER role. Pass request.currentUser explicitly to services; scope every list/read/save/submit to its UID. Never use a shared demo identity or a body/header owner ID. Submission must preserve the same UID in events. Legacy demo-owned records require an explicit verified ownership migration, never automatic assignment.
- Unit tests live beside the events module. `src/events/drafts/drafts.e2e-spec.ts` exercises middleware and PostgreSQL with two verified test identities; run it with TEST_DATABASE_URL and the dedicated integration configuration.

## Registrations boundary

- `src/registrations` owns attendee registration validation, `POST /api/events/:eventId/registrations`, `GET /api/events/:eventId/registrations/me`, and writes to `event_registrations`. It does not own event authoring or withdrawal.
- Registration rules read time only from the injected `CLOCK`; tests freeze it. `src/registrations/registrations.e2e-spec.ts` needs `DATABASE_URL` for a database with `database/postgresql/init/001` to `004` applied.
