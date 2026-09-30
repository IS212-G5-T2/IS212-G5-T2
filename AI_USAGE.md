# AI Usage Log

Record concise AI-assisted work here. Keep open-ticket history in this file; move a ticket's complete section to `docs/ai-usage-archives/SPM-<id>.md` only after the user explicitly says it is closed or asks to archive that identified ticket. Move unlinked issue records to `unknown.md` only when the user asks. Do not record secrets, private conversations, or production data.

## Writing convention

- Entry heading: `dd-mm-yyyy - <agent> - <ticket-id-or-branch-name>` (for example, `30-09-2026 - Codex - SPM-50` or `30-09-2026 - Codex - fix/example-branch`). Use the ticket ID when known; otherwise use the recorded branch name. Use `Unknown` for unlinked archived issues with neither, and `General` for other work.
- Keep each entry concise and retain the existing fields for issue, requester, areas, summary, assumptions, checks, and follow-up.
- Use `SPM-<id>` for ticket work; when no ticket ID exists, use the recorded branch name. Do not infer or invent ticket keys or branches. Use `Unknown` only when neither is known and `General` for other work.
- Archives use the same heading format; ticket files use the `SPM-<id>` suffix and `unknown.md` entries use a known branch name or `Unknown`.
- After archiving, replace the ticket history here with a concise pointer: `<user> had <SPM-id> (<issue>). <area summary>. [Archive](path)`. Group each pointer under `Archived ticket pointers` and a `dd-mm-yyyy - <agent> - <ticket-id>` heading.
- For ticket work, find and read only its section: `rg -n '^## SPM-<id>$' AI_USAGE.md`, then read through the next ticket heading. Read `General` only when relevant.

## Ticket sections

No open Jira ticket sections currently have entries. Add ongoing work under `## SPM-<id>`.

## Archived ticket pointers

## 30-09-2026 - Codex - SPM-30

- swr had SPM-30 (Attendee login). Frontend authentication and attendee route controls. [Archive](docs/ai-usage-archives/SPM-30.md)

## 30-09-2026 - Codex - SPM-36

- Ei Chaw Zin had SPM-36 (Create and submit an event request). Event request form, submission persistence, and acceptance tests. [Archive](docs/ai-usage-archives/SPM-36.md)

## 30-09-2026 - Codex - SPM-37

- swr and kirub had SPM-37 (Save event request as a draft). Draft persistence, resume/edit flows, and related frontend/backend tests. [Archive](docs/ai-usage-archives/SPM-37.md)

## 30-09-2026 - Codex - SPM-38

- chaw678 had SPM-38 (Review a submitted request details). Coordinator review access, assignment, and event status handling. [Archive](docs/ai-usage-archives/SPM-38.md)

## 30-09-2026 - Codex - SPM-39

- swr had SPM-39 (Request clarification or amendment). Clarification session fixtures and PostgreSQL E2E diagnostics. [Archive](docs/ai-usage-archives/SPM-39.md)

## 30-09-2026 - Codex - SPM-83

- kirub had SPM-83 (Reject a request). Rejection validation, API/UI flow, and notification persistence. [Archive](docs/ai-usage-archives/SPM-83.md)

## 30-09-2026 - Codex - SPM-103

- swr had SPM-103 (Set up Database for RBAC). PostgreSQL RBAC schema and seed data. [Archive](docs/ai-usage-archives/SPM-103.md)

## 30-09-2026 - Codex - SPM-104

- An unidentified user had SPM-104 (Set up Frontend login page). Firebase login, session persistence, and route guards. [Archive](docs/ai-usage-archives/SPM-104.md)

## 30-09-2026 - Codex - SPM-106

- swr had SPM-106 (Set up JWT verification and authorization). Bearer-token verification and role-based permissions. [Archive](docs/ai-usage-archives/SPM-106.md)

## 30-09-2026 - Codex - Unknown

- Multiple users had unknown issues. Unlinked setup, maintenance, and troubleshooting records. [Archive](docs/ai-usage-archives/unknown.md)

## General

## 13-09-2026 - Codex - General

- Issue/PR: PR #6
- Human requester/operator: swr
- Areas touched: `services/backend`, `AI_USAGE.md`
- Summary: Removed `vite-tsconfig-paths`, which required a TypeScript 5.x peer and caused `npm ci` to request 5.9.3 despite the backend using TypeScript 7; enabled Vite's native tsconfig path resolution and removed temporary CI diagnostics.
- AI contribution: Dependency/configuration fix, CI cleanup, lockfile regeneration, tests, commit, and push.
- Assumptions: The current Vite version's native `resolve.tsconfigPaths` support is the intended replacement.
- Checks run: `npm install --package-lock-only`; `npm ci --ignore-scripts`; `npm test`; workflow YAML validation; `git diff --check`.
- Follow-up/conflict notes: No secret files were included or modified.

## 11-09-2026 - Codex (GPT-6) - General

- Issue/PR: SPM Project assignment lookup; no implementation requested.
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: `AI_USAGE.md`; read-only GitHub and Jira inspection.
- Summary: Confirmed origin points to IS212-G5-T2/IS212-G5-T2 and remote dev is reachable through Git. Retrieved all assigned Jira issues through the legacy connector authenticated as the requester; all three are stories.
- AI contribution: Connection verification and assignment retrieval.
- Assumptions: Used the legacy connector identity matching the requester; the other Atlassian connector uses a different account.
- Checks run: Git remote/status, gh auth status, gh repo view, git ls-remote, Jira identity and paginated JQL search (last page confirmed).
- Follow-up/conflict notes: GitHub CLI account kishorek2024-bot cannot resolve the repository through the API; write access was not tested. Preserved existing AI_USAGE.md changes. No implementation, commit, push, or Jira mutation.

