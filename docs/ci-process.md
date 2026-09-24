# CI Process

This repository uses root-level GitHub Actions workflows to orchestrate checks for a single monorepo. Individual apps and services own their local commands.

## Workflow Files

- `.github/workflows/security.yml`: security scanning for application and service code.
- `.github/workflows/tests.yml`: unit-test orchestration for implemented apps and services.

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

The root `tests.yml` workflow discovers these entrypoints and runs each one from its component directory.

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
- `dev`: run security and tests for the latest shared branch.
- `main`: run security and tests after promotion from `dev`.

Do not commit credentials, tokens, private keys, or secret payloads.
