# Coverage exclusions

Two kinds of row. Both need a reason, or gate G5 blocks.

- `file`: a source file in a story's scope that no coverage run measures (for example a types-only file). It is removed from the measured set.
- `ignore-comment`: documents a coverage ignore comment (`/* v8 ignore */`, `/* istanbul ignore */`, `/* c8 ignore */`) in a scope source file. The file stays measured; the row gives the same reason as the comment. G5 blocks on an ignore comment with no row here.

See `ai/docs/test-workflow.md` section 7 (G5).

| File | Kind | Reason |
| --- | --- | --- |
| backend/src/equipment/equipment.controller.ts | ignore-comment | Nest decorator metadata is generated framework metadata, not executable controller behavior; the ignore boundaries are scoped to metadata only and controller behavior is exercised through unit tests and the dedicated HTTP suite. |
| backend/src/equipment/equipment.service.ts | ignore-comment | Nest injectable decorator metadata is generated framework metadata, not executable service behavior; service behavior remains measured and tested. |
| backend/src/equipment/requests/equipment-requests.controller.ts | ignore-comment | Nest controller decorator metadata is generated framework metadata, not executable controller behavior; route behavior remains exercised by controller unit and HTTP/PostgreSQL integration tests. |
| backend/src/equipment/requests/equipment-requests.service.ts | ignore-comment | Nest injectable decorator metadata is generated framework metadata, not executable service behavior; role, validation, and repository behavior remain unit-tested. |
| backend/src/venues/repository/venues.repository.ts | ignore-comment | The v8 ignore range covers only TypeScript decorator metadata; repository behavior remains measured and covered by unit/integration tests. |
| backend/src/venues/venues.controller.ts | ignore-comment | The v8 ignore range covers only Nest/TypeScript decorator metadata; route behavior is measured and covered by controller and HTTP tests. |
| backend/src/venues/venues.service.ts | ignore-comment | SPM-54 measures and tests booking submission, event-scoped booking history/cancellation, and read-only Venue Records browsing. The ignored ranges are the existing Nest injectable decorator metadata plus SPM-50 venue creation/duplicate-key translation and SPM-122 unavailable-period mutation methods, which are outside this story and remain owned by their own tests. |
