# Jira Ticket Workflow

Use this lean route:

```text
00 Main Coding → 01 Implementation → 02 Test + 03 Quality + 04 Requirements (parallel) → 00 Fix/Revalidate → Deliver
```

## Main Coding Agent

1. Read root/scoped `AGENTS.md`, search `AI_USAGE.md` only for active overlap, inspect related branch/PR work, then retrieve Jira summary, story, ACs, scope-changing comments, priority, sprint, and status. Jira governs requirements; stop unless status is `To Do` or `In Progress`.
2. Retrieve private Confluence cases only for test-coverage validation: epic → `unit-test` → matching `SPM-<number>` folder → Matrix → case pages. If Jira or Confluence is unavailable, use only supplied details, record the limit privately, and stop if requirements are insufficient.
3. Create/reuse `.ai/runtime/{ticket-id}/conversation-registry.json`, register exposed chat/subagent IDs, and write only bounded private context: `jira.md`, `implementation-context.md`, `confluence-tests.md`, and `manifest.json`. Never stage runtime content.
4. Give Implementation bounded Jira, scope, relevant code, interfaces, and conventions—not Confluence cases or whole-repository context.
5. When implementation completes, start Test, Code Quality, and Requirements Agents independently and in parallel where supported. Give each the diff, only relevant paths/evidence, and its permitted ticket context. Never pass reviewer outputs or full conversations between them.
6. Deduplicate findings. Return substantial production fixes to Implementation; handle only trivial orchestration fixes directly. Revalidate only the affected agent/area after a fix, never automatically repeat all reviews.

## Review outputs

Each reviewer writes a concise private result:

```text
status: PASS | FAIL
issues:
  - severity: blocking | important | minor
    location: <file, test, or AC>
    problem: <description>
    recommended_action: <action>
```

## Roles and boundaries

| Agent | Capability | Responsibility |
| --- | --- | --- |
| `00-main-coding-agent.md` | Medium | Jira/context, bounded delegation, finding aggregation, targeted revalidation, delivery, authorized Git coordination |
| `01-implementation-agent.md` | High | Relevant code/dependencies, architecture decisions, production implementation, baseline unit/integration tests |
| `02-test-agent.md` | High | Independent behavioral, boundary, failure, authorization, regression, coverage, and integration validation; may change tests only |
| `03-code-quality-agent.md` | Low | Deterministic lint/format/type/static checks and obvious smells; no deep design review |
| `04-requirements-agent.md` | Low | Per-AC satisfied/not-satisfied Jira compliance and scope-creep check |

Agents do not spawn agents. Test, Quality, and Requirements reviewers do not modify production code, do not read each other's outputs, and run in parallel where possible. Context7 is used only when changed external/framework APIs need current-practice confirmation; deterministic checks come first.

## Git and completion

Reuse related branch/PR work; otherwise branch from latest `dev` as `<type>/<JIRA-key>-<ticket-name-slug>` and target `dev`. Before delivery, the Main Coding Agent checks every Jira AC, relevant Confluence disposition, changed paths, checks, and risks. Stage/commit/push/create a PR only with explicit human authorization; group approved changes into coherent Jira-keyed commits and never stage `.ai/runtime/`.

`11-ticket-closeout.md` remains user-triggered after a named ticket is finished. `99-recovery.md` remains separate for a reported issue or explicit recovery request.
