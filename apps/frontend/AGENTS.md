# Frontend agent rules

Scope: `apps/frontend`, within the [global policy](../../AGENTS.md) and [app rules](../AGENTS.md).

## Current state

- This directory is a front-facing application under `apps/`. It is covered by the repository-level [security workflow](../../.github/workflows/security.yml). Keep setup, test, lint, and build documentation aligned with implemented files.
- The current implementation uses React, Vite, TypeScript, Tailwind CSS, React Router, Zustand, and npm. Verify current files and Jira requirements before changing these conventions.
- The GitHub Actions workflow runs security scanning. That is security scanning configuration, not evidence of a working application or passing browser checks.

## Implementation guidance

- When changing the client implementation, update [README.md](README.md) with setup, development, test, build, and environment commands.
- Add frontend checks that match the chosen stack before reporting the application as verified. Backend validation alone is not evidence that a browser workflow works.
- Coordinate API contracts with affected service code. Do not make claims about end-to-end connectivity from local or infrastructure intent alone.
