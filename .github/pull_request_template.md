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
- [ ] Release preparation
- [ ] Deployment
- [ ] Hotfix

## Branch Progression

- Source branch:
- Target branch:
- Flow:
  - [ ] Normal work into `integration`
  - [ ] Release preparation from `integration` to `staging`
  - [ ] Release preparation from `integration` to explicit `release/*` branch
  - [ ] Deployment or production release from `staging` to `main`
  - [ ] Production hotfix into `main`, with back-merge/cherry-pick noted if needed

## Test Evidence

Describe the checks you ran.

## Implementation Summary

Summarize how the implementation satisfies the Jira acceptance criteria.

## Security Evidence

- [ ] CodeQL workflow passed or findings were reviewed.
- [ ] Secret scan workflow passed or findings were reviewed.
- [ ] No secrets, credentials, private keys, or real production data were added.

## Screenshots Or Recordings

Add UI evidence when relevant.

## Deployment Notes

List migrations, environment variables, or operational steps.

## Checklist

- [ ] I updated documentation where needed.
- [ ] I ran the relevant checks or explained why they were not run.
- [ ] I reviewed the user story and acceptance criteria.
