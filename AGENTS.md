# AI agent working instructions

## Sources of truth and intake

- Jira owns tasks, requirements, acceptance criteria, backlog, priority, workflow status, and sprint planning. GitHub owns source code, branches, commits, pull requests, CI/CD, and review.
- Before modifying a component, read this file, all applicable scoped `AGENTS.md` files from parent to child, and the relevant Jira issue and acceptance criteria. Then inspect its README, contributor guidance, implementation, tests, and configuration.
- If Jira is inaccessible, use a user-provided issue summary, key, acceptance criteria, and relevant context. Do not invent requirements or ticket keys. Directly requested documentation or maintenance work may use the user's stated scope and validation criteria.
- Treat acceptance criteria as required behavior. Map each to implementation, tests, documentation, or an explicit non-code decision. Identify affected workflows, non-functional requirements, expected evidence, and deployment or migration impact. Ask one focused question if missing or conflicting requirements prevent safe implementation; record safe assumptions in the pull request.

## Repository layout

This checkout is a single GitHub repository containing the project workspace. Run Git operations, checks, commits, and pull requests from the repository root unless a tool explicitly requires a narrower working directory.

| Location | Purpose and entry point |
| --- | --- |
| `apps/` | Front-facing applications; currently the [frontend scaffold](apps/frontend/README.md). App deployments do not use Kubernetes. See [app guidance](apps/AGENTS.md) and [frontend guidance](apps/frontend/AGENTS.md). |
| `services/` | Backend-facing microservices and the project template. Services are deployed through Kubernetes. See [service guidance](services/AGENTS.md) and [template guidance](services/template/AGENTS.md). |
| `platform/` | Deployment strategy and configuration for the whole system: Terraform provisioning, Kubernetes runtime structure, and reusable GitHub Actions guidance. See [platform guidance](platform/AGENTS.md). |
| `platform/terraform/` | Google Cloud infrastructure, IAM, networking, identity, and managed services. Start with its [README](platform/terraform/README.md). |
| `platform/kubernetes/` | Runtime workloads, service accounts, Gateway API routing, and environment overlays. Start with its [README](platform/kubernetes/README.md). |
| `development/local-dev/` | Shared local integration stack with Compose, gateway configuration, database initialization, and storage/messaging emulators. See its [README](development/local-dev/README.md) and [development guidance](development/AGENTS.md). |

## Architecture and ownership

Platform configuration describes the deployment strategy for the whole system: app hosting outside Kubernetes, Google Cloud API Gateway for JWT verification, GKE for private backend services, and Cloud SQL, Pub/Sub, and Cloud Storage. This is the infrastructure design, not proof that all applications, services, or integrations exist.

Terraform owns cloud provisioning. Kubernetes owns backend service runtime manifests and Gateway/HTTPRoute routing. App deployments are front-facing and outside Kubernetes. GitHub Actions workflows in `.github/workflows/` define repository CI behavior. There is no verified workspace-wide build, lint, or test command, and services do not all share a runtime or pipeline.

## Implementation and verification

- Inspect existing patterns before adding files, frameworks, dependencies, or abstractions. Match the component's stack, naming, layout, error handling, logging, and test style; prefer existing helpers.
- Keep changes focused, small, and reviewable. Avoid unrelated rewrites or formatting and preserve other contributors' work.
- Add or update relevant tests for changed behavior: unit tests for isolated logic, integration tests at external boundaries, workflow tests for UI changes, and regression tests for bug fixes. Use documentation checks for documentation-only changes.
- Root GitHub Actions workflows orchestrate CI/CD for the monorepo. Implemented apps and services own their local unit-test command in `<component>/scripts/ci/unit-test.sh`; see [docs/ci-cd-process.md](docs/ci-cd-process.md).
- Never commit secrets, credentials, tokens, certificates, private keys, or production data. Use clearly fake placeholders in examples and review available CI security findings.
- Update human-facing documentation when behavior, setup, configuration, or operational steps change. Keep lasting technical context in project-level `HANDOVER.md` files and track notable changes in project-level `CHANGELOG.md` files.

## Automation resource lifecycle

- Pair creation of disposable automation/test resources with teardown. Record the pre-run state and track resources created by the run: processes, Docker containers, temporary images, volumes, networks, databases, test data, and temporary files. Preserve intended deliverables and pre-existing or shared resources.
- Register cleanup before starting resource creation, using the script's existing exit/finally/test-teardown mechanism. Cover success, failure, and interruption where supported, including partial setup. Cleanup must be safe to repeat and must not hide the original test failure.
- For disposable Docker runs, stopping a container is insufficient: remove the run-owned container and any run-owned temporary volumes, networks, and images. Scope cleanup to recorded resource identities; never use blanket Docker pruning to clean up a task.
- Treat `development/local-dev` as a shared integration environment. Reuse its services and preserve its persistent data and pre-existing running state. Clean up test-owned records and temporary resources, but do not automatically destroy the stack or its volumes after an integration test. Stop or reset the shared environment only when explicitly requested; disclose any services started and left running for integration use.
- Verify teardown after the run and report any remaining resources, why they remain, and any failed cleanup. Do not assume test success proves cleanup or that a CI runner removed externally created resources. If execution is forcibly killed and cleanup cannot run, report or reconcile the recorded resources on recovery.

## Delivery

- Never push directly to `main` or protected branches. Use the Jira key in branch names, commits, and pull request titles where appropriate and available.
- For GitHub issue work, follow [docs/codex-issue-workflow.md](docs/codex-issue-workflow.md): read the ticket, inspect current work, create a branch, implement, test, push, and open a pull request.
- Prefer several logical commits over one large catch-all commit when the work naturally separates into components, such as implementation, tests, documentation, or CI changes. Keep each commit reviewable and avoid splitting changes so finely that the history becomes noisy.
- Use clear commit prefixes where the repository has no stricter convention: `feat:`, `fix:`, `refactor:`, `chore:`, `perf:`, `ci:`, `ops:`, `build:`, `docs:`, `style:`, `revert:`, and `test:`.
- Open a pull request for reviewable repository changes and stop for human review. Use `.github/pull_request_template.md` or a component-level pull request template when present. Never merge automatically unless explicitly instructed by an authorized human.
- Report what changed, acceptance criteria coverage, commands/checks run and results, checks not run and why, and known security, deployment, migration, rollback, or configuration risks. Disclose any publishing or review steps that could not be completed.

## Documentation continuity

- Use scoped `AGENTS.md` files for agent-specific rules. Use `HANDOVER.md` for lasting technical context, known limitations, architecture decisions, migrations, environment requirements, operations, test/setup constraints, and unresolved technical risks.
- Keep `HANDOVER.md` and `CHANGELOG.md` at project or component level only, not shared group or subgroup folders. Create or update them when a project-level change adds useful continuity or should be visible in durable history.
- Keep dynamic work tracking in Jira. Do not copy Jira backlog, sprint information, assignees, ticket status, daily progress logs, ticket-completion history, or facts already obvious from Git history into repository guidance.
- Treat local guidance as potentially stale if it conflicts with code, tests, configuration, Jira acceptance criteria, or parent agent rules. Verify the discrepancy against those sources; do not silently convert stale context into a requirement.
- READMEs cover overview/setup/usage/operations, and contributor guides cover human workflow. Link to authoritative guidance rather than copying it.
- Keep project changelogs focused on durable change history. Do not use handovers or changelogs as live Jira status mirrors or daily progress logs.
