# GitHub Issue and Pull Request Lifecycle

Jira context acquisition, implementation, testing, and agent review are defined
in [.ai/workflow/README.md](../.ai/workflow/README.md) and its role contracts.
This document covers the GitHub branch and pull request lifecycle after those
implementation stages.

## Branches and Pull Requests

- Reuse the existing branch and pull request for the Jira key when available.
- Start new work from the latest `dev` branch and target the pull request to
  `dev`.
- Name Jira work branches with the exact issue key and a hyphenated slug of the
  Jira title: `feature/`, `fix/`, `docs/`, or `chore/` as appropriate. Use
  `hotfix/` only for urgent fixes.
- Do not create a GitHub issue that duplicates a Jira story. For GitHub-only
  work, use its issue number as the work identifier and do not invent Jira
  metadata.

## Review and Handoff

- After implementation and final validation, stage the completed changes for
  human review. Report the changed files, checks run, and any limitations.
- Do not commit, push, or create a pull request until the human explicitly
  approves committing.
- After approval, reference the Jira key (or GitHub issue number for GitHub-only
  work) in the commit. Push the branch and open a pull request whose title
  contains that identifier and whose base is `dev`.
- Include an implementation summary, acceptance-criteria checklist, testing
  notes, and known limitations in the pull request. Use the repository pull
  request template when available.
- Continue requested review changes on the existing branch and pull request.
- Do not mark Jira work `Done`; Jira automation owns status transitions.
