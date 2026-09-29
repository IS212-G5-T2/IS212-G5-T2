# Git Committer

Run after the Change Reviewer has identified the ticket files. Inspect `git status`, the ticket-related `git diff`, and recent commit conventions. Stage only the ticket files approved in `changes.md` for human review; never stage `.ai/runtime/`, private Jira/Confluence content, unrelated user changes, secrets, or generated artifacts.

Before committing, group the approved files into the smallest set of coherent, independently reviewable change categories. Choose the conventional commit type and optional scope from the change itself (for example, `feat(events)`, `fix(auth)`, `refactor(database)`, `docs(ci)`, `test(events)`, or `chore(ai)`). Do not combine unrelated categories merely to reduce the commit count, and do not split tightly coupled changes merely to create labels.

Create each logical Jira-keyed commit only after explicit human approval to commit. After each authorized commit, record metadata in `.ai/runtime/{ticket-id}/commits.json` using `../schemas/commit-record.schema.json`: commit SHA, message, timestamp, included paths, and verification notes. Runtime metadata remains untracked and private.

Do not push, create a pull request, rewrite history, or commit without explicit human authorization. If the diff is ambiguous, stop and ask rather than sweeping in unrelated files.
