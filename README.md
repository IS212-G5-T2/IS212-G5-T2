# IS212-G5-T2

Student Project Management platform workspace for IS212 G5 T2.

This repository now contains the project code, infrastructure configuration, local development setup, and GitHub Actions workflows in one GitHub repository.

## Layout

```text
.
|-- .github/              # GitHub metadata, pull request template, and workflows
|-- apps/                 # Front-facing applications
|-- development/          # Local development and integration tooling
|-- docs/                 # Project workflow documentation
|-- platform/             # Terraform and Kubernetes platform configuration
|-- services/             # Backend-facing services and service template
|-- AGENTS.md             # Agent working instructions
|-- AI_USAGE.md           # AI-assisted work log
`-- opencode.json
```

## Current State

- `apps/frontend` is a frontend scaffold with documentation but no implemented client application yet.
- `services/template` is a reusable service scaffold with baseline documentation, Dockerfile placeholder, and CI unit-test entrypoint.
- `development/local-dev` contains the shared Docker Compose integration environment.
- `platform/terraform` contains Google Cloud infrastructure configuration.
- `platform/kubernetes` contains baseline Kubernetes manifests and overlays.

## CI

GitHub Actions workflows live in `.github/workflows`:

- `security.yml`
- `tests.yml`
- `terraform.yml`
- `deployment.yml`

## Workflow

Use Jira for Scrum tracking and GitHub for source control, pull requests, code review, and CI evidence. Create feature branches from `main`, run relevant checks locally, and open a pull request for human review.

For AI-assisted issue work, see [docs/ai-issue-workflow.md](docs/ai-issue-workflow.md).

For the repository CI/CD structure, see [docs/ci-cd-process.md](docs/ci-cd-process.md).
