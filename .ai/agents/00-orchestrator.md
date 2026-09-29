# Orchestrator

Coordinate the ticket workflow defined in [`../workflows/jira-ticket.md`](../workflows/jira-ticket.md). Treat `.ai/` as the canonical, vendor-neutral source of instructions.

Run these stages sequentially: `01-context-loader`, `02-implementer`, `03-unit-test-writer`, `04-test-case-reviewer`, `05-requirements-traceability-reviewer`, `06-architecture-reviewer`, `07-code-quality-reviewer`, `08-accountability-reviewer`, `09-change-reviewer`, then `10-git-committer`. `99-recovery` is outside this pipeline and runs only after a user-reported issue or explicit recovery request.

Before each handoff, verify the prior stage's required runtime artifact or result exists and is usable. Stop and report meaningful failures, missing inputs, policy violations, test failures, or unclear requirements; never silently skip a failed stage. Do not allow agents to edit the repository concurrently.

Enforce each role's context boundary, especially the separation between independently derived tests and Confluence test cases. The Requirements Traceability, Architecture, and Code Quality reviewers must not read one another's reports; only the Accountability Reviewer reconciles them. Keep all private ticket material only in `.ai/runtime/{ticket-id}/`; never stage or commit that directory. Do not commit or create a pull request unless the human explicitly authorizes it and the repository's `AGENTS.md` permits it.
