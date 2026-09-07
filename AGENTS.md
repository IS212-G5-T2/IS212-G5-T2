# AI agent instructions

This file defines how AI agents should understand and change this repository. Read it before editing, then read `AI_USAGE.md` and every scoped `AGENTS.md` from the repo root down to the folder being changed.

## Operating Flow

Jira is the source of truth for:

- User stories.
- Acceptance criteria.
- Priority.
- Sprint.
- Status.

When Jira context is needed, use the available Atlassian/Jira MCP or connector if one is available. If Jira cannot be accessed, use the issue details supplied by the user and record the limitation in `AI_USAGE.md` and the pull request.

When given a Jira key, the coding agent must follow this progression:

1. Fetch the Jira work item.
2. Read the complete summary, description, user story, acceptance criteria, relevant comments, priority, and status.
3. Do not implement work unless the Jira status is `To Do` or `In Progress`.
4. Inspect the GitHub repository before making changes, including `AI_USAGE.md` and the relevant scoped `AGENTS.md` files.
5. Check for an existing branch or pull request associated with the Jira key.
6. Reuse existing development work when present.
7. When starting new work, create a branch containing the Jira key.
8. Implement all acceptance criteria.
9. Add or modify tests appropriate to each acceptance criterion.
10. Stage completed changes for human review.
11. Do not commit, push, or create a pull request until the human explicitly says to proceed with the commit.
12. After explicit commit approval, reference the Jira key in commits.
13. After explicit commit approval, push and create a pull request whose title contains the Jira key.
14. Include an implementation summary, acceptance-criteria checklist, and testing notes in the pull request.
15. Do not duplicate the Jira story into a GitHub Issue.
16. Do not mark the Jira work item `Done`.
17. Treat Jira automation as responsible for branch, pull request, and merge status transitions.
18. If review requests changes, continue work on the existing branch and pull request.
19. Before declaring work ready, compare the implementation against every Jira acceptance criterion again.

GitHub owns:

- Branches.
- Code.
- Commits.
- Pull requests.
- CI/tests.

Jira automation owns these status transitions:

- Branch created -> `In Progress`.
- Pull request created -> `In Review`.
- Pull request merged -> `Testing`.

## Repository Shape

This is one GitHub repository. Run Git commands, branch creation, commits, pushes, and pull requests from the repository root unless a tool explicitly requires a narrower working directory.

| Path | Owns | Does Not Own |
| --- | --- | --- |
| `apps/` | Frontend and client-facing applications. | Backend service logic, cloud infrastructure, Kubernetes runtime manifests. |
| `services/` | Backend services, service contracts, persistence logic, service-level tests, and the service template. | Frontend UI, shared cloud provisioning, shared Kubernetes platform resources. |
| `platform/terraform/` | Google Cloud provisioning, IAM, networking, managed services, API Gateway, GKE cluster creation, and Terraform outputs. | Application runtime code, service business logic, Kubernetes workload rollout. |
| `platform/kubernetes/` | Kubernetes namespaces, service accounts, workload manifests, Gateway API routing, network policy, autoscaling, and overlays. | Terraform provisioning, application source code, service business logic. |
| `development/local-dev/` | Docker Compose local integration stack, local gateway, emulator setup, and local database initialization. | Production infrastructure, production deployment, application feature ownership. |
| `.github/workflows/` | Repository-level GitHub Actions orchestration for security, tests, Terraform, and deployment. | Component-specific test commands or application implementation details. |
| `docs/` | Durable workflow and process documentation. | Dynamic task tracking, implementation source, environment secrets. |

## Component Boundaries

Treat every direct child under `apps/` and `services/` as a component or project once it contains real implementation code. Each component must have a clear owner boundary.

When adding a new project, such as `services/events-service`, create an `AGENTS.md` inside that project before or alongside implementation work. That file must state:

- What the project owns.
- What the project explicitly does not own.
- Its runtime, framework, and package manager once chosen.
- Its public API, events, queues, database tables, or external integrations if any.
- Its local setup, test, build, and CI entrypoints.
- Which other folders it is allowed to coordinate with, such as `apps/`, `platform/kubernetes/`, or `development/local-dev/`.

Example for a new backend service:

