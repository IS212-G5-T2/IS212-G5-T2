# Development-Agent Contract

## Purpose

Defines shared assignments, evidence, permissions, review results, and verification requirements for development sub-agents. Workflow decisions belong to the [Orchestrator](../agents/orchestrator.md); specialized procedures belong to agent playbooks or skills.

**Agents:**
- [Implementation](../agents/implementation.md): Authorized implementation, tests, and corrections.
- [Test Reviewer](../agents/test-code-reviewer.md): Technical and requirement-related test adequacy.
- [Requirement Reviewer](../agents/requirement-reviewer.md): Business correctness against authoritative requirements.
- [Code Quality Reviewer](../agents/code-quality-reviewer.md): Maintainability, engineering quality, and technical risks.

**Configuration:** `AGENTS.md` defines repository rules and routing; `CLAUDE.md` supplies Claude-specific entry instructions. Native sub-agents use `.codex/agents/*.toml` (Codex) or `.claude/agents/*.md` (Claude Code). Codex discovers repository skills directly in `.agents/skills/*/SKILL.md`.

Playbooks do not automatically register native agents. Skills provide reusable procedures, not agent identities or permissions. Use only available, relevant skills.

## 1. Workflow and Authority

| Request | Workflow |
|---|---|
| Implementation | Implementation → Test → Requirement and Code Quality (may run concurrently) |
| Test / Requirement / Quality review | Requested reviewer only |
| Authorized remediation | Implementation → Affected reviews |
| Combined request | Required stages in dependency order |

**Rules:**
- Orchestrator alone selects workflows, controls gates, evaluates findings, and authorizes transitions within approved permissions.
- Full implementation requires all three independent review gates. Accept Test Review before starting Requirement Review or Code Quality Review; the latter two may run concurrently on the same stable snapshot. Targeted reviews do not automatically trigger implementation or unrelated reviews.
- Reviewers remain read-only; Implementation owns authorized corrections. Never run dependent reviewers concurrently or assign competing edits. Wait for both parallel reports before changing their shared snapshot or deciding completion.
- Default maximum: three implementation/review cycles, counting the first completed implementation or remediation. Report unresolved findings at the limit.
- Without native sub-agents, execute logical roles sequentially where permitted and disclose the limitation; never claim independent multi-agent verification.

**Authority:** Follow user-approved scope, `AGENTS.md`, and applicable scoped instructions. Jira defines applicable acceptance criteria/business rules; Confluence supplies relevant specifications and clarifications. Existing code supplies technical evidence, not new business requirements. Report material source conflicts rather than silently resolving them. Enforce repository Jira status/readiness gates before implementation.

**Permissions:** Reviewers must not intentionally alter application code/tests. Handle check-generated artifacts safely. Never discard user changes, exceed assigned scope, commit, push, create PRs, change Jira status, or perform restricted actions without required authorization. Report missing access or permissions.

## 2. Assignment Contract

Every invocation receives structured named fields (JSON when supported):

| Group | Required fields |
|---|---|
| Identity | `task_id`, `stage`, `iteration`, `workflow` |
| Context | `requirement_sources`, `requirement_ids`, `scope`, `changed_files` |
| Snapshot | `target_snapshot` |
| Governance | `repository_instructions`, `allowed_actions`, `prohibited_actions` |
| Verification | `expected_checks`, `expected_report` |

`stage` is `implementation`, `test_review`, `requirement_review`, or `code_quality_review`. Include previous findings, gate decisions, and corrections when relevant. Supply sufficient context without unrelated files or redundant history.

**Snapshot contract:** Before reviews, record HEAD, branch, Git status, changed paths, and content fingerprints covering relevant tracked, staged, unstaged, and untracked inputs. Reviewers inspect the assigned stable snapshot; relevant changes invalidate affected review results. Corrections create new snapshots. Retain previous gate results only while their evidence remains applicable.

## 3. Response Contract

**Implementation reports:** Requirements/assumptions; inspected and modified files; implemented behavior; tests added/updated; exact checks/results; requirement-to-code/test evidence; limitations; unresolved questions; final repository state. Implementation cannot approve its own review gate.

