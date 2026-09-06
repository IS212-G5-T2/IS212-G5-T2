# Template agent rules

Read the [global policy](../../AGENTS.md), [service rules](../AGENTS.md), and [handover](HANDOVER.md).

## Scaffold boundaries

This directory provides documentation, a Dockerfile placeholder, and a baseline CI unit-test entrypoint for new services. It is not a runnable service: the [Dockerfile](Dockerfile) expects `server.js`, which is absent, and there is no package manifest or implemented runtime.

The [unit-test entrypoint](scripts/ci/unit-test.sh) prints examples and exits with failure until a copied service supplies its actual test command. Its example commands are suggestions, not configured checks. The root tests workflow ignores this template directory.

- Treat this directory as a reusable scaffold. Keep its [required file list](README.md#required-files) consistent when changing the template contract.
- Do not report the example test commands or Dockerfile as a working application. The test entrypoint is deliberately unconfigured and the Dockerfile's `server.js` is absent.
- When configuring tests as part of template adoption, keep one CI unit-test entrypoint at `scripts/ci/unit-test.sh` as required by the [tests workflow](../../.github/workflows/tests.yml). Put the adopted component's verified unit-test command or run path there, whether the project uses Python unit tests, Node.js tests, Jest, or another unit-test runner.
- Replace template-specific agent content with real component context when adopting the template. Use scoped app guidance instead of service guidance if the resulting project is a client application.
- Keep [HANDOVER.md](HANDOVER.md) and [CHANGELOG.md](CHANGELOG.md) present and current whenever the template is touched.

## Pipeline and adoption

- The [tests workflow](../../.github/workflows/tests.yml) discovers implemented app and service unit-test entrypoints on `integration`, `staging`, pull requests, and manual dispatch.
- The [security workflow](../../.github/workflows/security.yml) runs CodeQL and secret scanning on `integration`, pull requests, and manual dispatch.
- The [deployment workflow](../../.github/workflows/deployment.yml) currently only prints a placeholder on `main`. It does not run Terraform, Kubernetes, Artifact Registry, or GKE rollout commands.
- One shell unit-test entrypoint is required when a copied service becomes implemented.
- Pull requests should use the repository-level [pull request template](../../.github/pull_request_template.md).
