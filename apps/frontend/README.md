 # Frontend

This directory contains the React/Vite frontend for the workspace.

## Development

Start from the latest `dev`, create a focused feature/fix/docs/chore branch, and open a GitHub pull request back into `dev`.

Coding agents follow the [global policy](../../AGENTS.md), [app rules](../AGENTS.md), and [frontend-specific rules](AGENTS.md).

Install dependencies:

```sh
npm ci
```

Run the development server:

```sh
npm run dev
```

The shared Docker Compose stack can also run the frontend from `development/local-dev`:

```sh
cd ../../development/local-dev
docker compose up --build frontend
```

## Checks

Run the configured frontend checks from this directory:

```sh
npm run lint
npm run build
```

No deployment command is configured for this repository.

## Event request workflow

Open `/planning` or `/events` and choose Create Event. The light-mode three-step form collects basic information, schedule/venue needs, and equipment needs. Successful submission opens the saved details and shows a confirmation. My Events reloads records from PostgreSQL through the backend API. Dates use the browser's local time zone and are sent as UTC.

`VITE_API_BASE_URL` defaults to `http://localhost:8080`. No sign-in is implemented here; the local demo organiser is fixed. Email delivery is deferred. Draft saving is described below.

Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` from this directory. SPM-36 page-level component tests live beside `EventCreatePage.tsx` and `EventListPage.tsx` under `src/pages`. Tests use Vitest, jsdom, React Testing Library, and user-event; CI invokes `scripts/ci/unit-test.sh`. Component tests are not a substitute for visual browser verification.

## Draft requests (SPM-37)

The current three-step event form supports **Save draft** at every step. Required fields apply to submission only. A successful save shows a confirmation dialog; OK opens **My Requests**. Drafts can be reopened, edited, saved repeatedly, and refreshed without losing successfully saved values. Files (up to five, 1 MB each) and partially entered dates/times are retained. Failed saves keep the form available for retry. An old tab cannot overwrite a newer version.

`/requests` lists saved requests; `/requests/:id` reuses the current event form. Submitting a draft creates the submitted event atomically and permanently closes draft editing. Further changes use the Event Change Requests workflow. Real organisation isolation (AC7) is deferred; the existing local demo organiser is shared.

Start with `npm run dev`, then open http://localhost:5173. The API defaults to http://localhost:8080; set `VITE_API_BASE_URL` before starting Vite to use another endpoint. Apply the backend draft migration before saving. Use Node 24 LTS for the toolchain.

Run `npm test`, `npm run lint`, and `npm run build`. Browser acceptance tests live beside the page as `EventCreatePage.playwright.spec.ts`; install Chromium with `npx playwright install chromium`. Run the backend browser harness described in the backend README against a test database; it removes only its own records. Browser specs are excluded from Vitest and the production TypeScript build.
