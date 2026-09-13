# Backend changelog

## Unreleased

- Added organisation-scoped persistent event request drafts, incomplete-field validation, retry-safe saves, version conflicts, and submitted-request edit protection.
- Added service-owned PostgreSQL migration and API integration tests.

- Added NestJS backend scaffold under `services/backend`.

- Moved story tests beside their owning source modules and updated runner discovery; removed the root Jira-key test layout. Restored conflicted package files exactly from dev.
- Removed draft authentication requirements and added a shared anonymous workspace. Restored PostgreSQL driver dependencies while retaining validation, revision checks, retry deduplication and submitted-request protection.
