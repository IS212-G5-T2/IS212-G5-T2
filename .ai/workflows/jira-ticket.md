# Jira Ticket Workflow

This is the canonical execution process for Jira implementation work. Run dependent stages sequentially; do not allow agents to edit the repository concurrently. The Recovery Agent is outside this workflow and runs only after a user-reported issue or explicit recovery request.

## Required inputs and discovery

1. Receive a Jira key or complete user-supplied ticket details.
2. Read root and scoped `AGENTS.md` files, current relevant `AI_USAGE.md` entries, related source and tests, and existing branch or pull-request work for the key.
3. Retrieve the Jira summary, description, user story, acceptance criteria, comments that change scope, priority, sprint, and status through an approved integration. Jira is authoritative for the story and acceptance criteria.
4. Retrieve Confluence test material through the ticket's epic → `unit-test` folder → matching `SPM-<number>` folder → Matrix page → relevant test-case pages. Use it to verify acceptance-criteria coverage, not to replace Jira requirements.
5. Stop if the Jira status is not `To Do` or `In Progress`.

If Jira or Confluence is unavailable, use only user-supplied information, record the limitation in private runtime context, and stop if the remaining requirements are insufficient. Never copy private-system content into tracked files.

## Runtime artifacts and context boundaries

The Context Loader creates `.ai/runtime/{ticket-id}/manifest.json`, `jira.md`, `implementation-context.md`, `independent-test-context.md`, and applicable `confluence-tests.md`. Validate the manifest against `../schemas/runtime-manifest.schema.json` when tooling supports it.

`independent-test-context.md` contains only Jira-derived requirements needed for independent test design. It must not include Confluence case content, identifiers, or wording. The Implementer must not access Confluence material; the Unit Test Writer may read only `independent-test-context.md` and must not access Jira, Confluence, `confluence-tests.md`, or `test-review.md`. The Test Case Reviewer compares completed tests with the isolated Confluence material and writes `test-review.md`.

## Sequential stages

| Stage | Canonical agent file | Role | Required output before handoff |
| --- | --- | --- | --- |
| 1 | `01-context-loader.md` | Context Loader | Required runtime context files and eligible-ticket confirmation |
| 2 | `02-implementer.md` | Implementer | Focused implementation report; no tests or Git actions |
| 3 | `03-unit-test-writer.md` | Unit Test Writer | Independently derived tests, test results, and meaningful coverage assessment |
| 4 | `04-test-case-reviewer.md` | Test Case Reviewer | `test-review.md`, required private `test-case-coverage.md`, optional `generated-test-cases.md`, appropriate missing tests, and required traceability comments |
| 5 | `05-requirements-traceability-reviewer.md` | Requirements Traceability Reviewer | `requirements-traceability-review.md` with Jira-to-code-to-test mappings and coverage gaps |
| 6 | `06-architecture-reviewer.md` | Architecture Reviewer | `architecture-review.md` with structure, ownership, dependency, and trade-off findings |
| 7 | `07-code-quality-reviewer.md` | Code Quality Reviewer | `code-quality-review.md` with Context7 evidence, maintainability findings, and CI-relevant checks |
| 8 | `08-accountability-reviewer.md` | Accountability Reviewer | Final `quality-review.md` that reconciles the three independent reports and explains decisions, trade-offs, and risks |
| 9 | `09-change-reviewer.md` | Change Reviewer | `changes.md` with acceptance-criteria checklist, final accountability disposition, verification, risks, and proposed commit paths |
| 10 | `10-git-committer.md` | Git Committer | Task files staged for human review; an actual commit only after explicit approval; private `commits.json` after a commit |

Verify each output before handoff. Stop and report missing artifacts, inaccessible systems, invalid status, failed checks, context-boundary violations, unclear requirements, or unrelated changes. Do not silently skip a stage, invent unavailable ticket data, or relax a role restriction.

`00-orchestrator.md` coordinates the numbered stages. `99-recovery.md` is intentionally outside the normal ticket pipeline.

## Branch, review, and Git progression

Reuse related branch or pull-request work when it exists. Otherwise start from the latest `dev` using `<type>/<JIRA-key>-<ticket-name-slug>` and target pull requests to `dev`. Implement every acceptance criterion, run appropriate tests, and compare implementation and tests with Jira requirements and Confluence cases before reporting readiness.

The Change Reviewer identifies the exact task files suitable for review. The Git Committer inspects `git status`, `git diff`, and existing commit conventions, then stages only those files for human review; it never includes `.ai/runtime/`, private data, generated artifacts, secrets, or unrelated user work. It may create a commit only after explicit human approval. After that approval, follow the repository's established policy for Jira-keyed commits, push, and pull-request creation. A pull request must target `dev`, use the repository template, include the Jira key, implementation summary, acceptance-criteria checklist, testing notes, and known risks. Do not duplicate the Jira story as a GitHub Issue, mark Jira `Done`, auto-merge, or alter Jira status; Jira automation owns the branch-created, pull-request-created, and merged status transitions.

## Completion and recovery

Before declaring work ready, re-check every Jira acceptance criterion and relevant Confluence test case, and confirm every quality-review finding has been resolved or explicitly accepted with rationale. Report the branch, pull request when created, files changed, checks run or skipped, remaining risks, and required human follow-up.

For a later reported issue, use the Recovery Agent: inspect the symptom, runtime `commits.json`, Git history, and relevant diffs; identify the narrow ticket-related change; implement and test a correction; and prefer a corrective commit to history rewriting. Never blindly revert a commit containing unrelated valid changes.
