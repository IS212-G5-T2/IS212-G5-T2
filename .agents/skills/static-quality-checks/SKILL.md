---
name: static-quality-checks
description: Run the repository's configured lint and build checks for changed components during a code quality review. Use when review evidence needs local static validation; do not use to run or replace behavioral test review.
---

# Static quality checks

Use for assigned changed paths and a stable review snapshot. Read the component's `AGENTS.md`, package scripts, and relevant CI entrypoint first; run only checks that cover the changed component or its integration.

In this repository:

- `frontend/`: from `frontend/`, run `npm run lint`; run `npm run build` when TypeScript or production-build validity is relevant. Build writes generated output, so check its destination and Git status before and after.
- `backend/`: from `backend/`, run `npm run lint` (Oxlint) and `npm run build` when relevant. The build writes generated output; check its destination and Git status before and after.
- `docker-compose/`, `database/`, or workflow changes: use only a validation command documented for the affected area; do not invent a general lint command.

Do not install dependencies, run formatters in write mode, edit files, or run unit/integration tests as a substitute for the Test Reviewer. Do not claim CI security scans ran unless their results are available. If a required tool is missing or a generated output could overwrite user data, stop that check and report the limitation.

Return exact commands, results, relevant diagnostics, generated-file effects, and skipped checks to the reviewer. These checks support engineering review; they do not establish requirement correctness or a passing review gate.
