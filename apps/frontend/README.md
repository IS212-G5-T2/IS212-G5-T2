# Frontend

This repository is the client application scaffold for the workspace. It currently contains documentation and GitLab security pipeline configuration; application source and setup/test/build commands have not been added.

## Development

Start with the [workspace operating guide](../../INSTRUCTIONS.md) for repository layout and the Jira/GitLab workflow. Use a feature branch and submit a merge request for human review.

Coding agents follow the [global policy](../../AGENTS.md), [app rules](../AGENTS.md), and [frontend-specific rules](AGENTS.md). Parent and sibling links require the shared workspace layout and do not resolve in an isolated clone or GitLab file view; see the workspace guide for the shared-document distribution limitation.

## Checks

[.gitlab-ci.yml](.gitlab-ci.yml) includes GitLab SAST and Secret Detection templates. No application test, lint, build, or deployment command is configured. Add actual setup and usage instructions here when the application implementation establishes them.
