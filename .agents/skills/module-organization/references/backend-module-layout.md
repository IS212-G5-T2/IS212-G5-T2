# Backend module layout

Use this reference when adding or materially reorganizing backend code. It defines the target layout; do not create empty directories or move existing working files unless the assignment includes the migration and its validation.

## Backend root

```text
backend/
  migrations/            incremental upgrades for existing databases
  scripts/mutation/      review mutation definitions and runner support
  src/<module>/          NestJS domain modules and colocated unit tests
  test/                  backend E2E and cross-module integration tests
```

### Database changes

For a database change, add an ordered migration under `backend/migrations/` for existing installations. Keep fresh local database initialization correct by applying the same schema change to `database/postgresql/init/001_schema.sql`; update `002_seed_data.sql` when the change needs seed or lookup data. Read the `database/` scoped instructions before changing those files.

Do not treat a migration as a replacement for the fresh initializer, or the fresh initializer as a replacement for an upgrade migration.

### CI and mutation work

Do not add new backend `scripts/ci/` wrappers. When a backend unit-test command changes as part of authorized CI work, update `.github/workflows/tests.yml` to run the needed command directly from `backend/` and keep the workflow evidence clear.

Keep mutation artifacts used by test review in `backend/scripts/mutation/`. The current `scripts/testing/mutation/` location is existing structure; move it only during an authorized backend organization migration, updating commands and documentation together.

### Modules and tests

Keep each NestJS domain under `backend/src/<module>/`:

```text
<module>/
  <module>.module.ts
  <module>.controller.ts
  <module>.service.ts
  dto/          request/response contracts and runtime validation
  types/        module-owned TypeScript types
  helpers/      focused module-private helpers
  repository/   module-owned persistence queries
  *.spec.ts     colocated unit tests
```

Create only directories the module uses. Keep validation in DTOs, persistence in a repository when that boundary exists, and business decisions in providers/services. Avoid duplicate types and generic helper dumping grounds. `repository/` is optional when persistence is absent or a different established pattern is in use.

Put backend E2E and cross-module integration suites in `backend/test/`, using the repository's `.e2e-spec.ts` naming and dedicated E2E configuration. Move an existing colocated E2E suite only as part of authorized reorganization, after updating its test configuration, commands, and documentation.
