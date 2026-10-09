# AI Usage Log

Record current AI-assisted work in this file. Archive older entries under
[`docs/archived/`](docs/archived/README.md) only when a user explicitly asks to
archive them.

Add entries under one date per day, using this format:

```md
## YYYY-MM-DD

- <user or general> - <type> - <title>: <concise result>
```

## 2026-10-09

- swr - refactor - Organize backend modules by responsibility: Moved module validation contracts into `dto/`, registration report/export support into `registrations/report/`, integration suites into `backend/test/`, and mutation tooling into `scripts/mutation/`; updated only dependent paths, tooling, and documentation. Git rename inspection found no persistence, API, or service-behavior changes. Tests, lint, and build were intentionally not run at the user's request.
- swr - configuration - Align Codex and Claude agent model complexity: Corrected Codex implementation reasoning effort to `medium`; mapped Luna/Terra/Sol complexity to Claude Haiku/Sonnet/Opus with matching medium/high effort for implementation and review roles. Validated against current Codex and Claude Code agent configuration documentation.
- swr - refactor - Group Lead pages by workflow (Codex): Moved assignment queue and reassignment pages with their colocated tests into `src/features/lead/pages/assignment-queue/` and `reassignment/`; updated app imports and frontend layout documentation. Confirmed all four file contents unchanged and public routes retained. Verified the two page suites plus App and RouteAccess (66 tests), `npm run lint`, `npm run build`, stale-import search, and `git diff --check`; no Jira/Confluence task supplied, browser checks not run for this file-only move.
- swr - refactor - Organize frontend source by feature: Moved feature-owned pages, tests, components, fixtures, APIs, and types from the flat `src/pages` and `components/domain` layout into `src/features/`; moved routing into `src/app/`; preserved public routes and shared infrastructure. Updated path-sensitive coverage, mutation, and maintained frontend documentation. Verified `npx tsc -b --noEmit`, `npm run lint`, `npm test` (728 passed, 1 todo), `npm run build`, mutation-config syntax, the relocated SPM-63 X14 mutation (killed), and stale-path search.
- swr - documentation - Extend module organization guidance to backend: Added the backend layout reference for migrations, fresh database initialization, direct CI commands, mutation artifacts, NestJS modules, and E2E tests; aligned the frontend reference with the approved feature structure.
- swr - documentation - Add workflow-folder guidance to module organization: Defined when a feature should group independently routed or evolving user workflows with their local tests and support files, with Lead assignment and reassignment as an example.
