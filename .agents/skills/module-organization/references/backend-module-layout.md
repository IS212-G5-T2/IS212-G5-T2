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

During an authorized organization scan, inspect every existing source and test
file against each applicable category above—not only the capability folders:
move request/response contracts and validation into `dto/`, module-owned types
into `types/`, focused module-private helpers into `helpers/`, and existing
persistence query classes plus their unit tests into `repository/`. Keep tests
beside the source they exercise. Re-home cross-domain utilities under an
appropriate shared owner instead of leaving them in the first domain that used
them. Do not extract inline service logic into new files as part of a
file-movement-only task; record it as a possible follow-up if it materially
obscures ownership.

### Optional capability folders

Assess every domain for independently evolving user workflows. When a capability
owns multiple related files, an optional capability folder can keep its
controller, provider, DTOs, helpers, fixtures, and colocated unit tests together:

```text
<module>/
  <module>.module.ts
  <module>.service.ts          shared provider, when several capabilities use it
  <capability>/
    <capability>.controller.ts
    <capability>.service.ts    only when an existing provider belongs here
    <capability>.service.spec.ts
    dto/                      capability-owned validation and contracts
```

This and the flat module layout above are illustrative examples, not a migration
checklist or a priority ordering for named domains. Apply the same ownership
assessment to every domain; retain a flat module when a nested folder would only
isolate a single simple file or duplicate its existing domain boundary. Keep
shared providers, controllers, repositories, and contracts at module level when
they serve multiple capabilities. A file-organization task does not require
splitting their methods or changing NestJS module registration to match a tree.
Keep E2E suites in `backend/test/` even when their owning capability is nested.

Promote a capability to its own top-level `src/<domain>/` directory when it
owns a controller, provider, routes, and persistence boundary that can evolve
independently of its former parent. Move its DTOs, helpers, and colocated unit
tests with it. When the capability still depends on the parent module's shared
provider or repository, keep it nested instead; a top-level directory alone
must not imply a new NestJS module or force a provider split.

Use the repository's established plural names for entity domains (`events/`,
`venues/`, `registrations/`). A compound top-level name can identify an
independent capability (`event-drafts/`, `coordinator-availability/`). Choose
the name after identifying its ownership boundary; do not promote or rename a
folder just to make capability names look uniform.

For orientation, the current `event-drafts/` has a dedicated controller and
service for its own draft workflow, while `events/review/` uses the shared
`EventsService`. The `venues/` domain owns catalogue reads, creation, and
unavailability through one controller, service, and repository, so its
`creation/` and `availability/` folders remain internal capabilities unless
those owners are split. These are examples from the current tree, not a list of
required migrations. Scan each domain independently and retain shared providers
at the highest common owner.

Put backend E2E and cross-module integration suites in `backend/test/`, using the repository's `.e2e-spec.ts` naming and dedicated E2E configuration. Move an existing colocated E2E suite only as part of authorized reorganization, after updating its test configuration, commands, and documentation.