## 09-09-2026 - Codex (GPT-6) - General

- Issue/PR: SPM project automation; no implementation ticket.
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: `AI_USAGE.md`; read-only Jira browser inspection.
- Summary: Verified four enabled SPM rules: Branch created with status To Do -> In Progress; Pull request created with status In Progress -> In Review; Pull request merged with status In Review -> Done; Pull request declined with status In Review -> In Review.
- AI contribution: Jira automation inspection, workflow analysis, and AI usage logging.
- Assumptions: Configuration inspection establishes rule intent, not evidence of successful executions. No Jira settings were changed.
- Checks run: Read all four rule canvases and the branch trigger condition in the authenticated Jira UI. Connector discovery did not expose automation rules.
- Follow-up/conflict notes: The decline rule, named 'Copy of Transition to In Review', does not implement the user's desired return to In Progress. This live inspection supersedes the earlier unverified automation assumptions below.

## 09-09-2026 - Codex (GPT-6) - General

- Issue/PR: None; repository review requested directly.
- Human requester/operator: Kirubakaran Kishore.
- Areas touched: Local Git checkout; `AI_USAGE.md`.
- Summary: Fast-forwarded local `dev` only to `origin/dev` at `e4a9450` and reviewed repository guidance, application structure, local integration configuration, and CI. No other branch was merged, and no commit, push, or PR was created.
- AI contribution: Repository inspection and workflow analysis.
- Assumptions: The user's current instruction overrides older guidance: always create new work branches from latest `dev`, name them `<type>/<ticket_id>-<ticket_name>`, merge work into `dev`, then promote `dev` into `main` (source of truth). User-described Jira transitions are branch created -> In Progress, PR created -> In Review, PR merged -> Done, PR rejected -> In Progress; live automation settings and the exact rejection trigger were not verified.
- Checks run: Git fetch, fast-forward-only update, HEAD/origin-dev equality, clean diff against origin/dev before this ledger entry, and source/configuration searches. Application tests were not run for this inspection.
- Follow-up/conflict notes: AGENTS, workflow docs, component READMEs, PR template, and CI retain staging-based guidance; documented merge transition remains Testing. Root README partially reflects dev but omits promotion to main. These files and remote settings were not changed as part of the review.

## 22-09-2026 - Codex (GPT-5) - General

- Context: User no longer wanted frontend and backend coverage aggregated into one folder; the V8 package and per-component reports remain required.
- Areas touched: root coverage-dashboard documentation and `AI_USAGE.md`.
- Summary: Removed the obsolete root dashboard documentation. The already-removed aggregation scripts and CI dashboard upload are not restored; frontend and backend retain their independent V8 coverage configuration and commands.
- Assumptions: Per-component `coverage/` reports are sufficient for local coverage use.
- Checks: Confirmed the combined dashboard scripts and CI steps are absent while both component coverage configurations remain present.
- Follow-up/conflict notes: No dependency, commit, push, or pull request was removed or created.

## 30-09-2026 - Codex - General

- Issue/PR: None; documentation maintenance requested directly
- Human requester/operator: swr
- Areas touched: `AI_USAGE.md`, `docs/ai-issue-workflow.md`, `docs/ai-usage-archives/`
- Summary: Grouped history by Jira ticket, standardized entry headings, and updated the workflow to read only the relevant ticket section. Migrated nine completed ticket histories into per-ticket archive files and added concise pointers for them.
- Assumptions: Jira `Done` status identifies the ticket histories requested for migration; general work remains in the active log.
- Checks run: `git diff --check`; checked Jira statuses, archive headings, ticket counts, retained General entries, and pointer links.
- Follow-up/conflict notes: Archived `SPM-30`, `SPM-36`, `SPM-37`, `SPM-38`, `SPM-39`, `SPM-83`, `SPM-103`, `SPM-104`, and `SPM-106`. No Jira statuses were changed.

## 30-09-2026 - Codex - General

- Issue/PR: None; workflow structure clarification
- Human requester/operator: swr
- Areas touched: `.ai/`, `.codex/`, `.claude/`, root agent guidance, `README.md`, `.gitignore`, `AI_USAGE.md`
- Summary: Moved canonical role contracts and the workflow into `.ai/`; added native Codex TOML role registrations/configs and Claude Markdown adapters. Codex reviewers use read-only sandboxes and return findings for the orchestrator to persist. The runtime snapshot remains ignored.
- Assumptions: Codex project configuration is trusted. The active Codex runtime supplies orchestration; these files register role behavior and do not create a separate runner.
- Checks run: Codex `debug prompt-input` loaded the project context; TOML/role/link structure validation and `git diff --check` passed.
- Follow-up/conflict notes: Preserved concurrent AI_USAGE ledger restructuring and archive files without modifying them. No Jira/Confluence content was fetched; no commit or push was made.

## 30-09-2026 - Codex - General

- Issue/PR: None; AI usage organization requested directly
- Human requester/operator: swr
- Areas touched: `AI_USAGE.md`, `docs/ai-usage-archives/`, `.ai/agents/ticket-completion.md`, `.ai/workflow/README.md`
- Summary: Moved 72 entries with unknown or unprovided issue references to `unknown.md`; dated headings now use ticket IDs or a recorded branch name, then `Unknown` when neither is available.
- Assumptions: Known pull requests and project-level entries remain in General.
- Checks run: `git diff --check`; verified entry counts and archive links.
- Follow-up/conflict notes: None.
