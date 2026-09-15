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
| technical_support@connectsphere.sg | technical_support |

These fixtures do not need to exist under Authentication -> Users in any Firebase project; the automated suite never contacts Firebase.

## Authentication (Firebase)

`/login` uses Firebase Authentication (Email/Password provider) via the Firebase JS SDK. Before running the app:

1. Create/use a Firebase project and register a Web app (Firebase console → Project settings → General → Your apps).
2. Enable the **Email/Password** sign-in provider (Authentication → Sign-in method).
3. Add at least one user (Authentication → Users).
4. `cp .env.example .env` in this directory and fill in the `VITE_FIREBASE_*` values from that web app's SDK config.

Without a valid `.env`, the app still starts, but sign-in fails — the browser console names the missing config values.

### Local Auth Emulator

The shared Compose stack starts a Firebase Auth Emulator and enables it for the
frontend automatically. It uses the safe emulator-only project ID `demo-is212`;
the browser reaches it at `http://localhost:9099`.

When running the frontend outside Compose, set these values in `.env` to use
the local emulator:

```dotenv
VITE_FIREBASE_PROJECT_ID=demo-is212
VITE_USE_FIREBASE_AUTH_EMULATOR=true
VITE_FIREBASE_AUTH_EMULATOR_URL=http://localhost:9099
```

Leave `VITE_USE_FIREBASE_AUTH_EMULATOR` unset or `false` to use a real Firebase
project. Use a dedicated non-production project for real-Firebase smoke tests.
