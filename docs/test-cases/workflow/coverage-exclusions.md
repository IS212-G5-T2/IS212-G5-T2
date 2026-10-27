# Coverage exclusions

Two kinds of row. Both need a reason, or gate G5 blocks.

- `file`: a source file in a story's scope that no coverage run measures (for example a types-only file). It is removed from the measured set.
- `line`: one uncovered line of a scope source file that is excluded for the reason given; the File column names `path:line`. Its status in coverage-line-status.md is EXCLUDED and must point to this row.
- `ignore-comment`: documents a coverage ignore comment (`/* v8 ignore */`, `/* istanbul ignore */`, `/* c8 ignore */`) in a scope source file. The file stays measured; the row gives the same reason as the comment. G5 blocks on an ignore comment with no row here.

See `ai/docs/test-workflow.md` section 7 (G5).

| File | Kind | Reason |
| --- | --- | --- |
| backend/src/equipment/equipment.controller.ts | ignore-comment | Nest decorator metadata is generated framework metadata, not executable controller behavior; the ignore boundaries are scoped to metadata only and controller behavior is exercised through unit tests and the dedicated HTTP suite. |
| backend/src/equipment/equipment.service.ts | ignore-comment | Nest injectable decorator metadata is generated framework metadata, not executable service behavior; service behavior remains measured and tested. |
| backend/src/event-drafts/drafts.service.ts | ignore-comment | Lines 16 and 19 (`/* v8 ignore start/stop */`) wrap the `@Injectable()` class declaration. The ignored branch is the TypeScript `emitDecoratorMetadata` paramtype fallback, which is generated decorator metadata, not project logic, and no behaviour test can reach it. Decided by the user (SPM-150 Sprint 1 closure). **Needs product owner confirmation.** |
| backend/src/clarifications/clarifications.service.ts | ignore-comment | Lines 37 and 39 (`/* v8 ignore start/stop */`) wrap the `@Injectable()` class declaration. The ignored branch is the TypeScript `emitDecoratorMetadata` paramtype fallback for the constructor injection of the service dependencies, which is generated decorator metadata, not project logic. Routes and service behaviour are measured through the clarification unit and e2e suites. |
| backend/src/event-drafts/drafts.controller.ts | ignore-comment | Lines 6 and 8 (`/* v8 ignore start/stop */`) wrap the `@Controller()` class declaration. The ignored branch is the TypeScript `emitDecoratorMetadata` paramtype fallback for the constructor injection of DraftsService, which is generated decorator metadata, not project logic. Owner-confirmed (SPM-150, option 3). Routes are measured through the draft e2e suite. |
| frontend/src/features/events/types/draft.ts | file | types-only module, no executable statements. **Needs product owner confirmation.** |
| backend/src/event-drafts/drafts.controller.ts:6 | line | decorator metadata fallback, not project logic; decided by product owner for SPM-150 (SPM-37; the class-decorator metadata branch on this line). No code change. |
| backend/src/clarifications/clarifications.controller.ts:11 | line | decorator metadata fallback, not project logic; decided by product owner for SPM-150 (SPM-39; the class-decorator metadata branch on this line). No code change. |
| backend/src/clarifications/clarifications.service.ts:38 | line | decorator metadata fallback, not project logic; decided by product owner for SPM-150 (SPM-39; the class-decorator metadata branch on this line). No code change. |
| backend/src/clarifications/repository/clarifications.repository.ts:53 | line | decorator metadata fallback, not project logic; decided by product owner for SPM-150 (SPM-39; the class-decorator metadata branch on this line). No code change. |
| backend/src/events/review/event-rejections.controller.ts:5 | line | decorator metadata fallback, not project logic; decided by product owner for SPM-150 (SPM-83; the class-decorator metadata branch on this line). No code change. |
| frontend/src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx:28 | line | owned by SPM-51 (product owner decision): the generic selection callback; tested under SPM-51. |
| frontend/src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx:292 | line | owned by SPM-51 (product owner decision): the generic selection callback; tested under SPM-51. |
| frontend/src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx:296 | line | owned by SPM-51 (product owner decision): the generic selection callback; tested under SPM-51. |
| backend/src/equipment/requests/equipment-requests.controller.ts | ignore-comment | Nest controller decorator metadata is generated framework metadata, not executable controller behavior; route behavior remains exercised by controller unit and HTTP/PostgreSQL integration tests. |
| backend/src/equipment/requests/equipment-requests.service.ts | ignore-comment | Nest injectable decorator metadata is generated framework metadata, not executable service behavior; role, validation, and repository behavior remain unit-tested. |
| backend/src/venues/repository/venues.repository.ts | ignore-comment | The v8 ignore range covers only TypeScript decorator metadata; repository behavior remains measured and covered by unit/integration tests. |
| backend/src/venues/venues.controller.ts | ignore-comment | The v8 ignore range covers only Nest/TypeScript decorator metadata; route behavior is measured and covered by controller and HTTP tests. |
| backend/src/venues/venues.service.ts | ignore-comment | SPM-54 measures and tests booking submission, event-scoped booking history/cancellation, and read-only Venue Records browsing. The ignored ranges are the existing Nest injectable decorator metadata plus SPM-50 venue creation/duplicate-key translation and SPM-122 unavailable-period mutation methods, which are outside this story and remain owned by their own tests. |
