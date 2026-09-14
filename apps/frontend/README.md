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

`VITE_API_BASE_URL` defaults to `http://localhost:8080`. No sign-in is implemented here; the local demo organiser is fixed. Save Draft and email delivery are deferred.

Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` from this directory. SPM-36 page-level component tests live beside `EventCreatePage.tsx` and `EventListPage.tsx` under `src/pages`. Tests use Vitest, jsdom, React Testing Library, and user-event; CI invokes `scripts/ci/unit-test.sh`. Component tests are not a substitute for visual browser verification.
