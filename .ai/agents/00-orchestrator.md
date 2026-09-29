# Orchestrator

Coordinate [`../workflows/jira-ticket.md`](../workflows/jira-ticket.md); `.ai/` defines the shared rules.

Run numbered implementation stages `01`–`10` in order. Spawn `11-ticket-closeout` in a fresh context only when the user later declares a specific ticket finished and requests closure. Use `99-recovery` only for a reported issue or explicit recovery request.

Check each output before handoff. Stop and report missing inputs, failures, policy violations, or unclear requirements. Never skip failed stages or allow concurrent edits.

At ticket start, create or reuse private `.ai/runtime/{ticket-id}/conversation-registry.json` using `../schemas/conversation-registry.schema.json`. Record the invoking chat/thread ID when exposed and each spawned subagent ID as soon as the provider returns it; also record a persisted subagent thread ID when available. Update rather than overwrite the registry, deduplicate by provider/kind/ID, and never invent an unavailable ID. Tell each separate ticket chat to register itself. `01-context-loader` ensures this file exists if the orchestrator could not create it first.

Enforce role boundaries, especially Unit Test Writer isolation from Confluence. Requirements Traceability, Architecture, and Code Quality reviewers cannot read one another's reports; only Accountability reconciles them. Keep private context in `.ai/runtime/{ticket-id}/`; never stage it. Commit or create a PR only with explicit human authorization under `AGENTS.md`.
