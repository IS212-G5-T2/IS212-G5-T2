# Frontend agent rules

Scope: `frontend/`, within the [global policy](../AGENTS.md).

## Ownership

- This directory owns the React/Vite client, browser-facing behavior, frontend API client and state, UI assets, and frontend tests.
- It does not own backend business rules or persistence, local database initialization, shared Docker Compose tooling, CI orchestration, or production infrastructure.
- Coordinate API contracts and authentication behavior with `backend/`; inspect both scoped instruction files for cross-boundary work.

## Shared Jira agent workflow

For Jira work, follow [`.ai/workflow/README.md`](../.ai/workflow/README.md) and [`.ai/agents/implementation.md`](../.ai/agents/implementation.md). Agent 1 owns implementation and automated tests across affected components. Jira and Confluence context is captured once under `.ai/runtime/{ticket_id}/`; use the requirements and exact Confluence test cases in that snapshot. Agents 2–4 review independently without editing; the orchestrator reconciles findings, selectively reruns affected reviewers within the bounded retry, and runs final checks. Do not create a frontend-specific agent flow or rely on conversation history instead of runtime artifacts.

## Runtime and commands

- Stack: React, Vite, TypeScript, Tailwind CSS, React Router, Zustand, and npm. Check the current package and config files before changing the toolchain.
- Run from `frontend/`:

  ```sh
  npm ci
  npm run dev
  npm test
  npm run lint
  npm run build
  ```

- CI unit-test entrypoint: [`scripts/ci/unit-test.sh`](scripts/ci/unit-test.sh). Vitest uses jsdom and React Testing Library; Playwright specs are separate from Vitest and the production TypeScript build.
- Backend tests do not verify browser behavior. Report browser, Firebase, or API integration checks that could not be run.

## Target source organization

Use feature ownership for new and substantially changed frontend work. Do not mass-move existing files as part of an unrelated ticket; broad migration can happen as a dedicated refactor. Keep the route entrypoints and genuinely shared UI separate from feature-specific behavior:

| Location | Responsibility |
| --- | --- |
| `src/pages/` | Route-level page composition. Keep the page's tests and small page-only pieces colocated. |
| `src/features/<feature>/` | Feature-specific components, hooks, API operations, types, and tests when a feature has enough code to form a clear boundary. Prefer this over growing global buckets for new multi-file features. |
| `src/components/ui/`, `auth/`, `layout/` | UI primitives and components genuinely shared across routes for presentation, authentication, or application chrome. |
| `src/components/domain/` | Reusable domain components shared by multiple features. Do not use it as a catch-all for one feature's components. |
| `src/lib/` | Cross-feature integrations and foundational client logic such as authentication. |
| `src/utils/api.ts` | Shared HTTP transport, credentials, timeout, and error handling. Feature-specific request functions belong with their feature when they grow beyond a simple call. |
| `src/store/` | Cross-page or app-wide state in the existing Zustand stores. Keep temporary form/display state local to the component or page. |
| `src/types/` | Types shared by multiple features or common API contracts. Keep feature-only types inside that feature. |
| `src/test/` | Shared test setup and fixtures. Keep feature-specific fixtures/helpers beside the feature. |

For a substantial feature, organize related code together, for example `src/features/events/{components,hooks,api,types}` with page-level routes in `src/pages/`. A tiny feature can remain colocated in `pages/` until it needs that boundary. Do not make both a global and feature-local copy of API clients, state, types, or helpers. Avoid moving existing files solely to match the target layout.

## UI, state, and API guidance

- Keep pages responsible for composing a route. Extract focused components when they have meaningful behavior, reuse, or independent tests.
- Use semantic HTML, accessible labels and keyboard behavior, visible validation/errors, and the existing UI primitives and Tailwind conventions. Do not add another design system without a concrete requirement.
- Keep the backend authoritative for data and authorization. Client route guards improve UX but do not replace backend checks.
- Keep request/response shapes aligned with `backend/`. Use the shared `api()` client for common transport behavior; do not duplicate raw `fetch` logic without a concrete need.
- Use Zustand for state shared across routes/workflows and local React state for transient interaction state.

## Tests and documentation

- Put unit/component tests beside pages or components as `.test.tsx`. Put browser workflows beside their page as `.playwright.spec.ts`; keep browser specs excluded from Vitest and production compilation.
- Extend the existing behavior-focused page/component suite when adding coverage for another ticket. Do not create ticket-named test files such as `EventsAccept.test.tsx`; use the established `.test.tsx` suite and identify the Jira key in the test name or nearby case comment.
- Use `src/test/setup.ts` and shared fixtures under `src/test/`. Keep fixtures outside production entrypoints.
- Follow root test naming/comment guidance. Test observable behavior and meaningful failure states; mocked tests do not prove live integration.
- Add JSDoc to exported components, hooks, functions, and types, plus new or materially changed nontrivial functions. Explain intent and use `@param`, `@returns`, and `@throws` where they clarify the contract; keep the documentation accurate as behavior changes.
- Run `npm test`, `npm run lint`, and `npm run build` for relevant changes. Run the owning Playwright/browser workflow when needed and available; record limitations.
- Update [README.md](README.md) for setup, tests, build, and environment changes. Document variable names/placeholders only; keep `.env` values private.
