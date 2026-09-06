# Project Template

This directory is the baseline template for IS212 G5 T2 service projects.

When creating a new service, copy this directory so the new service starts with baseline documentation, a Dockerfile placeholder, and a CI unit-test entrypoint.

## Required Files

Every project created from this template must keep these files:

- `README.md`
- `AGENTS.md`
- `HANDOVER.md`
- `CHANGELOG.md`
- `scripts/ci/unit-test.sh`

These files define the baseline service-folder standard. Repository-level ignore rules, editor settings, contribution rules, pull request templates, CODEOWNERS, and GitHub Actions workflows live at the repo root.

## How To Use This Template

1. Copy this directory for the new service.
2. Rename the copied directory and update this README for the new service.
3. Replace template-specific guidance with component-specific guidance.
4. Keep the required files listed above unless the project owner approves a template change.

## Project Setup

Replace this section with the new project's setup instructions.

Include:

- Runtime requirements
- Environment variables
- Install commands
- Database or external service setup
- Local development commands
- Test commands

## Development Workflow

Use Jira for Scrum tracking, including epics, user stories, tasks, bugs, sprint status, and acceptance criteria. Use GitHub for source control, pull requests, code review, and CI evidence.

Use feature branches and pull requests for code changes.

Recommended branch naming:

- `feature/<JIRA-KEY>-<short-description>`
- `fix/<JIRA-KEY>-<short-description>`
- `docs/<JIRA-KEY>-<short-description>`
- `chore/<JIRA-KEY>-<short-description>`

Use the actual Jira key when available; do not invent one.

Recommended commit prefixes:

- `feat:` for new features.
- `fix:` for bug fixes.
- `refactor:` for code restructuring that neither fixes a bug nor adds a feature.
- `chore:` for miscellaneous non-source changes such as dependency updates or `.gitignore` maintenance.
- `perf:` for performance improvements.
- `ci:` for continuous integration changes.
- `ops:` for operational changes such as infrastructure, deployment, backup, or recovery.
- `build:` for build tooling, build system, dependency, or version changes.
- `docs:` for documentation changes.
- `style:` for formatting changes that do not affect code meaning.
- `revert:` for reverting a previous commit.
- `test:` for adding or correcting tests.

Prefer several logical commits over one large catch-all commit when the work naturally separates into implementation, tests, documentation, CI, or operations changes.

Before opening a pull request:

1. Pull the latest `main`.
2. Run the relevant tests locally.
3. Update documentation for behavior or setup changes.
4. Use the repository-level pull request template in `../../.github/pull_request_template.md`.

## CI

The GitHub Actions workflows are split by responsibility:

- [Security](../../.github/workflows/security.yml): runs CodeQL, secret scanning, and Terraform IaC scanning.
- [Tests](../../.github/workflows/tests.yml): discovers and runs unit-test entrypoints for implemented apps and services.
- [Deployment](../../.github/workflows/deployment.yml): runs the production deployment placeholder.

The deployment placeholder reflects the target Google Cloud architecture but does not run Terraform, Kubernetes, Artifact Registry, or GKE rollout commands yet.

Every implemented service should provide one unit test entrypoint at `scripts/ci/unit-test.sh`. GitHub Actions runs this file from the component directory; the file should contain the service-specific test command. For Python unit tests, Node.js tests, Jest, or any other unit-test runner, put the real run path or command in `scripts/ci/unit-test.sh` so CI/CD executes the same unit-test entrypoint that developers run locally.

Services should extend the GitHub Actions workflows with build, lint, test, and deployment jobs as the application stack becomes clear.

## AI-Assisted Development

Start with the [global agent policy](../../AGENTS.md), then the [service rules](../AGENTS.md), [component rules](AGENTS.md), and [handover](HANDOVER.md). The global policy defines Jira intake, acceptance criteria handling, verification, cleanup ownership, logical commits, pull request templates, handover/changelog upkeep, and human review.

## Maintainers

Add project maintainers here after creating a project from this template.
