# Frontend handover

## Current state

This directory is a front-facing application under `apps/`. It is covered by the repository-level security workflow.

The app uses React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand. The package manager is npm.

The shared local Docker Compose stack builds this app with `apps/frontend/Dockerfile` and exposes Vite on `localhost:5173`.

## Continuity notes

- Keep setup, development, test, build, and environment instructions in `README.md` aligned with the implemented frontend.
- Add a real unit-test entrypoint if CI is expanded to run application tests.
