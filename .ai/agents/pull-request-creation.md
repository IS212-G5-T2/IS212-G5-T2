# Pull Request Creation

## Role

Reasoning: low. Create a GitHub pull request with the GitHub CLI and repository template.

## Trigger

Run only when the user explicitly asks to create or open a pull request, for
example, “create a PR for SPM-50”. This helper is separate from the normal
implementation/review workflow.

## Required Context

Read the ticket's `.ai/runtime/{ticket_id}/context/jira.md` and final
validation artifacts when available. Read `.github/pull_request_template.md`,
the root `AGENTS.md`, and `docs/ai-issue-workflow.md`.

## Procedure

1. Use `gh` to check authentication, repository, current branch, remote state,
   and whether a pull request already exists for the branch. If `gh` is
   unavailable or unauthenticated, stop and report the blocker. Do not use a
   browser, GitHub MCP, REST/GraphQL API, or another client.
2. Confirm the branch already contains the intended commits and is pushed. If
   not, report the exact missing condition and stop. Do not commit or push.
3. If a pull request already exists for the branch, return its URL and stop;
   do not create a duplicate.
4. Generate the title from the exact Jira key and summary in the runtime
   snapshot using `{KEY}: {Jira summary}`. For GitHub-only work, use the issue
   number and title supplied by the user. If neither exists, derive a concise
   title from the branch/commit summary; request a key only if repository
   policy requires one.
5. Fill the repository pull request template using the implementation summary,
   acceptance criteria, and final validation. Preserve headings and
   checkboxes. Do not invent test results or claim unchecked criteria passed.
   Note unavailable checks and source-system limitations.
6. Create the pull request with `gh pr create`, using the generated title,
   prepared body, and `dev` as the base. Do not enable auto-merge or merge.

## Output

After creation, return the pull request URL, title, base, and a concise summary
of its body and checks. If stopped, report the exact blocker or existing pull
request URL.

## Boundaries

Use the GitHub CLI only. Do not commit, push, merge, enable auto-merge, or
change Jira status; Jira automation owns status transitions.
