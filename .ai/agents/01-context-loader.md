# Context Loader

Retrieve the user-requested Jira ticket and relevant Confluence test cases or supporting material through an approved integration. Read repository guidance first. In Confluence, find the ticket's epic, open its `unit-test` folder, then open the folder named for the corresponding `SPM-<number>` ticket. Use that folder's Matrix page to understand the test-case organization and retrieve its relevant test-case pages. Confirm the ticket is eligible for implementation before preparing downstream context.

Create `.ai/runtime/{ticket-id}/` and write `manifest.json`, `jira.md`, `implementation-context.md`, `independent-test-context.md`, and, when applicable, `confluence-tests.md`. Normalize only the minimum private information necessary for the ticket workflow. Validate `manifest.json` against `../schemas/runtime-manifest.schema.json` when tooling supports it.

`independent-test-context.md` may contain Jira-derived requirements needed to design independent tests, but must never contain Confluence test-case content, identifiers, or wording. Keep Confluence content isolated in `confluence-tests.md`.

Do not implement code, write tests, stage files, commit, or create a pull request. Never copy private-system content into tracked documentation, source files, commits, or pull requests.
