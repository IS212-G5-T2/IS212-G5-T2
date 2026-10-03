# AI Usage Archives

Store one file per explicitly closed or archived Jira ticket, named `SPM-<id>.md`. Store unlinked issues in `unknown.md` only when the user asks.

## Writing convention

- Keep entry headings as `dd-mm-yyyy - <agent> - <ticket-id-or-branch-name>` (for example, `30-09-2026 - Codex - SPM-50` or `30-09-2026 - Codex - fix/example-branch`). Use the ticket key when known; otherwise use the branch name recorded in the entry. Use `Unknown` only when neither is known.
- Combine entries with the same date, agent, and ticket, branch, or category under one heading; keep different tickets separate.
- Preserve the concise entry fields used in the root `AI_USAGE.md`.
- Move a ticket's complete section here only after the user explicitly says it is closed or asks to archive that identified ticket. Do not infer closure from age, a merged pull request, or missing status.
- After moving it, replace the active log section with one concise pointer under `Archived ticket pointers`: `<user> had <SPM-id> (<issue>). <area summary>. [Archive](path)`.
- Keep the pointer grouped under a `dd-mm-yyyy - <agent> - <ticket-id-or-branch-name>` heading. Do not repeat the full history in the pointer.
- Keep general work in `AI_USAGE.md` unless the user explicitly asks to archive it; place requested general history in `general.md`. Do not archive tickets with unknown/open status. The user may explicitly request unlinked issue records in `unknown.md`.
