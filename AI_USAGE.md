# Active AI Work

This is a short coordination note, not a historical audit. Search it only for active overlap with the ticket or paths you will change. Use Git history, pull requests, and Jira for completed-work detail.

Add one concise bullet under the existing `## YYYY-MM-DD - Agent` heading only while work is active or has an unresolved handoff. Remove it after merge or abandonment. Never include private Jira/Confluence content or URLs, credentials, secrets, production data, or transcripts.

## 2026-09-30 - Codex

- **PR #32 / `refactor/agent_files`**: Shared vendor-neutral AI workflow is awaiting review and CI. It uses a pre-implementation architecture plan, repository-owned persistence, an active-only ledger, and a lean core route with risk-gated specialist reviews.
- **SPM-50 / `agent_testing/SPM-50-create-venue-records`**: Experimental isolated ticket run based on `refactor/agent_files`; do not mix its changes into PR #32. Commit, push, and PR creation still require explicit human approval.
