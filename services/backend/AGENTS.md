# Backend agent rules

Scope: `services/backend`, within the [global policy](../../AGENTS.md) and [service rules](../AGENTS.md).

## Ownership

- This directory owns the NestJS backend service source, service-level tests, package scripts, and backend documentation.
- It does not own frontend UI, shared local integration tooling, GitHub workflow orchestration, or deployment infrastructure.
- The event-requests module owns the `event_requests` table, its migration, and draft list/read/save endpoints. Drafts currently use a shared anonymous workspace at the user's request. Coordinate later authentication integration with its owner: replace the workspace with verified ownership and restore organisation-isolation tests. Do not add fake authentication middleware.

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

## Test layout

Keep tests beside their owning source module; use descriptive filenames instead of Jira-key folders. Follow the root test-discovery and conflict-resolution rules.
