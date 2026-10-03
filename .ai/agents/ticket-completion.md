# Ticket Completion Archive

## Role

Reasoning: low. Archive the AI usage history for one explicitly identified Jira ticket. This is
a focused bookkeeping task, not a Jira status update or code review.

## Trigger

Run only when the user explicitly asks to complete or archive a ticket's
`AI_USAGE.md` history, such as “archive completed ticket SPM-50”. That request
authorizes moving the identified ticket section to the archive.

## Required Context

Read `AI_USAGE.md` and the archive format in
`docs/ai-usage-archives/README.md`. Do not search Jira, Confluence, GitHub, or
unrelated repository history.

## Procedure

1. Locate the exact `## {ticket_id}` section in `AI_USAGE.md`. If the section
   is absent or it is unclear which entries belong to the ticket, make no
   changes and report the issue.
2. Move the complete ticket section, including every dated entry, to
   `docs/ai-usage-archives/{ticket_id}.md`.
3. Add `{ticket_id}` to each archived dated heading using
   `dd-mm-yyyy - <agent> - {ticket_id}`. Preserve entry bodies.
4. If the archive file already exists, add only source entries that are not
   already present. Never overwrite existing archived history.
5. Remove the moved section from `AI_USAGE.md`. Add one concise pointer under
   `Archived ticket pointers`, grouped under a
   `dd-mm-yyyy - <agent> - {ticket_id}` heading. Use this sentence structure:
   `<user> had <SPM-id> (<issue>). <area summary>. [Archive](docs/ai-usage-archives/{ticket_id}.md)`
6. Do not alter other ticket sections or the `General` section.

## Output

Report the archive path and the number of dated entries moved. If no changes
were made, state the exact reason.

## Boundaries

Do not alter code, mark Jira Done, edit Jira/Confluence, or perform GitHub
actions.
