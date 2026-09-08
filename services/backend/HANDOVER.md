# Backend handover

## Current State

`services/backend` is a NestJS backend scaffold generated with the official Nest CLI. It uses Node.js, TypeScript, ESM, npm, Vitest, oxlint, and Prettier.

The generated starter endpoint currently returns `Hello World!`. No product-specific modules, persistence layer, authentication, or external service integrations have been added yet.

## Continuity Notes

- Start backend feature work from Jira acceptance criteria.
- Keep API contract changes coordinated with the frontend under `apps/`.
- Add persistence, validation, and authorization deliberately when the first backend story requires them.
- Keep exactly one CI unit-test entrypoint at `scripts/ci/unit-test.sh`.
- No deployment path is configured in this repository.
