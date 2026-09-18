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
npm test
```

No deployment command is configured for this repository.

## Testing

Unit tests use [Vitest](https://vitest.dev) with [React Testing Library](https://testing-library.com/react) and jsdom.
GitHub Actions is configured to run the suite with coverage through
`scripts/ci/unit-test.sh`. The coverage configuration declares thresholds for
the SPM-30 login page, Firebase-role mapper, and access guards; the thresholds
are meaningful only when the selected suite passes and includes those tests.

```sh
npm test              # run the suite once
npm run test:watch    # re-run on file changes while developing
npm run test:coverage # run once with a coverage report
```

Test files live alongside the code they cover (for example,
`src/pages/LoginPage.test.tsx` next to `src/pages/LoginPage.tsx`). Shared test
helpers and fixtures live in `src/test/` (`src/test/setup.ts` for global setup,
`src/test/fixtures/` for reusable test data).

The standard Vitest command currently loads `vitest.config.ts`, which selects
`src/**/*.test.tsx`. Any `.test.ts` files are not run by that command. Do not
claim complete coverage until the test selection includes every intended test
file and the suite passes.

`LoginPage` tests mock the Firebase Auth SDK call (`signInWithEmailAndPassword`) instead of hitting a real Firebase project, so the suite runs offline and deterministically in CI. The mock accounts used to parameterize the "correct credentials" cases are documented in `src/test/fixtures/authUsers.ts`; their password is deliberately fake and test-only:

| Email | Role |
| --- | --- |
| attendee@connectsphere.sg | attendee |
| organiser@connectsphere.sg | organiser |
| coordinator@connectsphere.sg | coordinator |
| venue_staff@connectsphere.sg | venue_staff |
| technical_support@connectsphere.sg | tech_support |

These fixtures do not need to exist under Authentication -> Users in any Firebase project; the automated suite never contacts Firebase.

## Authentication (Firebase)

`/login` uses Firebase Authentication (Email/Password provider) via the Firebase JS SDK. Before running the app:

1. Create/use a Firebase project and register a Web app (Firebase console → Project settings → General → Your apps).
2. Enable the **Email/Password** sign-in provider (Authentication → Sign-in method).
3. Add at least one user (Authentication → Users).
4. `cp .env.example .env` in this directory and fill in the `VITE_FIREBASE_*` values from that web app's SDK config.

Without a valid `.env`, the app still starts, but sign-in fails — the browser console names the missing config values.

Firebase users must also have a supported custom `roles` claim (`ORGANISER`,
`COORDINATOR`, `VENUE_STAFF`, `TECH_SUPPORT`, or `ATTENDEE`). The frontend maps
that verified Firebase claim to its UI role; it does not assume a role from a
successful sign-in alone. The route guards restrict organiser event creation,
organiser-owned edits, and coordinator change-request reviews in the client.
The in-memory registration actions are also limited to the signed-in attendee.

These are frontend controls. The API client forwards the signed-in Firebase ID
token as a Bearer credential, but the current event API does not yet verify it
or use Firebase identity for event access. The event-management flow is
therefore not an end-to-end Firebase authorization implementation.

### Local Compose Firebase

The shared Docker Compose stack uses the real Firebase Web app configuration
from `development/local-dev/.env`; it does not start a Firebase emulator. Use a
dedicated non-production Firebase project and test accounts. Keep
`VITE_USE_FIREBASE_AUTH_EMULATOR` unset or `false` for this mode.

The Firebase Auth Emulator is used only by the GitHub Actions backend E2E test.
## Event request workflow

Open `/planning` or `/events` and choose Create Event. The light-mode three-step form collects basic information, schedule/venue needs, and equipment needs. Successful submission opens the saved details and shows a confirmation. My Events reloads records from PostgreSQL through the backend API. Dates use the browser's local time zone and are sent as UTC.

In the Compose stack, `VITE_API_BASE_URL` is set to `http://localhost:3000`.
The API helper falls back to `http://localhost:8080` only when that environment
variable is absent. Sign-in is implemented through Firebase. The event API,
however, currently uses a fixed local demo organiser and is not tied to the
signed-in Firebase user. Save Draft and email delivery are deferred.

Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` from this directory. SPM-36 page-level component tests live beside `EventCreatePage.tsx` and `EventListPage.tsx` under `src/pages`. Tests use Vitest, jsdom, React Testing Library, and user-event; CI invokes `scripts/ci/unit-test.sh`. Component tests are not a substitute for visual browser verification.
