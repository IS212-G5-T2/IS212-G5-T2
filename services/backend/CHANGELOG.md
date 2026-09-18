# Backend changelog

## Unreleased

- Added validated PostgreSQL event submission and list/detail APIs with duplicate retry protection.

- Added NestJS backend scaffold under `services/backend`.

- Added versioned PostgreSQL draft saving, retry-safe updates, retrieval, and atomic submission with draft locking (SPM-37). Added API/database regression coverage and a browser test cleanup harness. Real organisation authentication remains deferred.
- Draft fields now accept an optional `formStep` so the frontend can resume a draft on the wizard step it was saved on (SPM-37).

- Pinned TypeScript 6.0.3 for Nest CLI compiler API compatibility after checking the locked dependency set during SPM-37 merge resolution.
