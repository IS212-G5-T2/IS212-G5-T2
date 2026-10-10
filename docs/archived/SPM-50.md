# SPM-50 AI usage history

Historical AI-assisted work associated with SPM-50.

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
