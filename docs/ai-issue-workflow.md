# AI Issue Workflow

Use this workflow when asking any AI agent to solve a GitHub issue, for example: "Solve GitHub issue #155."

## Flow

1. Fetch the Jira work item.
2. Read the complete summary, description, user story, acceptance criteria, relevant comments, priority, and status.
3. Stop if the Jira status is not `To Do` or `In Progress`.
4. Inspect the GitHub repository, including existing work for the Jira key.
5. Reuse an existing branch or pull request when present.
6. Create a branch containing the Jira key when starting new work.
7. Implement all acceptance criteria.
8. Add or modify tests appropriate to each acceptance criterion.
9. Update `AI_USAGE.md`.
10. Commit with the Jira key, push, and create a GitHub pull request whose title contains the Jira key.
11. Re-check the implementation against every acceptance criterion.
12. Report completion.

GitHub calls this final review step a pull request. If the task says "merge request", create a pull request. Do not duplicate the Jira story into a GitHub Issue.

## AI Checklist

### 1. Fetch The Ticket

- Open the Jira ticket through the available Atlassian/Jira MCP or connector when possible.
- If Jira is unavailable, read the GitHub issue or user-provided ticket context.
- Capture the ticket key or issue number, title, priority, sprint, status, requested behavior, screenshots, linked GitHub issue, and any comments that change scope.
- If the ticket is unclear, ask one focused question before implementation.
- Do not mark the Jira work item `Done`.

### 2. Read The Story And Acceptance Criteria

- Treat the user story and acceptance criteria as the required behavior.
- Map each acceptance criterion to implementation, tests, documentation, or an explicit non-code decision.
- Do not invent missing acceptance criteria, ticket keys, statuses, or priorities.
- Do not implement the Jira card unless its status is `To Do` or `In Progress`.

### 3. Inspect The Repository

- Check the current branch and working tree.
- Read `AI_USAGE.md` for recent AI-assisted work, assumptions, and conflict notes.
- Read the relevant `AGENTS.md` files from root to the affected folder.
- Inspect related source, tests, README, handover, workflows, and recent changes.
- Check for an existing branch or pull request containing the Jira key.
- Reuse existing development work when present.
- Preserve user or teammate changes that are already present.

### 4. Plan The Implementation

- Identify affected ownership boundaries before editing.
- Name cross-boundary changes explicitly, such as frontend plus service, service plus Kubernetes, or Terraform plus deployment workflow.
- Keep the plan focused on the ticket.

### 5. Create Or Reuse The Correct Branch

Choose the flow from the GitHub issue or linked Jira card:

- Normal feature, bug fix, refactor, test, or documentation cards go into `integration`.
- Release preparation or "move integration to staging/release" cards promote `integration` into `staging` by default.
- Deployment, production release, or "move staging to deployment/production/main" cards promote `staging` into `main`.
- Production hotfix cards branch from `main`, then back-merge or cherry-pick to lower branches if needed.

- Start from the latest appropriate base branch.
- Use the issue number in the branch name.
- Include the Jira key in the branch name when a Jira key is available.
- If the card is unclear, ask one focused question before creating the branch or pull request.

Examples:

```text
feature/SPM-155-short-description
fix/SPM-155-short-description
docs/SPM-155-short-description
chore/SPM-155-short-description
release/SPM-155-short-description
deploy/SPM-155-short-description
hotfix/SPM-155-short-description
```

Branch and pull request targets:

| Card intent | Start from | Pull request target |
| --- | --- | --- |
| Normal implementation | `integration` | `integration` |
| Release preparation | `integration` | `staging` by default; `release/*` only if explicitly requested |
| Deployment or production release | `staging` | `main` |
| Production hotfix | `main` | `main` |

### 6. Implement And Test

- Keep the change focused on the issue.
- Match existing patterns before adding new dependencies, folders, or abstractions.
- Update documentation when behavior, setup, workflow, or operational steps change.
- Keep secrets, credentials, tokens, private keys, and real production data out of the repo.
- Implement every acceptance criterion.
- Run the smallest meaningful checks first.
- Add or modify tests appropriate to each acceptance criterion.
- Expand checks when the change touches shared behavior, CI, infrastructure, deployment, or user-facing workflows.
- Record any check that cannot be run and why.

### 7. Update AI_USAGE

- Add or update one concise entry in `AI_USAGE.md`.
- Record the AI tool/model if known, issue or PR, areas touched, summary, assumptions, checks run, and follow-up/conflict notes.

### 8. Commit And Push

- Review the diff before pushing.
- Commit with the Jira key and a clear prefix such as `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `ops:`, or `chore:`.
- Push the branch to GitHub.

### 9. Create The GitHub Pull Request

- Use `.github/pull_request_template.md`.
- Put the Jira key in the pull request title.
- Link the Jira ticket.
- Include what changed, test evidence, acceptance criteria coverage, and known risks.
- Include an implementation summary, acceptance-criteria checklist, and testing notes.
- Set the pull request base branch according to the branch progression table.
- Stop for human review unless explicitly told to merge.
- If review requests changes, continue work on the existing branch and pull request.
- Treat Jira automation as responsible for moving branch-created work to `In Progress`, pull-request-created work to `In Review`, and merged pull requests to `Testing`.

### 10. Done

Report:

- Branch name.
- Pull request link.
- Files changed.
- Tests/checks run.
- Checks not run and why.
- Confirmation that every Jira acceptance criterion was checked again.
- Any follow-up needed from the human reviewer.
