# Frontend agent rules

Scope: `apps/frontend`, within the [global policy](../../AGENTS.md) and [app rules](../AGENTS.md).

## Current state

- This directory is a front-facing application scaffold under `apps/`. It contains documentation and is covered by the repository-level [security workflow](../../.github/workflows/security.yml), but has no application source, package manifest, lockfile, local test command, lint command, build command, or deployment job.
- Do not assume a frontend framework, routing approach, package manager, design system, accessibility standard, browser support matrix, or hosting configuration has already been adopted. Establish those only from Jira acceptance criteria and implemented files.
- The GitHub Actions workflow runs security scanning. That is security scanning configuration, not evidence of a working application or passing browser checks.

## Implementation guidance

- When adding the first real client implementation, update [README.md](README.md) with setup, development, test, build, environment, and deployment commands.
- Add frontend checks that match the chosen stack before reporting the application as verified. Backend validation alone is not evidence that a browser workflow works.
- Keep deployment outside Kubernetes unless an authorized architecture change explicitly moves app hosting. Coordinate API contracts with affected service code and platform changes under `platform/`. Do not make claims about end-to-end connectivity from infrastructure intent alone.
