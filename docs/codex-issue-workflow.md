# Codex GitHub Issue Workflow

Use this workflow when asking Codex to solve a GitHub issue, for example: "Solve GitHub issue #155."

## Flow

1. Read the ticket.
2. Read what is already done.
3. Create a branch.
4. Implement the change.
5. Test the change.
6. Push the branch.
7. Create a pull request.
8. Report completion.

GitHub calls this final review step a pull request. If the task says "merge request", create a pull request.

## Codex Checklist

### 1. Read The Ticket

- Open the GitHub issue.
- Capture the issue number, title, requested behavior, acceptance criteria, screenshots, linked Jira ticket, and any comments that change scope.
- If the issue is unclear, ask one focused question before implementation.

### 2. Read What Is Done

- Check the current branch and working tree.
- Read the relevant `AGENTS.md` files from root to the affected folder.
- Inspect related source, tests, README, handover, workflows, and recent changes.
- Preserve user or teammate changes that are already present.

### 3. Create The Branch

- Start from the latest appropriate base branch, normally `main`.
- Use the issue number in the branch name.

Examples:

```text
feature/155-short-description
fix/155-short-description
docs/155-short-description
chore/155-short-description
```

### 4. Start Creating

- Keep the change focused on the issue.
- Match existing patterns before adding new dependencies, folders, or abstractions.
- Update documentation when behavior, setup, workflow, or operational steps change.
- Keep secrets, credentials, tokens, private keys, and real production data out of the repo.

### 5. Test

- Run the smallest meaningful checks first.
- Expand checks when the change touches shared behavior, CI, infrastructure, deployment, or user-facing workflows.
- Record any check that cannot be run and why.

### 6. Push

- Review the diff before pushing.
- Commit with a clear prefix such as `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `ops:`, or `chore:`.
- Push the branch to GitHub.

### 7. Create The Pull Request

- Use `.github/pull_request_template.md`.
- Link the GitHub issue.
- Include what changed, test evidence, acceptance criteria coverage, and known risks.
- Stop for human review unless explicitly told to merge.

### 8. Done

Report:

- Branch name.
- Pull request link.
- Files changed.
- Tests/checks run.
- Checks not run and why.
- Any follow-up needed from the human reviewer.
