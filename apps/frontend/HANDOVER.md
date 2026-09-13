# Frontend handover

## Current state

This directory is a front-facing application under `apps/`. It is covered by the repository-level security workflow.

The app uses React, Vite, TypeScript, Tailwind CSS, React Router, and Zustand. The package manager is npm.

The shared local Docker Compose stack builds this app with `apps/frontend/Dockerfile` and exposes Vite on `localhost:5173`.

## Continuity notes

- Keep setup, development, test, build, and environment instructions in `README.md` aligned with the implemented frontend.
- Component tests run through `scripts/ci/unit-test.sh` and Vitest/Testing Library.
- Organiser My Requests and draft screens use the backend event-requests API. Other role screens still use the existing scaffold store; do not treat those as integrated workflows.
- Draft requests currently omit credentials and require no login. They use the backend shared anonymous workspace. Later authentication work must restore token/session integration and organisation isolation.
- Retry an uncertain save unchanged before editing further. Request IDs, operation IDs and versions coordinate with backend deduplication and optimistic concurrency. Navigation cancels stale loads so old responses cannot replace the current draft.
- Submission and Event Change Requests are separate integrations. Non-draft requests expose no draft-edit controls.
- Venue and equipment requirements now use addable grids. They are serialized into the existing string fields so SPM-37 remains compatible with the current API. SPM-50 should replace or map this temporary representation when maintained venue records become available; no venue-record work is included here.
# Required-field validation

The draft form marks the customer-specified request fields as required for submission, including layout, while allowing incomplete draft saves. Submit validates missing values and links inline errors to controls for accessibility. Actual submission remains an integration dependency; the complete-form path explicitly reports unavailability. The eventual submission API must enforce completeness server-side as well.

Run `npx playwright test` for the Playwright Chromium acceptance tests in `src/pages/draft-request.playwright.spec.ts`. Install its local browser once with `npx playwright install chromium` if needed.
