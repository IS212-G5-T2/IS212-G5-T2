# CI/CD Process

This repository uses root-level GitHub Actions workflows to orchestrate CI/CD for a single monorepo. Individual apps, services, and platform areas own their local commands.

## Workflow Files

- `.github/workflows/branch-flow.yml`: promotion-source checks for pull requests into `staging` and `main`.
- `.github/workflows/security.yml`: security scanning for application, service, and Terraform code.
- `.github/workflows/tests.yml`: unit-test orchestration for implemented apps and services.
- `.github/workflows/terraform.yml`: Terraform format, validation, plan, apply, and destroy.
- `.github/workflows/deployment.yml`: deployment workflow placeholder until real deployment commands are added.

## Promotion Source Checks

The branch-flow workflow enforces these promotion paths:

- Pull requests targeting `staging` must come from `integration`.
- Pull requests targeting `main` must come from `staging`.

Any other source branch for those targets fails the `Validate Promotion Source` check.

## Component Test Entrypoints

Implemented apps and services should expose their unit tests through:

```text
<component>/scripts/ci/unit-test.sh
```

Examples:

```text
apps/frontend/scripts/ci/unit-test.sh
services/user-service/scripts/ci/unit-test.sh
services/project-service/scripts/ci/unit-test.sh
```

The root `tests.yml` workflow discovers these entrypoints and runs each one from its component directory. The service template is ignored because it is not an implemented service.

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

## Branch Flow

- Pull requests: run relevant security and test workflows.
- `integration`: run security and tests for active development integration.
- `staging`: run tests and Terraform validation/planning.
- `main`: run deployment placeholders and manually triggered production Terraform operations.

## Deployment Flow

Deployment belongs in `.github/workflows/deployment.yml`.

The deployment workflow should eventually handle application and service release steps, such as:

- Frontend deployment.
- Container image build and push.
- Kubernetes manifest application.
- Smoke checks after rollout.

Terraform provisioning stays in `.github/workflows/terraform.yml`; application deployment should not be mixed into the Terraform workflow.

## Terraform Flow

Terraform work is handled separately:

- Format check.
- Validate.
- Plan.
- Manual apply from `main`.
- Manual destroy from `main` with explicit confirmation.

Do not commit real `.tfvars`, Terraform state files, credentials, or secret payloads.
