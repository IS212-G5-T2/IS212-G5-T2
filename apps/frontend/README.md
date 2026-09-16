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
GitHub Actions runs the suite with coverage through `scripts/ci/unit-test.sh`.
The SPM-30 login page, Firebase-role mapper, and access guards are enforced at
100% statements, branches, functions, and lines; unrelated in-memory domain
features retain their own coverage backlog.

```sh
npm test              # run the suite once
npm run test:watch    # re-run on file changes while developing
npm run test:coverage # run once with a coverage report
```

 Test files live alongside the code they cover (e.g. `src/pages/LoginPage.test.tsx` next to `src/pages/LoginPage.tsx`). Shared test helpers and fixtures live in `src/test/` (`src/test/setup.ts` for global setup, `src/test/fixtures/` for reusable test data).

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
successful sign-in alone. Organiser event creation and event edit routes are
restricted to the organiser responsible for that event. Event-change reviews
are restricted to the coordinator assigned to the event.
Attendees can browse registration-enabled events and create or withdraw only
their own registrations. Direct navigation to operational venue, booking, and
equipment routes is denied to attendees.

### Local Compose Firebase

The shared Docker Compose stack uses the real Firebase Web app configuration
from `development/local-dev/.env`; it does not start a Firebase emulator. Use a
dedicated non-production Firebase project and test accounts. Keep
`VITE_USE_FIREBASE_AUTH_EMULATOR` unset or `false` for this mode.

The Firebase Auth Emulator is used only by the GitHub Actions backend E2E test.
