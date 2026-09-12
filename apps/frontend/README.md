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

## Authentication (Firebase)

`/login` uses Firebase Authentication (Email/Password provider) via the Firebase JS SDK. Before running the app:

1. Create/use a Firebase project and register a Web app (Firebase console → Project settings → General → Your apps).
2. Enable the **Email/Password** sign-in provider (Authentication → Sign-in method).
3. Add at least one user (Authentication → Users).
4. `cp .env.example .env` in this directory and fill in the `VITE_FIREBASE_*` values from that web app's SDK config.

Without a valid `.env`, the app still starts, but sign-in fails — the browser console names the missing config values.