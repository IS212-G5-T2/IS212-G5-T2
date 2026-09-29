# Jira Ticket Workflow

Run Jira implementation stages sequentially; agents must not edit concurrently. Ticket Closeout runs later only on the user's explicit finished-ticket request. Recovery runs only for a reported issue or explicit request.

## Required inputs and discovery

1. Get the Jira key or complete user-supplied ticket details.
2. Read root/scoped `AGENTS.md`, relevant `AI_USAGE.md` entries, related code/tests, and existing branch/PR work.
3. Through an approved integration, read Jira summary, description, story, ACs, scope-changing comments, priority, sprint, and status. Jira governs requirements.
4. Find Confluence cases under epic → `unit-test` → matching `SPM-<number>` folder → Matrix → relevant pages. Use them to verify AC coverage.
5. Stop unless Jira status is `To Do` or `In Progress`.

If Jira or Confluence is unavailable, use only user-supplied details, note the gap privately, and stop if requirements remain insufficient. Keep private content out of tracked files.

## Runtime artifacts and context boundaries

At ticket start, the Orchestrator creates or reuses `.ai/runtime/{ticket-id}/conversation-registry.json` with the ticket key and an initially empty `records` array. Record the invoking chat, every spawned subagent ID, and any persisted subagent thread ID when exposed. For `kind: chat`, `id` is the native thread/chat ID; for `kind: subagent`, `id` is the agent ID and optional `threadId` is its persisted chat. Each separately started ticket chat registers itself. Keep role/parent links and update the branch once selected; never invent IDs or overwrite records. Validate against `../schemas/conversation-registry.schema.json` where supported. Registries in separate worktrees are local to those checkouts.

The Context Loader writes `manifest.json`, `jira.md`, `implementation-context.md`, `independent-test-context.md`, and applicable `confluence-tests.md` in the same runtime directory; it ensures the registry exists and references it in the manifest. Validate the manifest against `../schemas/runtime-manifest.schema.json` where supported.

`independent-test-context.md` contains only Jira-derived test requirements, never Confluence content, IDs, or wording. The Implementer cannot access Confluence material. The Unit Test Writer receives only `independent-test-context.md`, not Jira, Confluence, `confluence-tests.md`, or `test-review.md`. The Test Case Reviewer compares completed tests with Confluence and writes `test-review.md`.

## Sequential stages

| Stage | Canonical agent file | Role | Required output before handoff |
| --- | --- | --- | --- |
| 1 | `01-context-loader.md` | Context Loader | Runtime context; eligible ticket |
| 2 | `02-implementer.md` | Implementer | Implementation report; no tests/Git |
| 3 | `03-unit-test-writer.md` | Unit Test Writer | Independent tests, results, meaningful coverage |
| 4 | `04-test-case-reviewer.md` | Test Case Reviewer | `test-review.md`, `test-case-coverage.md`, optional `generated-test-cases.md`, missing tests and traceability |
| 5 | `05-requirements-traceability-reviewer.md` | Requirements Traceability Reviewer | `requirements-traceability-review.md`: Jira → code → tests; gaps |
| 6 | `06-architecture-reviewer.md` | Architecture Reviewer | `architecture-review.md`: structure, ownership, dependencies, trade-offs |
| 7 | `07-code-quality-reviewer.md` | Code Quality Reviewer | `code-quality-review.md`: Context7, maintainability, CI checks |
| 8 | `08-accountability-reviewer.md` | Accountability Reviewer | Final `quality-review.md`: reconcile reports, decisions, risks |
| 9 | `09-change-reviewer.md` | Change Reviewer | `changes.md`: ACs, disposition, verification, risks, proposed paths |
| 10 | `10-git-committer.md` | Git Committer | Stage for review; commit only after approval; private `commits.json` |
| 11 (later) | `11-ticket-closeout.md` | Ticket Closeout Agent | User-triggered archive of verified ticket chats; private `closeout.md` |

After delivery, and only on an explicit user request to finish a named ticket, spawn `11-ticket-closeout.md` in its own context. It verifies ticket/branch completion, discovers and archives only verified idle ticket chats, and writes private `closeout.md`. It does not run automatically after stage 10; do not apply the implementation-only Jira `To Do`/`In Progress` status gate to closeout.

Verify each handoff. Stop and report missing outputs, inaccessible systems, invalid status, failed checks, boundary violations, unclear requirements, or unrelated changes. Never skip a failed stage, invent data, or relax a role restriction.

`00-orchestrator.md` coordinates stages; `11-ticket-closeout.md` is user-triggered after delivery; `99-recovery.md` runs separately.

## Branch, review, and Git progression

Reuse related branch/PR work. Otherwise branch from latest `dev` as `<type>/<JIRA-key>-<ticket-name-slug>`; target `dev`. Implement every AC, run relevant tests, and recheck Jira requirements and Confluence cases before handoff.

The Change Reviewer lists exact task files. The Git Committer checks status, diff, and commit conventions, then stages only those files; exclude `.ai/runtime/`, private data, generated artifacts, secrets, and unrelated work. Commit only after explicit human approval; follow repository rules for Jira-keyed commits, push, and PR creation. PRs target `dev`, use the template, and include the Jira key, summary, AC checklist, tests, and risks. Never duplicate Jira as a GitHub Issue, mark it `Done`, auto-merge, or change Jira status; Jira automation owns branch/PR/merge transitions.

## Completion and recovery

Before reporting readiness, recheck every Jira AC and relevant Confluence case. Resolve each quality finding or record an accepted-risk rationale. Report branch, PR if created, changed files, checks run/skipped, risks, and human follow-up.

For later reported issues, Recovery inspects the symptom, `commits.json`, Git history, and diffs; isolates the ticket change; fixes and tests it. Prefer corrective commits; never blindly revert unrelated valid work.
