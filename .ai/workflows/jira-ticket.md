# Jira Ticket Workflow

Run Jira implementation stages sequentially; agents must not edit concurrently. The core route is `01 → 02 (when needed) → 03 → 04 → 05 → 08`. Add `06` for material or risky changes; add `07` only after `06` or on an explicit rubric/accountability request. Ticket Closeout runs later only on the user's explicit finished-ticket request. Recovery runs only for a reported issue or explicit request.

## Required inputs and discovery

1. Get the Jira key or complete user-supplied ticket details.
2. Read root/scoped `AGENTS.md`, search `AI_USAGE.md` only for active overlap with the ticket or affected paths, then inspect related code/tests and existing branch/PR work. Git history and PRs hold completed-work detail.
3. Through an approved integration, read Jira summary, description, story, ACs, scope-changing comments, priority, sprint, and status. Jira governs requirements.
4. Find Confluence cases under epic → `unit-test` → matching `SPM-<number>` folder → Matrix → relevant pages. Use them to verify AC coverage.
5. Stop unless Jira status is `To Do` or `In Progress`.

If Jira or Confluence is unavailable, use only user-supplied details, note the gap privately, and stop if requirements remain insufficient. Keep private content out of tracked files.

## Runtime artifacts and context boundaries

At ticket start, the Orchestrator creates or reuses `.ai/runtime/{ticket-id}/conversation-registry.json` with the ticket key and an initially empty `records` array. Record the invoking chat, every spawned subagent ID, and any persisted subagent thread ID when exposed. For `kind: chat`, `id` is the native thread/chat ID; for `kind: subagent`, `id` is the agent ID and optional `threadId` is its persisted chat. Each separately started ticket chat registers itself. Keep role/parent links and update the branch once selected; never invent IDs or overwrite records. Validate against `../schemas/conversation-registry.schema.json` where supported. Registries in separate worktrees are local to those checkouts.

The Context Loader writes `manifest.json`, `jira.md`, `implementation-context.md`, `independent-test-context.md`, and applicable `confluence-tests.md` in the same runtime directory; it ensures the registry exists and references it in the manifest. The Architecture Planner writes `architecture-plan.md` before implementation. Validate the manifest against `../schemas/runtime-manifest.schema.json` where supported.

`independent-test-context.md` contains only Jira-derived test requirements, never Confluence content, IDs, or wording. The Implementer cannot access Confluence material. The Unit Test Writer receives only `independent-test-context.md`, not Jira, Confluence, `confluence-tests.md`, or `test-review.md`. The Test Case Reviewer compares completed tests with Confluence and writes `test-review.md`.

## Sequential stages

| Stage | Canonical agent file | Role | Required output before handoff |
| --- | --- | --- | --- |
| 1 | `01-context-loader.md` | Context Loader | Runtime context; eligible ticket |
| 2 | `02-architecture-planner.md` | Architecture Planner | `architecture-plan.md`: file layout, ownership, persistence boundary, trade-offs |
| 3 | `03-implementer.md` | Implementer | Implementation report; plan deviations; no tests/Git |
| 4 | `04-unit-test-writer.md` | Unit Test Writer | Independent tests, results, meaningful coverage |
| 5 | `05-requirements-and-test-reviewer.md` | Requirements and Test Reviewer | AC/case → code/test mapping, `requirements-test-review.md`, gaps, traceability |
| 6 (conditional) | `06-code-quality-reviewer.md` | Code Quality Reviewer | `code-quality-review.md`: Context7, maintainability, CI checks |
| 7 (conditional) | `07-accountability-reviewer.md` | Accountability Reviewer | Final `quality-review.md`: reconcile plan and specialist reports |
| 8 | `08-delivery-reviewer.md` | Delivery Reviewer | `changes.md`, review-only delivery gate, stage for human review |
| 11 (later) | `11-ticket-closeout.md` | Ticket Closeout Agent | User-triggered archive of verified ticket chats; private `closeout.md` |

After delivery, and only on an explicit user request to finish a named ticket, spawn `11-ticket-closeout.md` in its own context. It verifies ticket/branch completion, discovers and archives only verified idle ticket chats, and writes private `closeout.md`. It does not run automatically after stage 10; do not apply the implementation-only Jira `To Do`/`In Progress` status gate to closeout.

Stage 2 is required for new modules, contracts, persistence, or cross-boundary changes. For a contained change that does not alter these boundaries, the Orchestrator may record a short no-plan rationale and proceed to Stage 3. Stage 6 is required for material security, persistence, API, framework, or dependency changes. Stage 7 runs only after Stage 6 or when the user explicitly requests rubric/accountability review. The Implementer performs the plan's quality checks while writing code; Stage 6 remains an independent post-change audit.

Verify each handoff. Stop and report missing outputs, inaccessible systems, invalid status, failed checks, boundary violations, unclear requirements, or unrelated changes. Never skip a failed stage, invent data, or relax a role restriction.

`00-orchestrator.md` coordinates stages; `11-ticket-closeout.md` is user-triggered after delivery; `99-recovery.md` runs separately. If Stage 8 finds a material issue, return to Stage 3 and/or 4, rerun affected conditional review stages, then repeat Stage 8. Do not patch source silently at delivery.

## Branch, review, and Git progression

Reuse related branch/PR work. Otherwise branch from latest `dev` as `<type>/<JIRA-key>-<ticket-name-slug>`; target `dev`. Implement every AC, run relevant tests, and recheck Jira requirements and Confluence cases before handoff.

The Delivery Reviewer lists exact task files, checks status/diff/commit conventions, then stages only those files; exclude `.ai/runtime/`, private data, generated artifacts, secrets, and unrelated work. Commit only after explicit human approval; follow repository rules for Jira-keyed commits, push, and PR creation. PRs target `dev`, use the template, and include the Jira key, summary, AC checklist, tests, and risks. Never duplicate Jira as a GitHub Issue, mark it `Done`, auto-merge, or change Jira status; Jira automation owns branch/PR/merge transitions.

## Completion and recovery

Before reporting readiness, recheck every Jira AC and relevant Confluence case. Resolve each quality finding or record an accepted-risk rationale. Report branch, PR if created, changed files, checks run/skipped, risks, and human follow-up.

For later reported issues, Recovery inspects the symptom, `commits.json`, Git history, and diffs; isolates the ticket change; fixes and tests it. Prefer corrective commits; never blindly revert unrelated valid work.
