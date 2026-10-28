## Summary

Adds coordinator requests for tentative venue holds, approval-time eligibility and conflict checks, and hold status/expiry visibility. Includes timing-change invalidation, setup-change reassessment, and expiry-safe venue availability handling.

Published PR head: `ff96471c`. Additional local corrections, including migration 025, have not yet been pushed; local results below are not CI evidence for the published head.

## Jira Ticket

[SPM-159 — Request a Tentative Hold on a Venue (Coordinator)](https://is212-g5-t2.atlassian.net/browse/SPM-159)

Jira status at implementation start: To Do (recorded in the existing PR); current correction status: In Review.

Existing branch or PR reused: Existing feature branch and [PR #83](https://github.com/IS212-G5-T2/IS212-G5-T2/pull/83).

## User Story And Acceptance Criteria

[Jira story and AC1–AC13](https://is212-g5-t2.atlassian.net/browse/SPM-159). AC9 remains in this story, as recorded in the [28 October owner decision](https://is212-g5-t2.atlassian.net/browse/SPM-159?focusedCommentId=10101).

[Test matrix](https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/34603557) · [Test records](https://github.com/IS212-G5-T2/IS212-G5-T2/blob/feature/SPM-159-Request-a-Tentative-Hold-on-a-Venue-Coordinator/docs/test-cases/workflow/records/SPM-159.csv) · [Test scope](https://github.com/IS212-G5-T2/IS212-G5-T2/blob/feature/SPM-159-Request-a-Tentative-Hold-on-a-Venue-Coordinator/docs/test-cases/workflow/scopes/SPM-159.json)

Final acceptance remains pending; local automated evidence does not certify manual execution, customer policy confirmation, or the latest complete working-tree review.

- [ ] Acceptance criteria are implemented.
- [ ] Acceptance criteria are covered by tests or justified where not testable.
- [ ] Implementation was compared against every acceptance criterion before marking ready for review.

## Type Of Change

- [x] Feature
- [x] Bug fix
- [x] Documentation
- [ ] Refactor
- [x] Test
- [ ] Chore
- [ ] Hotfix

## Branch Flow

- Source branch: `feature/SPM-159-Request-a-Tentative-Hold-on-a-Venue-Coordinator` ([branch](https://github.com/IS212-G5-T2/IS212-G5-T2/tree/feature/SPM-159-Request-a-Tentative-Hold-on-a-Venue-Coordinator))
- Target branch: `dev`
- Flow:
  - [ ] Branch was created from the latest `dev`
  - [x] Pull request targets `dev`

## Test Evidence

[Maintained Confluence test matrix](https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/34603557). Backend commands below ran from `backend/` against the uncommitted null-expiry correction; database tests used disposable PostgreSQL 16.15. Local artifacts are ignored files and have not been uploaded as PR/CI artifacts.

| Acceptance criterion / test case ID | Automated or manual | Command / steps | Result | Evidence link |
| --- | --- | --- | --- | --- |
| Backend regression | Automated | `npm test` | Pass: 1,858 tests | Local: `ai/runtime/SPM-159-null-expiry/backend-unit.log` |
| Approved-hold expiry, duplicate/conflict protection, schedule state | Automated | `npm run test:e2e -- test/venues-booking-requests.e2e-spec.ts test/events-approved-hold.e2e-spec.ts` | Pass: 91 tests | Local: `ai/runtime/SPM-159-null-expiry/focused-e2e.log` |
| Backend integration regression | Automated | `npm run test:e2e` | 770 passed; 1 failed; 1 skipped; 1 todo. Equipment login setup returned 401. | Local: `ai/runtime/SPM-159-null-expiry/backend-e2e.log` |
| Equipment failure verification | Automated | `npm run test:e2e -- test/equipment-availability.e2e-spec.ts` | Pass on retry: 25 tests; original full-run failure retained above | Local: `ai/runtime/SPM-159-null-expiry/equipment-availability-rerun.log` |
| Backend coverage | Automated | `npm run test:cov` | Pass: 1,858 tests. Repository file 100% statements/branches/functions/lines; whole backend 94.76%/94.94%/95.63%/94.88%. | Local: `ai/runtime/SPM-159-null-expiry/backend-coverage.log` |
| Backend static checks | Automated | `npm run lint`; `npm run build` | Pass; two existing lint warnings | Local: `ai/runtime/SPM-159-null-expiry/backend-lint.log`, `backend-build.log` |
| AC1–AC13 story cycle, prior correction-3 snapshot | Automated | `node ai/scripts/test-workflow/run-cycle.mjs --scope docs/test-cases/workflow/scopes/SPM-159.json --cycle ai/runtime/test-cycles/SPM-159/correction-3-2026-10-28` | Saved cycle: 562 passed per timezone; 62/62 configured mutants killed; AMBER. Not a rerun of migration 025 validation. | Local: `ai/runtime/test-cycles/SPM-159/correction-3-2026-10-28/metrics.md` |
| VEN-HOLD-01..13 manual procedures | Manual | Confluence procedures; tester/evidence not recorded for this run | Not run: 29 cases; manual tester pending | [Test matrix](https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/34603557) |

## Implementation Summary

- AC1–AC6: assigned coordinators request holds for selected venues using existing event times and setup/turnaround buffers; confirmation records a Pending request and explains approval and expiry.
- AC7–AC10: check occupied-period conflicts and approval eligibility, prevent same-event/venue duplicates, and support independent requests for multiple venues.
- AC11–AC13: invalidate Pending holds after event timing edits, report retriable submission failures, and flag setup changes for approval-time reassessment.
- Migration 024 adds request-kind/reassessment support and triggers. Local migration 025 requires an expiry on approved tentative holds; ordinary approved bookings and pending holds may retain NULL.
- Defensive queries treat a legacy approved tentative hold with unknown expiry as active. Pending expiry-based schedule filtering retains its existing rules.
- Preserve ordinary booking behavior and distinguish active/expired holds from confirmed venue bookings. Includes dependency remediation already present on the PR.

## Security Evidence

- [ ] CodeQL workflow passed or findings were reviewed.
- [ ] Secret scan workflow passed or findings were reviewed.
- [ ] No secrets, credentials, private keys, or real production data were added.

## Definition of Done

Checked items below have the evidence noted here. Unchecked items remain unverified or pending; this is not a claim that the story is Done.

| DoD area | Evidence / link | N/A reason or pending owner |
| --- | --- | --- |
| Jira traceability and test matrix | [SPM-159](https://is212-g5-t2.atlassian.net/browse/SPM-159), [matrix](https://is212-g5-t2.atlassian.net/wiki/spaces/SP/pages/34603557), [branch](https://github.com/IS212-G5-T2/IS212-G5-T2/tree/feature/SPM-159-Request-a-Tentative-Hold-on-a-Venue-Coordinator), [PR #83](https://github.com/IS212-G5-T2/IS212-G5-T2/pull/83) | Final source/test synchronization pending |
| Requirements and test results | AC1–AC13; automated results above; AC9 scope decision recorded | Owner/customer policy confirmation and manual execution pending |
| Test and code reviews | Saved correction-3 reports record targeted Test PASS, conditional Requirement PASS, and scaffolding Code Quality PASS | These do not certify every subsequent uncommitted change; final snapshot review and human approval pending |
| Documentation | Backend/database README, migration/init instructions, maintained test artifacts | Local updates await push |
| Integration, CI, regression, build | Local backend results above; equipment file passed on retry | Published-head CI and complete final regression acceptance pending |
| Applicable non-functional and UI checks | Automated authorization, boundary and state tests included | Manual browser/accessibility checks and 29 Confluence cases pending |
| PO acceptance and post-merge checks | AC9 confirmed in Jira comment | Final PO acceptance, merge and post-merge verification pending |

### Artifact Status

- [x] Jira Ticket ID
- [x] User Story Details
- [x] Test Matrix
- [x] Work Item (GitHub Branch)
- [x] GitHub PR

### Jira Ticket & Traceability

- [x] Jira Ticket ID documented
- [x] User Story Details clearly stated
- [x] Link to Test Matrix provided
- [ ] Link to Work Item (GitHub Branch) provided (Jira → User Story → Development)
- [ ] Link to GitHub PR provided (Jira → User Story → Development)
- [x] Traceability established between acceptance criteria and named test cases

### Product Owner / Final Acceptance

- [ ] PO verifies the feature actually works as intended (functional verification, not just checklist sign-off)
- [ ] PO checks the story against all acceptance criteria
- [ ] PO confirms relevant documentation and evidence are complete
- [ ] PO accepts the story only after all applicable DoD checks pass

### Requirements & Acceptance Criteria

- [ ] Implemented feature matches the Jira story description
- [ ] Every acceptance criterion is fully implemented
- [ ] No agreed requirement is missing or deferred or partially fulfilled

### Testing & Test Coverage

- [ ] All named test cases associated with the story have been executed
- [ ] Both automated and manual test cases pass where applicable
- [ ] All required test cases have a Pass result
- [ ] Test evidence is recorded for each required test where appropriate
- [x] Positive test cases are included for expected valid behaviour
- [x] Negative test cases are included for invalid input, unauthorised actions, or failure conditions where relevant
- [x] Boundary test cases are included where limits, ranges, lengths, quantities, or thresholds exist
- [ ] Any failed test has been resolved before the story is marked Done
- [ ] No known unresolved defect prevents an acceptance criterion from being satisfied

### Test Case Review

- [ ] Every new or modified test case has been reviewed by the assigned code reviewer
- [ ] Reviewer verifies test cases cover all acceptance criteria
- [ ] Reviewer confirms test logic is correct and traceable to acceptance criteria
- [ ] Reviewer checks for appropriate coverage of positive, negative, and boundary cases
- [ ] Reviewer ensures no duplicate or redundant tests exist
- [ ] All review comments on tests are resolved before merge

### Code Quality & Peer Review

- [ ] Code logic is verified as correct
- [ ] At least one team member reviews and approves the code
- [ ] The reviewer verifies that the implemented logic satisfies the Jira requirements and acceptance criteria
- [ ] The reviewer checks validation, error handling, and authorization logic where applicable
- [ ] Coding conventions and project standards are followed
- [ ] No unnecessary debugging statements, temporary code, commented-out implementation, hard-coded secrets, or unused code remain
- [ ] All blocking review comments are resolved
- [ ] Required pull-request approval has been recorded before merge

### Documentation & Traceability

- [ ] Database documentation is updated if tables, columns, relationships, constraints, or schemas changed - Architecture diagrams or views are updated if components, services, infrastructure, dependencies, or interactions changed
- [x] Confluence or README documentation is updated if setup, configuration, workflow, operational behaviour, or developer instructions changed
- [ ] Updated documentation has been checked against the final implementation
- [ ] If no documentation is affected, item is marked N/A with justification
- [ ] Jira ticket reflects the final implemented behaviour

### Integration & CI/CD

- [ ] All components, services, or interfaces directly affected by the story communicate as expected
- [ ] Required integration tests pass
- [ ] Feature integrates correctly with related components
- [ ] CI pipeline completes with no blocking failures
- [ ] All automated tests configured for the pipeline pass
- [ ] The application builds successfully from the merged code
- [ ] Build/deployment succeeds where applicable
- [ ] No regression introduced
- [ ] PR for Story is approved and ready to merge to dev
- [ ] PR merge succeeds without conflicts
- [ ] Existing functionality directly affected by the change continues to pass regression testing
- [ ] No unresolved integration defect prevents normal use of the development branch

### Non-Functional Requirements

Only requirements relevant to the work item need to be checked. Non-applicable items must be marked N/A with justification.

**Security & Authorization**

- [ ] Protected functionality rejects unauthenticated access where authentication is required.
- [ ] Each role affected by the work item is verified against its defined permissions.
- [ ] Users cannot access, modify, or delete resources outside their permitted scope.
- [ ] Sensitive data introduced or handled by the feature is not exposed through responses, logs, or client-side code without authorization.

**Performance**

No explicit performance target is specified in SPM-159; target-specific checks are N/A. Performance regression assessment remains unverified.

- [ ] Any performance requirement explicitly stated in the Jira work item or project requirements has been tested.
- [ ] The measured result meets the defined performance target.
- [ ] No significant performance degradation is introduced in directly affected functionality.

**Reliability & Consistency**

- [ ] Successful operations leave the system in the expected final state.
- [ ] Failed operations do not leave affected data in an invalid or partially updated state.
- [ ] Error conditions are handled according to the expected behaviour.
- [ ] Data remains consistent across directly affected services, components, or database records.

**Auditability & Logging**

- [ ] Actions requiring audit logging generate the expected audit entry.
- [ ] Required audit fields such as actor, action, timestamp, and affected resource are recorded where specified.
- [ ] Sensitive information is not unnecessarily written to application or audit logs.

**Scalability**

No explicit scalability target is specified in SPM-159; target-specific checks are N/A. No measured scalability claim is made.

- [ ] Any scalability requirement explicitly stated for the work item is verified.
- [ ] The implementation does not introduce a known design limitation that conflicts with the project's stated scalability requirements.

**Accessibility**

- [ ] UI changes satisfy any accessibility requirements defined for the project or work item.
- [ ] Required form labels, validation messages, keyboard interaction, or other accessibility behaviour are verified where applicable.

### UI/UX & User Experience

Only applicable for stories affecting the UI.

- [ ] The implemented UI follows the approved design or existing application design pattern
- [ ] Design consistency is maintained
- [ ] Required form and input validation is displayed to the user
- [ ] Invalid actions produce a clear error message or feedback state
- [ ] Validation and error states are implemented
- [ ] Loading and empty states are handled where applicable
- [ ] Success or failure feedback is shown where the user needs confirmation of an action
- [ ] The user can complete every UI-related acceptance-criteria flow without encountering a blocking usability issue

## Screenshots Or Recordings

No screenshots or recordings attached; manual UI evidence pending.

## Operational Notes

- Existing databases: apply backend migration `024_spm159_tentative_hold_requests.sql`, then local correction `025_spm159_approved_hold_expiry.sql` once included in the branch. Fresh-volume equivalents are in `database/postgresql/init/`.
- Migration 025 refuses existing approved tentative holds with NULL expiry and reports their count; review those rows explicitly before retrying. It does not guess expiry dates.
- The 14-day validity and 336-hour lead-time values remain proposed policy pending customer confirmation. Expiry jobs and notifications belong to related stories.
- Tests require `DATABASE_URL`/`TEST_DATABASE_URL` pointing to an isolated initialized test database. No live development database was used.

## Checklist

- [x] I updated documentation where needed.
- [x] I ran the relevant checks or explained why they were not run.
- [x] I reviewed the user story and acceptance criteria.