**Reviewer reports:** `reviewer`, `snapshot`, `scope_inspected`, `gate_result`, `findings`, `checks_executed`, `evidence`, `requirements_affected`, `limitations`, `recommended_next_action`.

**Gate results:**
- `PASS`: All applicable required criteria verified within assigned scope.
- `BLOCKED`: Substantiated findings prevent approval.
- `UNABLE_TO_VERIFY`: Required evidence, sources, or access are insufficient.

Never infer `PASS` from missing evidence. A targeted-review `PASS` does not certify unrelated functionality.

## 4. Finding Contract

Each actionable finding includes:

`id`, `severity`, `status`, `blocking`, `requirement_or_behavior`, `file_and_line` (where available), `observed_evidence`, `expected_behavior`, `impact`, `recommended_correction`.

**Statuses:** `OPEN`, `RESOLVED`, `DISMISSED_WITH_EVIDENCE`, `ACCEPTED_BY_HUMAN`.

Resolution requires appropriate verification. Dismissal requires evidence and Orchestrator decision; risk acceptance requires authorized human approval. Neither risk acceptance nor dismissal makes an unmet acceptance criterion `Satisfied`.

| Severity | Meaning and gate policy |
|---|---|
| Critical | Severe security/data-loss/core-flow risk. Blocks unless resolved or human-accepted. |
| High | Required behavior, authorization, or essential evidence incorrect/missing. Blocks unless resolved or human-accepted. |
| Medium | Material bounded engineering/test gap. Blocks if required behavior or evidence is affected; otherwise document disposition. |
| Low | Minor maintainability/presentation concern. Advisory unless greater impact is evidenced. |

Findings must identify concrete impact and evidence, not speculation.

## 5. Requirement Traceability

Requirement Reviewer returns one row per applicable business requirement and currently due DoD item from `ai/agents/requirement-reviewer.md`. Items dependent on the concurrent Code Quality Review, PR/CI, human or PO approval, merge, or post-merge verification are reported as pending, not passed or treated as N/A:

`Requirement | Source | Implementation Evidence | Test Evidence / N/A Reason | Status | Finding`

Allowed statuses: `Satisfied`, `Partially Satisfied`, `Not Satisfied`, `Unable to Verify`, `Not Applicable`.

`Satisfied` requires credible implementation evidence and applicable test evidence. Test Review may assess acceptance-criteria coverage but does not replace independent Requirement Review.

## 6. Corrections and Revalidation

The Orchestrator validates findings and sends authorized corrections to Implementation, including original context, evidence, expected behavior, affected scope, and verification expectations.

After correction, capture a new snapshot and apply:

| Change | Revalidation |
|---|---|
| Tests only | Test Review; Requirement Review if traceability/behavior evidence changes |
| Behavior, validation, authorization, persistence, public interfaces | Test → affected Requirement and Code Quality reviews; the latter may run concurrently |
| Behavior-neutral internal refactor | Affected checks → Code Quality |
| Component interactions / side effects | Relevant integration checks and affected gates |
| Evidence invalidating previous gates | Reopen affected gates and dependents in original order |

Corrections are not closed based solely on Implementation's report. Full workflows accept Test first, then accept both Requirement and Code Quality on valid snapshots; those two reviews need no ordering between them. Targeted workflows repeat only necessary stages unless authorized scope or verification dependencies require expansion.

## 7. Completion and Reporting

Completion requires:

1. Selected workflow executed in the required order on valid snapshots.
2. All required gates passed; every finding has a documented disposition.
3. Applicable requirements have final statuses where in scope.
4. Required checks passed, or missing verification and limitations are explicitly reported.
5. No unresolved blocker or known regression is represented as resolved.
6. All changes comply with authorization boundaries.

**Final report:** Task, workflow, agents executed, final snapshot, ordered gate results, findings/corrections, checks actually run, requirement results, limitations, changed/staged files, and next action.

Return reports to the Orchestrator. Write report artifacts only to ignored `ai/runtime/` when assigned. Keep persistent instructions/configuration in version-controlled `.codex/`, `.claude/`, `ai/agents/`, `ai/docs/`, and applicable skill directories.

Never claim unexecuted checks, unavailable integrations, simulated independence, or unsupported results.

**Principle: Assign explicitly, verify independently, correct within authorization, and close with evidence.**
