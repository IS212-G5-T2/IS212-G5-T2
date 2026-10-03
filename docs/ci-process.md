# CI Process

This repository uses root-level GitHub Actions workflows to orchestrate checks for a single monorepo. Individual apps and services own their local commands.

## Workflow Files

- `.github/workflows/security.yml`: security scanning for application and service code.
- `.github/workflows/tests.yml`: unit-test orchestration for implemented apps and services, plus backend E2E tests.

The backend E2E job in `tests.yml` starts a fresh PostgreSQL container, applies
the backend-owned draft migration, and then runs the backend E2E suites. The
standalone database image contains the base schema and seed data; Docker Compose
mounts the draft migration separately for local fresh databases.

## Branch Flow

`dev` is the latest shared branch. The branch flow is `work branch -> dev -> main`. Create new feature, fix, docs, chore, refactor, and test branches from the latest `dev`, then open pull requests back into `dev`.

There is no separate intermediate branch workflow in this repository.

## Component Test Entrypoints

The root CI entrypoint is:

```text
scripts/ci/unit-test.sh
```

It explicitly runs the implemented `backend/` and `frontend/` suites in
parallel, installing dependencies and running each suite from its own component
directory. Add a component to this root entrypoint when it gains a CI-owned
unit suite.

## Component Responsibilities

The root entrypoint owns this repository's current Node.js setup and test
orchestration. Component package scripts remain the source of each component's
actual test command.

For example, a Node.js component package owns a test command:

```sh
npm test
```

A Python component package may similarly use:

```sh
python -m pytest
```

- Pull requests: run relevant security and test workflows.
- `dev`: run security and tests for the latest shared branch.
- `main`: run security and tests after promotion from `dev`.

Do not commit credentials, tokens, private keys, or secret payloads.
