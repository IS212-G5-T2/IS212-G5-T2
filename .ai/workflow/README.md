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
`.codex/config.toml`, with each registration loading `.codex/agents/{role}.toml`.
Codex role TOMLs set `model_reasoning_effort`. Claude Code uses native Markdown
agent files with the matching `effort` frontmatter field ([Codex configuration](https://developers.openai.com/codex/config-reference/), [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)).
Keep both runtime adapters aligned with the logical role levels in the role
table below. Prompt text that says “Reasoning: high/medium/low” is descriptive
fallback guidance, not a substitute for native configuration when that runtime
supports it.

Codex loads project configuration only when the repository is trusted. The
native files register roles and set role-level reasoning/sandbox defaults; they
do not run the stage sequence by themselves. The root task orchestrator follows
this workflow and invokes the role agents at the specified stage boundaries.
Treat the root orchestrator as logical Agent 5: it dispatches Agent 1, starts
Agents 2–4 after implementation, then reconciles and validates. Do not spawn a
separate Agent 5 worker in the normal path; that would add a handoff without
adding an independent review.

Agent 5's `medium` level is a logical target. Because Agent 5 runs in the
already-active root session, its actual effort is inherited from that session;
the `final-validation` adapter setting applies only if that worker is explicitly
launched. When the runtime supports per-task effort selection, use medium for
Agent 5. Otherwise follow the medium-scope role instructions and record the
runtime limitation if relevant. This keeps orchestration lightweight while
making the one non-enforced level explicit.

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
   traceability, file-level test coverage, and status. Every changed runtime-
   behavior file gets a direct unit-test mapping; backend controllers and
   repositories require their own unit suites. `*.module.*` registration files
   are the only source-file exemption from direct tests. Type-only/declaration-
   only files still appear in the test-coverage matrix with a not-applicable
   reason. Inspect coverage for changed executable code and target 100% per
   changed file, without imposing a 100% threshold on the whole component.
2. **Independent reviews (Agents 2–4):** Once Agent 1 marks implementation
   complete, launch the test, code quality, and requirements reviewers. They
   read the snapshot and inspect the relevant diff/source. They do not edit
   implementation files or read each other's findings during this pass. Each
   returns its independently attributable findings, including an explicit “no
   findings” result when appropriate. Agent 2 independently runs the owning
   component's coverage command on the frozen implementation (`npm run
   test:cov` from each affected `backend/` or `frontend/` directory in this
   repository), then inspects the fresh per-file report. Agent 1's coverage
   matrix is an inventory, not a substitute for this run. If the command or
   report is unavailable, Agent 2 marks coverage review blocked. The command
   may write normal generated coverage output but must not modify source,
   tests, or configuration. The orchestrator persists each report to its
   designated review file without merging or rewriting it.
3. **Reconciliation (Agent 5, medium reasoning):** Read the snapshot, diff,
   status, and all three reviews. Verify findings against the code and stated
   requirements; accept or reject each with a reason. Do not edit source or
   tests. For accepted changes, write `implementation/fix-handoff.md` naming
   the finding IDs, evidence, expected result, and requested correction.
4. **Implementation repair (Agent 1, high reasoning):** Invoke Agent 1 in
   review-fix mode with the accepted handoff and runtime snapshot. Agent 1
   updates production code/tests, test-coverage matrix, traceability, and
   changed-file metadata without re-fetching Jira/Confluence. It reruns the
   full relevant validation command set recorded during initial implementation
   (not only tests added for the finding) and reports each finding's result.
5. **Re-review:** If any Agent 2 finding was accepted, rerun Agents 2 and 3
   after Agent 1's repair, including when only tests changed. Rerun Agent 4 when
   behavior, authorization, API, persistence, or another Jira requirement may
   have changed. Other fixes use the dependency table below. Permit one Agent 1
   repair/re-review cycle only. Agent 5 adjudicates that result and does not
   initiate another code-fix/review loop.
6. **Final validation:** Run the full recorded relevant check set after all
   repairs (tests, coverage, lint, typecheck, build, migration validation, or
   repository checks). Record exact commands and outcomes. Mark complete only
   if required checks pass and no serious finding remains; otherwise mark
   failed with the remaining issue and failed/skipped checks.

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
│   ├── assumptions.md
│   ├── test-coverage.md
│   └── fix-handoff.md        # only when Agent 5 sends accepted findings to Agent 1
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

## Test design and review contract

`.ai/workflow/test-design-protocol.md` is the operational test-design and
review contract. Agent 1 and Agent 2 must follow its input contract, ordered
steps, scenario-selection table, finding schema, and completion checks. The
root test-generation prompt, rationale, usage guide, and Week 4 and Week 6 PDFs
are reference material; consult only the relevant section when the protocol
leaves a method unclear.

`traceability.md` maps each requirement to a real Confluence case (if present),
automated test, and implementation location. Use “none identified” for missing
links; never invent case IDs or coverage. Reviewer reports use one entry per
finding with: ID, severity, finding type, requirement/AC if applicable,
Confluence case, implementation status, test status, file and line, issue,
evidence, expected behavior, and recommended correction. Agent 2 reports a
status matrix before findings with implementation status and test status as
separate columns. This makes it explicit when a feature is implemented but its
test is missing. If there are no findings, include the completed matrix and
say so explicitly.

`implementation/test-coverage.md` uses one row per changed source file. Include
file kind, direct unit suite/cases, linked AC and Confluence case IDs,
statement/line, branch, and function coverage, supplemental integration tests,
and separate implementation/test statuses. For type-only files, record why
runtime coverage does not apply and cite the type/build check. For module
registration files, cite the consumer/module check used to validate wiring.
Agent 2 reruns the component coverage command independently and verifies the
report itself; Agent 1's matrix guides file mapping but does not establish the
review result.

`status.json` is the lightweight state record. Preserve this shape and update
it at stage boundaries:

```json
{
  "ticket_id": "SPM-50",
  "stage": "implementation",
  "implementation_complete": false,
  "implementation_fix_requested": false,
  "implementation_fix_complete": false,
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

Every canonical role prompt is in `.ai/agents/`. Keep all role prompts in the
same section order so any runtime can parse them consistently:
`Role` → `Trigger` → `Required Context` → `Procedure` → `Output` →
`Boundaries`. A section may say `Not applicable`, but do not silently omit it.
The orchestrator passes the relevant role prompt, ticket runtime path, and
explicit output path to the native task launcher. Codex review roles use a
read-only sandbox and return findings for the orchestrator to persist.
Implementer owns changes before and after review; final validator adjudicates
findings, writes accepted fixes to the implementation handoff, coordinates the
implementer/reviewer rerun, and owns final deterministic validation.

| Role | Focus | Inputs | Output |
| --- | --- | --- | --- |
| Agent 1 — Implementation (high) | Requirement acquisition, full implementation, tests, initial checks | Jira/Confluence once, scoped repo guidance, source | `context/*`, `implementation/*`, `traceability.md`, `status.json` |
| Agent 2 — Test review (high) | Test adequacy, per-AC implementation/test status, changed-file coverage, and spec gaps | requirements, Confluence matrix/cases, implementation metadata, test-coverage matrix, traceability, diff/source | `reviews/test-review.md` |
| Agent 3 — Code quality (low) | Focused maintainability, convention, and test case ID comment review | requirements, Confluence cases, traceability, implementation metadata, changed files, affected suites, diff/source | `reviews/code-quality-review.md` |
| Agent 4 — Requirements validation (low) | Acceptance criteria and business behavior coverage | requirements, implementation summary, traceability, diff/source | `reviews/requirements-review.md` |
| Agent 5 — Final validation/orchestration (medium) | Verify, reconcile, hand accepted fixes to Agent 1, coordinate selective rerun, final checks | All runtime artifacts and current diff/source | `implementation/fix-handoff.md` when needed, `final/*`, updated `status.json` |

Reviewers should limit repository reads to changed files and directly relevant
callers/tests. Jira and Confluence are read by Agent 1 only; downstream agents
use the snapshot unless it is demonstrably incomplete or stale. A refresh, if
needed, is a single explicit orchestrator action before rerunning affected
work, followed by updating the snapshot.

## Selective revalidation and retry bound

Agent 5 never edits product source or tests. It hands accepted findings to
Agent 1, which performs the correction and reruns the full relevant validation
set captured during initial implementation. Use this reviewer matrix after
Agent 1 reports the handoff complete:

| Fix | Reviewers to rerun |
| --- | --- |
| Any accepted Agent 2 finding, including tests-only gaps/fixes | Agents 2 and 3; also Agent 4 if a Jira behavior/contract could change |
| Test-only change from a finding outside Agent 2 | Agents 2 and 3 if test assumptions or implementation evidence could change |
| Production behavior, authorization/security, API contract, or database/schema change | Agents 2, 3, and 4 |
| Production implementation change with behavior unchanged | Agents 2 and 3 |
| Refactor only | Agent 3; also Agent 2 if behavior or test assumptions may change |
| Documentation only | None, unless it changes an interface or operational requirement |

Any accepted test-review issue returns to Agent 1 for implementation/test
repair, then must pass Agents 2 and 3 again. Agent 5 may adjudicate findings
after that one cycle but must not directly patch source or launch another
repair/review cycle. Run final deterministic checks after the cycle. If an
unresolved serious finding remains, or a required check fails, set `stage` to
`failed`, describe the blocker in `final/findings.md`, and record the check
result in `final/validation.md`.

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
