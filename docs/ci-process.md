# CI Process

This repository uses root-level GitHub Actions workflows to orchestrate checks for a single monorepo. Individual apps and services own their local commands.

## Workflow Files

- `.github/workflows/security.yml`: security scanning for application and service code.
- `.github/workflows/tests.yml`: component coverage-test orchestration plus backend E2E tests.

`security.yml` runs for pushes and pull requests targeting `dev` or `main`, and on manual dispatch. `tests.yml` runs for pull requests that change an application, database, or Compose path, and on manual dispatch; it does not currently run on pushes.

## Branch Flow

`dev` is the latest shared branch. The branch flow is `work branch -> dev -> main`. Create new feature, fix, docs, chore, refactor, and test branches from the latest `dev`, then open pull requests back into `dev`.

There is no separate intermediate branch workflow in this repository.

## Component Test Entrypoints

Implemented apps and services should expose their unit tests through:

```text
<component>/scripts/ci/unit-test.sh
```

Examples:

```text
frontend/scripts/ci/unit-test.sh
backend/scripts/ci/unit-test.sh
events-service/scripts/ci/unit-test.sh
```

The root `tests.yml` workflow discovers these entrypoints and runs each one from its component directory. The current frontend and backend entrypoints run their coverage commands. `tests.yml` also runs the backend E2E suite against a CI-created PostgreSQL container.

## Component Responsibilities

Each component should keep its own setup and test command inside its entrypoint. The root workflow should not need to know whether a component uses Node.js, Python, Java, or another runtime.

For example, a Node.js service entrypoint may look like:

```sh
#!/bin/sh
set -eu

npm ci
npm test
```

A Python service entrypoint may look like:

```sh
#!/bin/sh
set -eu

python -m pip install -r requirements.txt
python -m pytest
```

- Pull requests: run relevant security and test workflows.
- Pushes to `dev` or `main`: run the security workflow.
- Component coverage and backend E2E tests: run on qualifying pull requests or manual dispatch.

## Test-Case Design and CI

CI executes automated checks; it does not generate or publish Jira/Confluence test cases. Use the shared [test-case generation standard](../.ai/workflows/test-case-generation.md) during ticket design and review to map private Confluence cases and Jira acceptance criteria to automated coverage, manual verification, or documented gaps. Keep the resulting runtime artifacts under ignored `.ai/runtime/`.

Do not commit credentials, tokens, private keys, or secret payloads.
