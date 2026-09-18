# Frontend handover

## Current state

This directory is a front-facing application under `apps/`. It is covered by the repository-level security workflow.

The app uses React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand. The package manager is npm.

The shared local Docker Compose stack builds this app with `apps/frontend/Dockerfile` and exposes Vite on `localhost:5173`.

## Continuity notes

- Keep setup, development, test, build, and environment instructions in `README.md` aligned with the implemented frontend.
- `scripts/ci/unit-test.sh` installs dependencies and runs the Vitest component interaction tests.

## Event requests

The create/list/detail pages call the real local API; other existing store actions remain prototype behavior. Account integration belongs to a separate ticket. The app starts in light mode, and the sign-in label has been removed. Email delivery is deferred. Draft saving is implemented below. The API maps stored Submitted status to the existing lowercase frontend status type.

## Draft continuity

Drafts reuse EventCreatePage and its current fields; do not reintroduce the previous draft-specific UI. PUT /api/requests/:id uses a stable UUID, optimistic version and operationId. A network-uncertain retry sends the exact original operation before applying further edits. Submitted requests render a lock message at draft URLs. My Requests is server-backed and does not rely on localStorage. Real organisation isolation remains deferred while identity is shared demo access; current AC7 is submitted-draft lockout. The saved wizard step travels in `fields.formStep`, stripped back out of `form` state on load; keep it out of the visible field set if `DraftFields` grows.
