# Backend

NestJS backend service for the IS212 G5 T2 workspace.

This service was scaffolded with the official Nest CLI using npm and strict TypeScript settings. It exposes the starter endpoint, a health check, and shared Firebase JWT middleware/RBAC services for protected endpoints.

## Authorization

Route-owning modules should apply `FirebaseAuthenticationMiddleware` to protected controllers. The app module applies it to the current app controller, and future feature modules can apply the same middleware to their own controllers. The middleware:

- Leaves public `GET /` and `GET /healthz` requests alone.
- Requires `Authorization: Bearer <Firebase ID token>` for other routes.
- Verifies the token with Firebase Admin before trusting any claims.
- Extracts the authenticated Firebase `uid` and normalized `roles` claim.
- Attaches the verified user to `request.currentUser`.

`RbacRepository` reads PostgreSQL `roles`, `resources`, and `role_permissions` rows and builds composable permission predicates for resource queries. Protected resource repositories should include the predicate and ownership condition in the same `SELECT`, `INSERT`, `UPDATE`, or `DELETE` statement.

### Assigning local Firebase test roles

For the five manual integration-test users, update the email placeholders in `scripts/set-firebase-roles.mjs`, then run it from this directory:

```sh
FIREBASE_SERVICE_ACCOUNT_PATH="/absolute/path/to/service-account.json" \
  node scripts/set-firebase-roles.mjs
```

Generate the service-account JSON in Firebase Console → Project settings → Service accounts. Keep it outside the repository and do not commit it. The script preserves other custom claims while setting `roles` to an array of supported values: `ORGANISER`, `COORDINATOR`, `VENUE_STAFF`, `TECH_SUPPORT`, or `ATTENDEE`. Users can have more than one role, for example `roles: ['ORGANISER', 'ATTENDEE']`. Users must sign out and back in after the script completes.

Auth code is organized by responsibility:

| Path | Purpose |
| --- | --- |
| `src/auth/authentication/` | Firebase ID token verification and request authentication middleware. |
| `src/auth/authorization/` | RBAC permission and ownership checks. |
| `src/auth/models/` | Shared auth user, role, permission, and public-route models. |

## Database Access

`DatabaseModule` owns the shared PostgreSQL pool through `DatabaseService`. Repositories should inject `DatabaseService` instead of creating their own `pg.Pool` instances. The shared pool sets connection, idle, and query timeouts and is closed through Nest module shutdown hooks.

Use `DatabaseService.query()` for single SQL statements and `DatabaseService.transaction()` for multi-step insert/update/upsert/delete flows that must commit or roll back together. Keep table-specific SQL, joins, and domain rules inside repositories rather than adding generic CRUD methods to `DatabaseService`.

Required runtime configuration:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used for RBAC lookups. |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Optional path to a Firebase service account JSON file for local development. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional raw Firebase service account JSON fallback for CI/emergency use. |

If both Firebase service account variables are omitted, Firebase Admin uses application default credentials.

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

Start new work from the latest `dev`, create a focused feature/fix/docs/chore branch, and open a GitHub pull request back into `dev`.

No deployment command is configured for this repository.
