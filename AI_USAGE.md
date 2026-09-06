# AI Usage Log

Use this file to record meaningful AI-assisted work in this repository. The goal is coordination: if Codex, Claude, another AI tool, or a teammate changes the repo, future contributors should be able to see what was touched, why, and what assumptions were made.

Keep entries concise. Do not paste long prompts, private conversations, credentials, tokens, secrets, personal data, or production data.

## Entry Template

```md
## YYYY-MM-DD - <AI tool/model> - <short task title>

- Issue/PR: <GitHub issue, pull request, Jira ticket, or Unknown>
- Human requester/operator: <name or Unknown>
- Areas touched: <apps/...>, <services/...>, <platform/...>, <docs/...>, or <repo-wide>
- Summary: <what changed and why>
- AI contribution: <analysis, code, tests, docs, review, migration, etc.>
- Assumptions: <important assumptions made, or None>
- Checks run: <commands/workflows run, or Not run with reason>
- Follow-up/conflict notes: <known overlap with other AI/human work, pending review, or None>
```

## Entries

## 2026-09-07 - Codex - AI workflow and branch progression guidance

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: `AGENTS.md`, `docs/ai-issue-workflow.md`, `.github/pull_request_template.md`, `AI_USAGE.md`
- Summary: Added explicit AI usage tracking and branch progression rules for normal implementation, release preparation, deployment, and hotfix work in the GitHub monorepo. Renamed the issue workflow guidance from Codex-specific wording to AI-neutral wording so all AI agents follow the same process.
- AI contribution: Documentation structure, branch-flow guidance, pull request template updates, and coordination rules for multiple AI agents.
- Assumptions: `integration` is the default target for normal work, `staging` is the default release-preparation branch, and `main` is the production/deployment branch unless a human explicitly defines a release or deployment branch.
- Checks run: Reviewed updated Markdown sections and searched relevant workflow terminology.
- Follow-up/conflict notes: Future Codex, Claude, or other AI work should add a new entry here before pull request handoff.

## 2026-09-07 - Codex - GitLab to GitHub migration cleanup

- Issue/PR: Unknown
- Human requester/operator: swr
- Areas touched: repo-wide, `.github/`, `apps/`, `services/`, `platform/`, `development/`, `docs/`
- Summary: Copied working files from the GitLab export into the GitHub repository without copying nested `.git` directories, converted GitLab CI/review metadata to GitHub Actions and pull request metadata, removed stale project-info/GitLab-only material, simplified the service template, and documented the Codex issue workflow and monorepo CI/CD process.
- AI contribution: Migration cleanup, workflow restructuring, documentation updates, repo boundary guidance, and local verification sweeps.
- Assumptions: The GitHub repository should be the single source repo; `services/template` is a scaffold rather than an implemented service; GitHub pull requests replace GitLab merge requests.
- Checks run: Verified only one `.git` directory exists; validated GitHub Actions YAML with Ruby YAML parsing; searched for stale GitLab/project-info references; checked for copied `.DS_Store`, `.terraform`, `.env`, and empty-directory leftovers.
- Follow-up/conflict notes: All migrated files are still untracked until committed. Coordinate future AI work through this log to avoid conflicting changes across Codex, Claude, or other tools.
