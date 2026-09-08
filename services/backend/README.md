# Backend

NestJS backend service for the IS212 G5 T2 workspace.

This service was scaffolded with the official Nest CLI using npm and strict TypeScript settings. It currently exposes the generated starter endpoint and should be extended around Jira acceptance criteria.

## Setup

Install dependencies:

```sh
npm ci
```

Run the development server:

```sh
npm run start:dev
```

The service listens on `PORT` when set, otherwise `3000`.

## Checks

Run local checks from this directory:

```sh
npm run lint
npm test
npm run test:e2e
npm run build
```

The monorepo test workflow runs `scripts/ci/unit-test.sh`, which currently delegates to `npm test`.

## Branch Flow

Start new work from the latest `staging`, create a focused feature/fix/docs/chore branch, and open a GitHub pull request back into `staging`.

No deployment command is configured for this repository.
