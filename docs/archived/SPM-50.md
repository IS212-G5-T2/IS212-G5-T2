# SPM-50 AI usage history

Historical AI-assisted work associated with SPM-50.

## 2026-10-14

- swr - fix - SPM-50/SPM-51 - Repair review test evidence: Updated venue detail tests for API-backed loading, stale requests, event return context, server reservations, and removed-hour regressions; corrected backend mutation mapping execution and scratch schema asset handling.

## 2026-10-13

- swr - implementation - SPM-50 - Remove operating hours from venue creation: Reopened correction removes operating days and opening times from the form and required API fields; omitted schedules receive a full-week compatibility value for availability consumers. Frontend/backend coverage, lint, and build checks recorded on the fix branch.
- swr - testing - SPM-50 - Add mutation and PostgreSQL evidence: Add validated exact-title frontend/backend mutation mappings (8 mutants, all killed) and a current-field HTTP/PostgreSQL creation case asserting returned and persisted operating information plus compatibility schedule; E2E passed against disposable local PostgreSQL.

- swr - implementation - SPM-50 - Remove operating schedule data: Dropped operating days/start/end fields from the venue API, database, types, and displays; added the upgrade migration and regression coverage.
- swr - testing - SPM-50/SPM-51 - Strengthen schedule-removal and full-day calendar regressions: Added isolated PostgreSQL execution of the complete fresh schema, null/partial legacy-input, four-view Open 24 hours/24/7, and full-day grid mutation checks; BE-50-05 was killed by an ALTER-after-create mutant in the fresh-init test. Backend E2E mutants were previously skipped without DATABASE_URL; frontend view mutants passed 8/8, and slot bound mutants passed 2/2. Browser interaction passed with a clear 02:00–04:00 SGT selection.

## 2026-10-05

- swr - implementation - Link SPM-50 venues to their creator: Added `venues.owner_user_id` as a UUID foreign key to the local `users` table.
- swr - implementation - Normalize venue operating-time API output: Fixed the remaining CI E2E assertion by normalizing PostgreSQL `time` output from `HH:MM:SS` to the SPM-50 API contract's `HH:MM` format.
- swr - fix - Repair venue module duplicate imports: Removed the duplicated `VenuesController` and `VenuesModule` imports that prevented Vitest from transforming the Nest application and caused every E2E suite to fail before execution.
- swr - testing - Strengthen SPM-50 mutation-sensitive coverage: Reviewed the SPM-50 branch history and added business-rule, malformed-input, Base64-padding boundary, API-failure isolation, and selected/empty accessibility relationship coverage.
- swr - implementation - Make SPM-50 accessibility selections optional: Removed the requirement to select an accessibility feature.
- swr - implementation - Clarify SPM-50 venue duration fields: Placed required setup and turnaround duration inputs side by side on wider screens while retaining a single-column narrow-screen layout.

## 2026-10-04

- swr - implementation - Structure SPM-50 venue operating schedule: Corrected the revised AC2 so operating information remains a multiline field while operating hours are a structured schedule: selected operating days plus required start and end times.
- swr - implementation - Implement SPM-50 AC7 venue redirect: Implemented the newly added AC7: after a successful venue POST, Venue Staff are redirected to the existing venue catalogue and receive the server confirmation there.
- swr - implementation - Cover SPM-50 shared uploads and venue displays: Added unit tests for shared FileReader success/failure behavior, event edit upload integration, optional venue images, setup/turnaround displays, and Venue Staff creation navigation.
- swr - fix - Remove SPM-50 catalogue coupling: Removed premature catalogue reads and links from the SPM-50 creation flow.
- swr - testing - Correct SPM-50 persistence test scope: Replaced the retrieval/display-dependent VEN-CRE-05-B scenario with direct PostgreSQL persistence verification by generated UUID, and replaced VEN-CRE-05-C with an atomic rollback scenario for failed venue creation.
- swr - implementation - Normalize SPM-50 venue options and add image step: Reworked venue creation into two pages: venue details with exactly one scalar location and the existing accessibility pills, followed by controlled facility and room-layout selections plus one optional image.
- swr - implementation - Generate SPM-50 venue UUIDs: Moved venue ID generation from the form to PostgreSQL UUIDs.
- swr - testing - Record SPM-50 Confluence test evidence: Updated Confluence test pages, fixtures and passing execution evidence for current SPM-50 criteria.

## 2026-10-03

- swr - implementation - Implement SPM-50 venue creation: Added Venue Staff creation UI and protected API with PostgreSQL persistence, feedback and duration validation.
