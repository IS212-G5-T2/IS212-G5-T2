# Frontend agent rules

Scope: `frontend/`; follow [../AGENTS.md](../AGENTS.md).

## Current state

- Client app: React, Vite, TypeScript, Tailwind CSS, React Router, Zustand, npm. Check current files and Jira before changing conventions.
- [Security CI](../.github/workflows/security.yml) does not verify browser behavior. Keep setup, test, lint, and build docs current.

## Implementation guidance

- When changing client code, keep [README.md](README.md) setup, development, test, build, and environment commands current.
- Verify client behavior with frontend checks; backend checks alone do not prove browser workflows.
- Coordinate API contracts with `backend/`; verify connectivity before claiming it works.

## Event workflow checks

Run `npm test` (Vitest/jsdom), `npm run lint`, and `npm run build`; CI uses `scripts/ci/unit-test.sh`. Event create/list/detail uses `/api/events`; drafts/My Requests use `/api/requests`. Align both with `backend/`. Real account/organisation integration and email delivery are separate.

Place `.test.tsx` unit tests and `.playwright.spec.ts` browser tests beside their page/component; keep fixtures in `frontend/` outside production entrypoints. Comment briefly above cases and key setup/action/assertion sections. Exclude Playwright from production build/Vitest. Run browser checks through backend `scripts/testing/run-browser.mjs` with a dedicated test database; record cleanup.

Maintain behavior-focused suites, not Jira-keyed trees. Put Jira keys and AC wording in test names/nearby comments.
