# AI Issue Workflow

Use this workflow when asking any AI agent to solve a GitHub issue, for example: "Solve GitHub issue #155."

## Flow

1. Read the ticket.
2. Read what is already done, including `AI_USAGE.md`.
3. Choose the branch progression.
4. Create a branch.
5. Implement the change.
6. Test the change.
7. Update `AI_USAGE.md`.
8. Push the branch.
9. Create a pull request.
10. Report completion.

GitHub calls this final review step a pull request. If the task says "merge request", create a pull request.

## AI Checklist

### 1. Read The Ticket

- Open the GitHub issue.
- Capture the issue number, title, requested behavior, acceptance criteria, screenshots, linked Jira ticket, and any comments that change scope.
- If the issue is unclear, ask one focused question before implementation.

### 2. Read What Is Done

- Check the current branch and working tree.
- Read `AI_USAGE.md` for recent AI-assisted work, assumptions, and conflict notes.
- Read the relevant `AGENTS.md` files from root to the affected folder.
- Inspect related source, tests, README, handover, workflows, and recent changes.
- Preserve user or teammate changes that are already present.

### 3. Choose The Branch Progression

Choose the flow from the GitHub issue or linked Jira card:

- Normal feature, bug fix, refactor, test, or documentation cards go into `integration`.
- Release preparation or "move integration to staging/release" cards promote `integration` into `staging` by default.
- Deployment, production release, or "move staging to deployment/production/main" cards promote `staging` into `main`.
- Production hotfix cards branch from `main`, then back-merge or cherry-pick to lower branches if needed.

If the card is unclear, ask one focused question before creating the branch or pull request.

### 4. Create The Branch

- Start from the latest appropriate base branch.
- Use the issue number in the branch name.

Examples:

```text
feature/155-short-description
fix/155-short-description
docs/155-short-description
chore/155-short-description
release/155-short-description
deploy/155-short-description
hotfix/155-short-description
```

Branch and pull request targets:

| Card intent | Start from | Pull request target |
| --- | --- | --- |
| Normal implementation | `integration` | `integration` |
| Release preparation | `integration` | `staging` by default; `release/*` only if explicitly requested |
| Deployment or production release | `staging` | `main` |
| Production hotfix | `main` | `main` |

### 5. Start Creating

- Keep the change focused on the issue.
- Match existing patterns before adding new dependencies, folders, or abstractions.
- Update documentation when behavior, setup, workflow, or operational steps change.
- Keep secrets, credentials, tokens, private keys, and real production data out of the repo.

### 6. Test

- Run the smallest meaningful checks first.
- Expand checks when the change touches shared behavior, CI, infrastructure, deployment, or user-facing workflows.
- Record any check that cannot be run and why.

### 7. Update AI_USAGE

- Add or update one concise entry in `AI_USAGE.md`.
- Record the AI tool/model if known, issue or PR, areas touched, summary, assumptions, checks run, and follow-up/conflict notes.

### 8. Push

- Review the diff before pushing.
- Commit with a clear prefix such as `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `ops:`, or `chore:`.
- Push the branch to GitHub.

### 9. Create The Pull Request

- Use `.github/pull_request_template.md`.
- Link the GitHub issue.
- Include what changed, test evidence, acceptance criteria coverage, and known risks.
- Set the pull request base branch according to the branch progression table.
- Stop for human review unless explicitly told to merge.

### 10. Done

Report:

- Branch name.
- Pull request link.
- Files changed.
- Tests/checks run.
- Checks not run and why.
- Any follow-up needed from the human reviewer.
