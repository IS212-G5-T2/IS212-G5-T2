# Jira Implementation and Review Workflow

Use this workflow for Jira-ticket-driven software changes. Jira remains the
business-requirement source and Confluence remains the test-specification
source. The runtime directory is a temporary snapshot and handoff contract,
not a replacement for either source.

## Fit with this repository and runtime

This repository defines portable role contracts under `.ai/agents/` and
runtime-specific registrations under `.codex/agents/` and `.claude/agents/`.
`opencode.json` only configures OpenCode permissions; it does not register
agents. Use the active platform's native task launcher. Codex supports project
agent roles with TOML configuration; this repository registers those roles in
`.codex/config.toml`, with each registration loading `.codex/agents/{role}.toml`
([Codex configuration reference](https://developers.openai.com/codex/config-reference/)).
Claude Code uses its native Markdown agent files.

Codex loads project configuration only when the repository is trusted. The
native files register roles and set role-level reasoning/sandbox defaults; they
do not run the stage sequence by themselves. The root task orchestrator follows
this workflow and invokes the role agents at the specified stage boundaries.
Treat the root orchestrator as logical Agent 5: it dispatches Agent 1, starts
Agents 2–4 after implementation, then reconciles and validates. Do not spawn a
separate Agent 5 worker in the normal path; that would add a handoff without
adding an independent review.

The Codex CLI adapter registers role TOMLs in `.codex/config.toml`. The active
Codex task interface in this environment also provides native `spawn_agent` and
`wait_agent`, but does not expose a role-type selector. For that interface,
launch each worker with its `.ai/agents` role path, runtime path, and matching
reasoning effort explicitly; start all three reviewers before collecting
results. Each task receives the same snapshot and must not depend on inherited
conversation history. Where reviewers cannot write to the shared checkout
safely, have each return its report and let the orchestrator persist it verbatim
to that reviewer's runtime output file. Other runtimes use their own adapter and
return mechanism.

## Workflow

1. **Implementation (Agent 1, high reasoning):** Read the Jira ticket, its
   relevant comments and links, and the corresponding Confluence unit-test
   matrix and cases. Check the Jira status is `To Do` or `In Progress`. Capture
   the source material and normalized requirements once under the runtime
   context directory. Inspect the repository and scoped instructions, then
   implement the full ticket, including automated tests. Run initial relevant
   validation and write implementation summary, changed files, assumptions,
   traceability, and status.
2. **Independent reviews (Agents 2–4):** Once Agent 1 marks implementation
   complete, launch the test, code quality, and requirements reviewers. They
   read the snapshot and inspect the relevant diff/source. They do not edit
   implementation files or read each other's findings during this pass. Each
   returns its independently attributable findings, including an explicit “no
   findings” result when appropriate. The orchestrator persists each report to
   its designated review file without merging or rewriting it.
3. **Reconciliation (Agent 5, medium reasoning):** Read the snapshot, diff,
   status, and all three reviews. Verify findings against the code and stated
   requirements; accept or reject each with a reason. Make only the smallest
   fixes needed for legitimate issues. Record findings and fixes.
4. **Selective re-review:** If Agent 5 changed implementation, update the
   changed-file list and rerun only reviewers whose conclusions could have
   changed, using the rules below. Permit one re-review cycle. Agent 5 resolves
   those results once; do not start another review cycle.
5. **Final validation:** Run deterministic checks relevant to the final diff
   (tests, lint, typecheck, build, migration validation, or repository checks).
   Record exact commands and outcomes. Mark the workflow complete only if there
   are no unresolved serious findings and required checks pass. Otherwise mark
   it failed with the remaining issue and failed/skipped checks.

Use the existing Jira/branch/PR rules in the root `AGENTS.md` and
`docs/ai-issue-workflow.md`. This workflow does not authorize Jira or Confluence
edits, commits, pushes, or pull requests.

## Opt-in repository helpers

The following helpers run only when the user explicitly requests the matching
task. They are separate from the normal five-role implementation/review flow:

- **Pull request creation:** uses `gh` only, checks for an existing PR, derives
  a title from the Jira summary in the runtime snapshot, fills
  `.github/pull_request_template.md`, and targets `dev`. The branch must
  already be committed and pushed. It does not commit, push, merge, or enable
  auto-merge.
- **Ticket completion:** moves the selected ticket's complete section from
  `AI_USAGE.md` to `docs/ai-usage-archives/{ticket_id}.md`, adds the ticket key
  to each dated entry heading, then replaces it with a concise pointer using
  the archive README's format.
  The user's explicit archive request is the closure signal; it does not update
  Jira or perform other completion checks.

## Runtime snapshot contract

Create this directory for each ticket. It is ignored by Git because it can
contain copied Jira and Confluence content. Keep the source URL/page ID and
capture time/version where available so stale snapshots can be recognized.

```text
.ai/runtime/{ticket_id}/
├── context/
│   ├── jira.md
│   ├── confluence-test-matrix.md
│   ├── confluence-test-cases.md
│   └── requirements.md
├── implementation/
│   ├── implementation-summary.md
│   ├── changed-files.md
│   └── assumptions.md
├── reviews/
│   ├── test-review.md
│   ├── code-quality-review.md
│   └── requirements-review.md
├── final/
│   ├── findings.md
│   ├── fixes.md
│   └── validation.md
├── traceability.md
└── status.json
```

Requirements should contain ticket key/title/status/parent, description and
acceptance criteria, relevant business and authorization rules, linked
dependencies, Confluence references, constraints, and explicitly labeled
assumptions. Preserve source language for acceptance criteria; normalize only
to make requirements concise. If Confluence is missing, record the search and
limitation, then continue from Jira requirements if they are sufficient.

`traceability.md` maps each requirement to a real Confluence case (if present),
automated test, and implementation location. Use “none identified” for missing
links; never invent case IDs or coverage. Reviewer reports use one entry per
finding with: ID, severity, requirement/AC if applicable, file and line, issue,
evidence, expected behavior, and recommended correction. If there are no
findings, say so explicitly.

`status.json` is the lightweight state record. Preserve this shape and update
it at stage boundaries:

```json
{
  "ticket_id": "SPM-50",
  "stage": "implementation",
  "implementation_complete": false,
  "test_review_complete": false,
  "code_quality_review_complete": false,
  "requirements_review_complete": false,
  "accepted_findings": [],
  "rejected_findings": [],
  "changes_after_review": [],
  "reviewers_rerun": [],
  "revalidation_cycle": 0,
  "max_revalidation_cycles": 1,
  "final_validation_passed": false
}
```

Allowed `stage` values are `implementation`, `review`, `reconciliation`,
`revalidation`, `final_validation`, `complete`, and `failed`. Use the actual
ticket key, booleans and arrays. Keep detailed reasoning in Markdown artifacts
rather than duplicating it in JSON.

## Role contracts

Every canonical role prompt is in `.ai/agents/`. The orchestrator passes the
relevant role prompt, ticket runtime path, and explicit output path to the
native task launcher. Codex review roles use a read-only sandbox and return
findings for the orchestrator to persist. Implementer owns changes before the
first review; final validator owns post-review fixes and final validation.

| Role | Focus | Inputs | Output |
| --- | --- | --- | --- |
| Agent 1 — Implementation (high) | Requirement acquisition, full implementation, tests, initial checks | Jira/Confluence once, scoped repo guidance, source | `context/*`, `implementation/*`, `traceability.md`, `status.json` |
| Agent 2 — Test review (high) | Test adequacy and spec gaps against behavior | requirements, Confluence matrix/cases, implementation metadata, traceability, diff/source | `reviews/test-review.md` |
| Agent 3 — Code quality (low) | Focused maintainability and convention review | requirements, implementation metadata, changed files, diff/source | `reviews/code-quality-review.md` |
| Agent 4 — Requirements validation (low) | Acceptance criteria and business behavior coverage | requirements, implementation summary, traceability, diff/source | `reviews/requirements-review.md` |
| Agent 5 — Final validation/orchestration (medium) | Verify, reconcile, fix, selectively rerun, final checks | All runtime artifacts and current diff/source | `final/*`, updated `status.json` |

Reviewers should limit repository reads to changed files and directly relevant
callers/tests. Jira and Confluence are read by Agent 1 only; downstream agents
use the snapshot unless it is demonstrably incomplete or stale. A refresh, if
needed, is a single explicit orchestrator action before rerunning affected
work, followed by updating the snapshot.

## Selective revalidation and retry bound

Classify each Agent 5 fix by what it can invalidate, and rerun:

| Fix | Reviewers to rerun |
| --- | --- |
| Tests only | Agent 2 |
| Production implementation, behavior unchanged | Agents 2 and 3 |
| Business behavior, authorization/security, API contract, or database/schema behavior | Agents 2, 3, and 4 |
| Refactor only | Agent 3; also Agent 2 if behavior or test assumptions may change |
| Documentation only | None, unless it changes an interface or operational requirement |

At most one selective re-review cycle is allowed after the initial reviews.
Agent 5 may make one final correction after that cycle, but must not relaunch
reviewers. Run final deterministic checks after all corrections. If an
unresolved serious finding remains, or a required deterministic check fails,
set `stage` to `failed`, describe the blocker in `final/findings.md` and record
the check result in `final/validation.md`.

## Cost and correctness rules

- Fetch Jira and Confluence once in the implementation stage; persist only the
  relevant content and references needed for implementation and review.
- Do not have reviewers re-derive requirements, query source systems, or
  repeat another role's analysis.
- Run review tasks from the same frozen implementation state. If a reviewer
  task cannot be launched concurrently, preserve independent findings and
  prevent access to other review files until it finishes.
- Reviewers report concrete, evidence-backed issues; they do not edit code.
- Agent 5 validates each finding and records accepted/rejected decisions; a
  reviewer suggestion is not automatically a required change.
- Keep context summaries concise and keep implementation changes scoped to the
  ticket.
