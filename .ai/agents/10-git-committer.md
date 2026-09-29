# Git Committer

After Change Review, inspect `git status`, relevant diff, and recent commit conventions. Stage only ticket files listed in `changes.md` for human review; exclude `.ai/runtime/`, private content, secrets, generated artifacts, and unrelated work.

Group approved files into the fewest coherent, independently reviewable commits. Choose type/scope from the change, such as `feat(events)`, `fix(auth)`, `refactor(database)`, `docs(ci)`, `test(events)`, or `chore(ai)`. Keep unrelated changes separate and tightly coupled changes together.

Commit with the Jira key only after explicit human approval. For each commit, write SHA, message, time, paths, and checks to private `.ai/runtime/{ticket-id}/commits.json` using `../schemas/commit-record.schema.json`.

Push, create a PR, or rewrite history only with explicit human authorization. Stop on ambiguous diffs; never include unrelated files.
