# General AI Usage Archive

General work archived at the user's request.

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
