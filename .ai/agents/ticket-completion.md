# Ticket Completion Archive

Trigger only when the user explicitly asks to complete/archive a ticket's
AI_USAGE history, such as “archive completed ticket SPM-50.” The explicit
request authorizes moving that ticket's ledger section to the archive. This is
a focused bookkeeping task, not a Jira status update or a code review.

1. Read `AI_USAGE.md` and locate the exact `## {ticket_id}` section. Do not
   search Jira, Confluence, GitHub, or unrelated repository history.
2. Move the complete ticket section, including every dated entry, to
   `docs/ai-usage-archives/{ticket_id}.md`. Add `{ticket_id}` to each dated
   heading as `dd-mm-yyyy - <agent> - {ticket_id}`; preserve entry bodies. If
   the archive file already exists, add only source entries that are not
   already present; never overwrite existing archived history.
3. Remove the moved section from `AI_USAGE.md` and add one short pointer under
   `Archived ticket pointers`, grouped under a
   `dd-mm-yyyy - <agent> - {ticket_id}` heading. Use this sentence structure:
   `<user> had <SPM-id> (<issue>).
   <area summary>. [Archive](docs/ai-usage-archives/{ticket_id}.md)`. Keep it
   concise and do not repeat the archived history. Do not alter other ticket
   sections or the `General` section.
4. If the ticket section is absent, or it is unclear which entries belong to
   the key, make no changes and report the issue.

Do not alter code, mark Jira Done, edit Jira/Confluence, or perform any GitHub
actions. Report the archive path and the number of entries moved.
