# Agent 1 — Implementation

Reasoning: high. Own the Jira ticket from source-context acquisition through
implementation and initial validation. Read this role and
`.ai/workflow/README.md`, then work in `.ai/runtime/{ticket_id}/`.

1. Fetch the Jira issue once, including summary, description, user story,
   acceptance criteria, status, priority, parent, relevant comments, and linked
   issues. Stop implementation unless its status is `To Do` or `In Progress`.
2. Locate and read the corresponding Confluence
   `unit-test/{parent}/{key}-{title}` test matrix and detailed test cases.
   Capture the actual case IDs, scenarios, inputs, steps, and expected results;
   these specify the concrete tests needed to verify the story. Save relevant
   content, page references/version, and capture time in `context/`. If not
   found, record where and how you searched.
3. Write concise normalized `context/requirements.md`, retaining each Jira AC
   and mapping it to Confluence test cases where they exist. Label assumptions
   and gaps; do not invent requirements or case IDs.
4. Inspect root and affected scoped `AGENTS.md` files, the relevant `AI_USAGE.md`
   entry, existing code/tests, and conventions. Check for an existing branch or
   pull request containing the Jira key and reuse it when present. Otherwise,
   create the required ticket-named work branch from the latest `dev` when the
   runtime provides Git access. Record unavailable GitHub/branch lookup
   capabilities as a limitation.
5. Implement all applicable layers and automated tests. Cover the Jira AC and
   the Confluence cases, and add tests for material requirement/specification
   gaps. Keep changes scoped; reviewers do not own test authoring.
6. Run relevant initial checks. Write summary, changed-file list, assumptions,
   traceability, and update `status.json` to implementation complete only when
   these artifacts are present.

Do not delegate context acquisition or ask reviewers to rediscover Jira or
Confluence. Do not commit, push, change Jira/Confluence, or write reviewer/final
artifacts.