```text
services/events-service/
|-- AGENTS.md
|-- README.md
|-- HANDOVER.md
|-- CHANGELOG.md
|-- scripts/ci/unit-test.sh
`-- ...
```

The service-level `AGENTS.md` should make the boundary explicit. For example, an events service may own event ingestion, event validation, event persistence, and event publishing, but not user authentication, frontend rendering, Terraform project provisioning, or unrelated service schemas.

## Cross-Boundary Changes

Do not silently mix ownership areas. If a change crosses boundaries, name the affected areas and inspect each area's scoped `AGENTS.md` before editing.

Common boundary crossings:

- Frontend calling a backend API: read `apps/AGENTS.md`, the app's `AGENTS.md`, `services/AGENTS.md`, and the target service's `AGENTS.md`.
- Service deployment change: read the service's `AGENTS.md`, `platform/kubernetes/AGENTS.md` if present, and `platform/AGENTS.md`.
- Cloud resource change: read `platform/AGENTS.md` and `platform/terraform/README.md`.
- Local integration change: read `development/AGENTS.md` and `development/local-dev/README.md`.
- CI/CD change: read `docs/ci-cd-process.md` and the relevant workflow under `.github/workflows/`.

## AI Usage Tracking

Use `AI_USAGE.md` as the shared ledger for AI-assisted work. This helps Codex, Claude, other AI tools, and human teammates understand what was changed, which assumptions were made, and where conflicts may exist.

Before starting meaningful work:

- Read the latest relevant entries in `AI_USAGE.md`.
- Check whether another AI or teammate recently touched the same files or ownership area.
- Preserve existing work unless the user explicitly asks to replace it.

Before final delivery or pull request handoff:

- Add or update one concise `AI_USAGE.md` entry for the work.
- Include the AI tool/model if known, issue or PR link if available, areas touched, summary, assumptions, checks run, and follow-up/conflict notes.
- Do not include secrets, credentials, private prompts, long chat transcripts, personal data beyond needed attribution, or production data.

## CI/CD Contract

Root GitHub Actions workflows orchestrate CI/CD for the monorepo:

- `.github/workflows/branch-flow.yml` verifies promotion pull requests use the correct source branch.
- `.github/workflows/security.yml` runs security scanning.
- `.github/workflows/tests.yml` discovers and runs implemented component unit-test entrypoints.
- `.github/workflows/terraform.yml` owns Terraform validation, planning, apply, and destroy.
- `.github/workflows/deployment.yml` owns application and service deployment steps.

Implemented apps and services own their local unit-test command in:

```text
<component>/scripts/ci/unit-test.sh
```

The root tests workflow should stay generic. Do not hard-code a component's runtime-specific test command into `.github/workflows/tests.yml`; put that command in the component's script.

## Issue Workflow

For GitHub issue work, follow [docs/ai-issue-workflow.md](docs/ai-issue-workflow.md):

```text
fetch Jira ticket -> read story and AC -> inspect GitHub work -> reuse or create branch -> implement AC -> test AC -> update AI_USAGE -> stage for review -> wait for explicit commit approval -> commit and push -> open PR -> re-check AC -> report done
```

Jira remains the source of truth for Scrum planning and acceptance criteria when linked or provided. GitHub owns branches, commits, pull requests, CI/CD, and code review.

## Branch Progression

GitHub uses pull requests. If a Jira card, teammate, or older doc says "merge request", create a GitHub pull request.

Choose the branch flow from the Jira card intent:

| Jira card intent | Work branch | Pull request target | Purpose |
| --- | --- | --- | --- |
| New feature, bug fix, refactor, test, or ordinary documentation work | `feature/<issue>-<short-name>`, `fix/<issue>-<short-name>`, `docs/<issue>-<short-name>`, or `chore/<issue>-<short-name>` from `integration` | `integration` | Add normal development work into the integration branch. |
| Release preparation, QA hardening, or "move integration to staging/release" | `release/<issue>-<short-name>` from `integration`, or direct promotion PR from `integration` | `staging` by default; `release/*` only if the team creates an explicit release branch | Promote integrated work for staging validation and release preparation. |
| Deployment, production release, or "move staging to deployment/production/main" | `deploy/<issue>-<short-name>` from `staging`, or direct promotion PR from `staging` | `main` | Promote staged work for production deployment. |
| Hotfix for production | `hotfix/<issue>-<short-name>` from `main` | `main`, then back-merge/cherry-pick to `integration` and `staging` if needed | Repair production while keeping lower branches aligned. |

The branch-flow CI check must pass for promotion pull requests:

- Pull requests targeting `main` must use `staging` as the source branch.
- Pull requests targeting `staging` must use `integration` as the source branch.

Do not guess promotion intent. If the Jira card is ambiguous, infer from wording such as "ready for staging", "release preparation", "deploy", "production", or "go live"; otherwise ask one focused question. Do not implement a Jira card whose status is not `To Do` or `In Progress`; report the status mismatch instead.

For normal implementation cards, do not target `main` directly. Open the pull request into `integration`.

For release-preparation cards, do not add unrelated feature work. The expected change is usually a promotion pull request from `integration` to `staging`, plus release notes or small stabilization fixes if the card asks for them. If the team later introduces a dedicated `release/*` branch, use that branch only when the Jira card or human requester explicitly names it.

For deployment cards, inspect staging status, deployment notes, CI results, and environment risks before opening a pull request from `staging` to `main`. Treat `main` as the production/deployment branch for this repo unless a human explicitly defines a separate deployment branch. Deployment workflow changes belong in `.github/workflows/deployment.yml`; Terraform environment changes belong in `.github/workflows/terraform.yml` and `platform/terraform/`.

## Implementation Rules

- Inspect existing code and scoped guidance before adding files, frameworks, dependencies, or abstractions.
- Keep changes focused and reviewable.
- Preserve user and teammate changes already present in the working tree.
- Add or update tests for changed behavior where meaningful.
- Update README, HANDOVER, CHANGELOG, and scoped AGENTS files when behavior, ownership, setup, CI, deployment, or operational assumptions change.
- Never commit secrets, credentials, tokens, private keys, certificates, real production data, Terraform state, or real `.tfvars` files.

## Documentation Rules

- Use `AGENTS.md` for AI agent instructions and ownership boundaries.
- Use `AI_USAGE.md` for AI work traceability, assumptions, checks, and conflict notes across Codex, Claude, and other tools.
- Use `README.md` for human setup, usage, and overview.
- Use `HANDOVER.md` for durable technical context, constraints, risks, and next steps.
- Use `CHANGELOG.md` for notable durable changes.
- Use `docs/` for repo-level process documentation such as AI issue workflow and CI/CD process.
- Do not put dynamic task status, sprint logs, or facts already obvious from Git history into durable docs.
