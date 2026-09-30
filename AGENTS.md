# AI agent instructions

This file defines how AI agents should understand and change this repository. Read it before editing, then read `AI_USAGE.md` and every scoped `AGENTS.md` from the repo root down to the folder being changed.

## Sources of Truth and Agent Workflow

Jira is the source of truth for:

- User stories.
- Acceptance criteria.
- Priority.
- Sprint.
- Status.

Confluence is the source of truth for the story's testing specification. Its
test matrix and detailed test cases describe the exact cases used to verify
that the user story passes. Read them alongside Jira acceptance criteria, map
them to automated tests, and identify any gaps; do not assume the Confluence
specification is complete if Jira requires additional behavior.

For Jira-driven implementation, the root orchestrator follows
[.ai/workflow/README.md](.ai/workflow/README.md) and delegates context
acquisition and implementation to [.ai/agents/implementation.md](.ai/agents/implementation.md).
That role file owns the detailed Jira, Confluence, repository-inspection,
branch-reuse/creation, implementation, test, and initial-validation progression.
Keep that procedure in the role contract instead of duplicating it here.

If Jira cannot be accessed, use issue details supplied by the user and record
the limitation in `AI_USAGE.md` and the pull request. If the Confluence test
matrix or cases cannot be found, record what was searched in the runtime
snapshot and `AI_USAGE.md`; continue only if the Jira requirements are
sufficient to implement and validate the ticket.

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

| Path                     | Owns                                                                             | Does Not Own                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `frontend/`              | Frontend and client-facing application.                                          | Backend service logic or shared local integration tooling.                               |
| `backend/`               | Backend service, contracts, persistence logic, and service-level tests.          | Frontend UI or shared local integration tooling.                                         |
| `docker-compose/`        | Docker Compose local integration stack and local setup.                          | Application feature ownership, database asset ownership, or production infrastructure.   |
| `database/`              | Local database initialization assets for the shared local development stack.      | Backend persistence code, application migrations, or production database infrastructure. |
| `.github/workflows/`     | Repository-level GitHub Actions orchestration for security and tests.            | Component-specific test commands or release automation.                                  |
| `docs/`                  | Durable workflow and process documentation.                                      | Dynamic task tracking, implementation source, environment secrets.                       |

## Component Boundaries

Treat every top-level application or service component as a project once it contains real implementation code. Each component must have a clear owner boundary.

When adding a new project, create an `AGENTS.md` inside that project before or alongside implementation work. That file must state:

- What the project owns.
- What the project explicitly does not own.
- Its runtime, framework, and package manager once chosen.
- Its public API, events, queues, database tables, or external integrations if any.
- Its local setup, test, build, and CI entrypoints.
- Which other folders it is allowed to coordinate with, such as `frontend/`, `backend/`, `database/`, or `docker-compose/`.

Example for a new backend service:

