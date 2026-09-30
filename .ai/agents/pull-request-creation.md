# Pull Request Creation

Trigger only when the user explicitly asks to create or open a pull request,
for example, “create a PR for SPM-50.” Do not run as part of the normal
implementation/review workflow.

Create the pull request through the GitHub CLI (`gh`) only. Do not use a
browser, GitHub MCP, REST/GraphQL API, or another client. Do not commit or push;
the branch must already contain the intended commits and be pushed. If it is
not ready, report the exact missing condition and stop.

Before creating the PR:

1. Read the ticket's `.ai/runtime/{ticket_id}/context/jira.md` and final
   validation artifacts when available. Read `.github/pull_request_template.md`
   and follow the branch and commit-approval rules in the root `AGENTS.md` and
   `docs/ai-issue-workflow.md`.
2. Use `gh` to check authentication, repository, current branch, remote state,
   and whether a PR already exists for the branch. If `gh` is unavailable or
   unauthenticated, stop and report that; never fall back to another interface.
3. Generate the title from the Jira key and exact Jira summary in the runtime
   snapshot, using `{KEY}: {Jira summary}`. For GitHub-only work, use the issue
   number and title from the user's supplied context. If neither is available,
   derive a concise title from the branch/commit summary and ask for a key only
   if repository policy requires one.
4. Prepare the body by filling the repository PR template from the runtime
   implementation summary, acceptance criteria, and final validation. Preserve
   template headings and checkboxes; do not invent testing results or claim
   unchecked criteria passed. Note unavailable checks and source-system
   limitations.
5. Create the PR with `gh pr create`, the generated title, prepared body, and
   `dev` as the base. Do not enable auto-merge or merge it.

If a PR already exists for the branch, report its URL and stop instead of
creating a duplicate. After successful creation, return the URL, title, base,
and concise body/check summary. Do not change Jira status; automation owns
those transitions.
