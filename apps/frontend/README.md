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