```text
events-service/
|-- AGENTS.md
|-- README.md
|-- HANDOVER.md
|-- CHANGELOG.md
|-- scripts/ci/unit-test.sh
`-- ...
```

The service-level `AGENTS.md` should make the boundary explicit. For example, an events service may own event ingestion, event validation, event persistence, and event publishing, but not user authentication, frontend rendering, shared local tooling, or unrelated service schemas.

## Cross-Boundary Changes

Do not silently mix ownership areas. If a change crosses boundaries, name the affected areas and inspect each area's scoped `AGENTS.md` before editing.

Common boundary crossings:

- Frontend calling a backend API: read `frontend/AGENTS.md` and `backend/AGENTS.md`.
- Local integration change: read `docker-compose/AGENTS.md` and `docker-compose/README.md`.
- CI change: read `docs/ci-process.md` and the relevant workflow under `.github/workflows/`.

## AI Usage Tracking

Use `AI_USAGE.md` as the shared ledger for AI-assisted work. This helps Codex, Claude, other AI tools, and human teammates understand what was changed, which assumptions were made, and where conflicts may exist.

Before starting meaningful work:

- Read the latest relevant entries in `AI_USAGE.md`.
- Check whether another AI or teammate recently touched the same files or ownership area.
- Preserve existing work unless the user explicitly asks to replace it.

Before final delivery or pull request handoff:

- Add or update one concise `AI_USAGE.md` entry for the work.
- Use `dd-mm-yyyy - <agent> - <ticket-id-or-branch-name>` headings. Prefer the ticket ID; if it is unavailable, use a branch name recorded in the entry. Use `Unknown` only when neither exists and `General` for other work. After a user-requested ticket archive, leave a concise pointer using `docs/ai-usage-archives/README.md`.
- Include the AI tool/model if known, issue or PR link if available, areas touched, summary, assumptions, checks run, and follow-up/conflict notes.
- Do not include secrets, credentials, private prompts, long chat transcripts, personal data beyond needed attribution, or production data.

## CI Contract

Root GitHub Actions workflows orchestrate CI checks for the monorepo:

- `.github/workflows/security.yml` runs security scanning.
- `.github/workflows/tests.yml` discovers and runs implemented component unit-test entrypoints.

Implemented apps and services own their local unit-test command in:

```text
<component>/scripts/ci/unit-test.sh
```

The root tests workflow should stay generic. Do not hard-code a component's runtime-specific test command into `.github/workflows/tests.yml`; put that command in the component's script.

## Test Organization and Naming

- Keep tests beside the component or module they cover; do not create a root tests tree or Jira-key directories.
- Place frontend component tests beside their component or page as descriptive .test.tsx files. Place backend unit tests beside their module as descriptive .spec.ts files.
- Maintain one behavior-focused suite as later Jira stories change the same module. Keep Jira keys and acceptance-criterion wording inside suites and test names for traceability, rather than duplicating files by story.
- Extend the existing suite for a module or feature when adding coverage for a new ticket or fixing a test. Do not create a new test file for each ticket or acceptance criterion (for example, `events.accept.test.ts`); use the component's established suite name and add descriptive test cases there.
- Vitest discovers matching test/spec filenames within the component. Exclude Playwright browser specs from Vitest.
- Place browser acceptance tests beside their frontend page as .playwright.spec.ts, discovered by Playwright.
- Place database/API integration tests beside the backend module as .e2e-spec.ts, discovered only by the dedicated integration configuration. Shared application smoke tests may remain in the backend test directory.
- Keep fixtures within the owning component, outside production entrypoints. Backend browser harnesses belong in scripts/testing/.
- Put a short plain-English comment immediately above each test case and beside its important setup, action, and assertion sections.
- Use Playwright for real browser workflows; use backend/database runners for validation, authorization, persistence, and concurrency.
- Keep test configuration and CI entrypoints with the owning component. New tests should be discovered without adding Jira-specific patterns.
- Run affected suites before reporting testing complete; identify skipped checks and environment limitations.

## Conflict Resolution

- When syncing dev into a feature branch, use dev's version of files with merge conflicts.
- Replace only the conflicted files. Preserve unrelated local files and folders.
- Report any local scripts or dependencies lost through this resolution; do not silently reintroduce them.

## Issue Workflow

For Jira-driven implementation with independent agent review, follow
[.ai/workflow/README.md](.ai/workflow/README.md). It defines the shared runtime
artifacts, role boundaries, native-runtime adapters, review reconciliation, and
bounded revalidation. For GitHub issue work and the branch, staging, commit, and
pull request lifecycle, follow [docs/ai-issue-workflow.md](docs/ai-issue-workflow.md).

## Branch Workflow

GitHub uses pull requests. If a Jira card, teammate, or older doc says "merge request", create a GitHub pull request.

`dev` is the latest shared branch and the default base for all new work. The branch flow is `work branch -> dev -> main`. When starting new implementation, documentation, test, chore, or refactor work, create a focused branch from the latest `dev` and open the pull request back into `dev`.

| Jira card intent                                                     | Work branch                                                                                                                                             | Pull request target | Purpose                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| New feature, bug fix, refactor, test, or ordinary documentation work | `feature/<ticket_id>-<ticket_name>`, `fix/<ticket_id>-<ticket_name>`, `docs/<ticket_id>-<ticket_name>`, or `chore/<ticket_id>-<ticket_name>` from `dev` | `dev`               | Add normal development work to the latest shared branch.    |
| Urgent fix                                                           | `fix/<ticket_id>-<ticket_name>` or `hotfix/<ticket_id>-<ticket_name>` from `dev`                                                                        | `dev`               | Repair the latest shared branch before promotion to `main`. |

Use the exact Jira ticket id, such as `SPM-155`, and a hyphenated slug of the Jira ticket name so Jira and GitHub can display the connected work clearly. Do not replace the ticket name with a hand-written short summary unless the human requester explicitly asks for that branch name.

## Implementation Rules

- Inspect existing code and scoped guidance before adding files, frameworks, dependencies, or abstractions.
- Keep changes focused and reviewable.
- Preserve user and teammate changes already present in the working tree.
- Add or update tests for changed behavior where meaningful.
- For TypeScript, document exported functions, classes, interfaces, and types with JSDoc. New or materially changed functions and methods should explain their purpose and document inputs with `@param` and results with `@returns` when applicable; document relevant errors with `@throws`. Keep comments accurate and useful instead of restating obvious implementation details.
- Place ticket-specific tests in the component's established test layout and
  identify the Jira key in the test name or nearby test-case comments. Do not
  introduce a parallel root `tests/` tree unless the repository explicitly
  adopts one.
- Update README, HANDOVER, CHANGELOG, and scoped AGENTS files when behavior, ownership, setup, CI, or operational assumptions change.
- Never commit secrets, credentials, tokens, private keys, certificates, or real production data.

## Documentation Rules

- Use `AGENTS.md` for AI agent instructions and ownership boundaries.
- Use `AI_USAGE.md` for AI work traceability, assumptions, checks, and conflict notes across Codex, Claude, and other tools.
- Use `README.md` for human setup, usage, and overview.
- Use `HANDOVER.md` for durable technical context, constraints, risks, and next steps.
- Use `CHANGELOG.md` for notable durable changes.
- Use `.ai/workflow/` for shared agent roles and their cross-platform workflow.
- Use `docs/` for repo-level process documentation such as AI issue workflow and CI process.
- Do not put dynamic task status, sprint logs, or facts already obvious from Git history into durable docs.
