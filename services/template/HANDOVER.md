# Template handover

## Current state

This directory is a reusable service scaffold. It provides documentation, a Dockerfile placeholder, and a baseline CI unit-test entrypoint.

It is not a runnable service. The Dockerfile expects `server.js`, which is absent, and there is no package manifest or implemented runtime. The unit-test script prints examples and fails until a copied service supplies its real test command. The root tests workflow ignores this template directory.

## Adoption notes

- Replace template-specific guidance with component-specific context when creating an implemented project.
- Keep exactly one supported CI unit-test entrypoint wired to the real project unit-test command.
- Use the repository-level `.github/pull_request_template.md` for pull requests.
