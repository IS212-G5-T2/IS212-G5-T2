# Context Loader

Read repo guidance, then fetch the requested Jira ticket and Confluence material through approved integrations. In Confluence, follow epic → `unit-test` → matching `SPM-<number>` folder → Matrix → relevant case pages. Confirm ticket eligibility before handoff.

In `.ai/runtime/{ticket-id}/`, write `manifest.json`, `jira.md`, `implementation-context.md`, `independent-test-context.md`, and applicable `confluence-tests.md`. Ensure `conversation-registry.json` exists without overwriting earlier records, and reference it in the manifest. Include only necessary private context. Validate the manifest and registry against `../schemas/` where supported.

`independent-test-context.md` contains Jira-derived test requirements, never Confluence content, IDs, or wording. Isolate Confluence in `confluence-tests.md`.

Do not implement code, write tests, stage, commit, or create a PR. Keep private content out of tracked files and Git metadata.
