## Summary

Describe what changed and why.

## Jira Ticket

Link the Jira ticket.

Jira status at implementation start:

Existing branch or PR reused:

## User Story And Acceptance Criteria

Link the Jira story or paste the relevant acceptance criteria.

- [ ] Acceptance criteria are implemented.
- [ ] Acceptance criteria are covered by tests or justified where not testable.
- [ ] Implementation was compared against every acceptance criterion before marking ready for review.

## Type Of Change

- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor
- [ ] Test
- [ ] Chore
- [ ] Hotfix

## Branch Flow

- Source branch:
- Target branch: `dev`
- Flow:
  - [ ] Branch was created from the latest `dev`
  - [ ] Pull request targets `dev`

## Test Evidence

Link the test matrix and record the exact command, result, and run/CI link for each required automated check. Include manual test IDs, result, tester, and evidence; list skipped or failed checks and the resolution or blocker.

| Acceptance criterion / test case ID | Automated or manual | Command / steps | Result | Evidence link |
| --- | --- | --- | --- | --- |
|  |  |  | Pass / Fail / Not run |  |

## Implementation Summary

Summarize how the implementation satisfies the Jira acceptance criteria.

## Security Evidence

- [ ] CodeQL workflow passed or findings were reviewed.
- [ ] Secret scan workflow passed or findings were reviewed.
- [ ] No secrets, credentials, private keys, or real production data were added.

## Definition of Done

Use the DoD checklist below. Check an item only when evidence exists; add a link or short evidence note beside it. Mark non-applicable items N/A with a reason. Leave CI, human peer review/approval, PO acceptance, merge, and post-merge checks pending until they occur; this PR checklist is not a claim that Jira is `Done`. If an item cannot be satisfied, the story returns to the Product Backlog for future consideration and cannot be marked Done.

| DoD area | Evidence / link | N/A reason or pending owner |
| --- | --- | --- |
| Jira traceability and test matrix |  |  |
| Requirements and test results |  |  |
| Test and code reviews |  |  |
| Documentation |  |  |
| Integration, CI, regression, build |  |  |
| Applicable non-functional and UI checks |  |  |
| PO acceptance and post-merge checks |  |  |

### Artifact Status

- [ ] Jira Ticket ID
- [ ] User Story Details
- [ ] Test Matrix
- [ ] Work Item (GitHub Branch)
- [ ] GitHub PR

### Jira Ticket & Traceability

- [ ] Jira Ticket ID documented
- [ ] User Story Details clearly stated
- [ ] Link to Test Matrix provided
- [ ] Link to Work Item (GitHub Branch) provided (Jira → User Story → Development)
- [ ] Link to GitHub PR provided (Jira → User Story → Development)
- [ ] Traceability established between acceptance criteria and named test cases

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
- [ ] Positive test cases are included for expected valid behaviour
- [ ] Negative test cases are included for invalid input, unauthorised actions, or failure conditions where relevant
- [ ] Boundary test cases are included where limits, ranges, lengths, quantities, or thresholds exist
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
- [ ] Confluence or README documentation is updated if setup, configuration, workflow, operational behaviour, or developer instructions changed
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

Add UI evidence when relevant.

## Operational Notes

List migrations, environment variables, or operational steps.

## Checklist

- [ ] I updated documentation where needed.
- [ ] I ran the relevant checks or explained why they were not run.
- [ ] I reviewed the user story and acceptance criteria.
