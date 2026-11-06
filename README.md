# IS212-G5-T2

Link to Github repo: https://github.com/IS212-G5-T2/IS212-G5-T2

Student Project Management workspace for IS212 G5 T2. This repository documents the shared project context, workspace setup, architecture direction, contributor expectations, and the team's Jira/GitHub workflow.

This repository contains the project code, local development setup, and GitHub Actions workflows in one GitHub repository. Deployment, Terraform, and Kubernetes platform configuration have been removed.

```text
.
|-- .github/              # GitHub metadata, pull request template, and workflows
|-- .codex/               # Native project agent definitions and concurrency setting
|-- .claude/              # Native Claude Code Markdown subagent definitions
|-- .agents/              # Repository skills for on-demand agent workflows
|-- ai/agents/            # One shared Markdown playbook per agent case
|-- ai/docs/              # Agent workflow and invocation examples
|-- ai/runtime/           # Ignored local agent reports and handoffs
|-- backend/              # NestJS backend service
|-- database/             # Local database image and initialization assets
|-- docs/                 # Project workflow documentation
|-- docker-compose/       # Local Docker Compose integration stack
|-- frontend/             # React/Vite frontend application
|-- README.md             # This file
|-- AGENTS.md             # Agent working instructions
|-- AI_USAGE.md           # Current AI-assisted work log
|-- CLAUDE.md             # Claude Code project instructions
`-- CONTEXT.md            # Shared project context
```

## Codex development workflow

The primary Codex or Claude Code session acts as the Orchestrator. Each role has a separate Markdown playbook in [ai/agents/](ai/agents/). Codex loads project agents from `.codex/agents/*.toml`; Claude Code loads project agents from `.claude/agents/*.md` with YAML frontmatter. After implementation, the Orchestrator accepts Test Code Review before starting Requirement Review and Code Quality Review. Those two reviews may run concurrently on the same stable snapshot; both results are needed before completion or corrections. The Orchestrator routes accepted findings to Implementation and reruns invalidated checks and gates for up to three cycles. See [the agent contract](ai/docs/sub-agents.md) and [an example request](ai/docs/example.md).

For Jira work, provide an issue key and access to the authenticated Jira connector; provide relevant Confluence page links or access when specifications live there. Missing material requirements pause implementation. Temporary reports belong in ignored `ai/runtime/`; persistent instructions remain in `ai/agents/`, `ai/docs/`, and the agent and skill directories. The Orchestrator reports skipped reviews, unavailable integrations, and unresolved findings. Repository rules still require human approval before a commit, push, or pull request.

## Project Context

The project is structured as a Student Project Management workspace. The intended application architecture separates the client, backend services, local development environment, CI workflows, and process documentation into clear top-level areas.

At a high level:

- `frontend` is the React/Vite frontend application.
- `backend` is the NestJS backend service.
- `docker-compose` owns the Docker Compose environment for local integration testing.
- `database` owns the local PostgreSQL image and initialization assets used by Compose.
- `.github/workflows` owns the GitHub Actions security, test, pre-delivery and delivery workflows.
- `docs` owns project workflow documentation.

No deployment target is defined in this repository. `dev` is the latest shared branch; create new work branches from the latest `dev` and open pull requests back into `dev`.

## Setup

### Running The Delivery Bundle

The Delivery workflow attaches a `connectsphere-<short-sha>` artifact to every run on `main`. Download it from the **Artifacts** section of the run and extract it once; `BUILD-INFO.txt` at the top records which commit it was built from.

The bundle carries the same sources the Compose stack builds from, so the quickest path needs no clone and no GitHub access. You need Docker Desktop or Docker Engine with Docker Compose:

```sh
cd connectsphere-<short-sha>/docker-compose
cp .env.example .env
docker compose up --build
```

Then open `http://localhost:5173`, and check the backend with `curl http://localhost:8080/healthz`.

To run it without Docker, use the prebuilt output the bundle already contains. This needs a PostgreSQL 16 of your own, initialised from `database/postgresql/init/` (which is the complete schema):

```sh
cd connectsphere-<short-sha>/backend
npm ci --omit=dev
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<database> \
  FRONTEND_ORIGIN=http://localhost:5173 \
  PORT=8080 \
  node dist/main
```

Serve `frontend/dist/` with any static web server. `VITE_API_BASE_URL` is baked in at build time, so point the backend at the origin the frontend was built for, or rebuild the frontend to change it.

`node_modules` is not in the bundle: both components reinstall from their committed lockfiles. Local `.env` files are excluded, which is why the Compose path starts by copying `.env.example`.

### How To Actually Run The Whole Project

Run commands from the repository root:

```sh
cd IS212-G5-T2
```

Make sure you have:

- Git installed.
- Docker Desktop or Docker Engine with Docker Compose.
- Access to this GitHub repository.
- GitHub authentication configured locally through SSH and/or HTTPS credentials.
- Optional but recommended: GitHub CLI (`gh`) authenticated against `github.com`.

To run the local development stack, move into the Compose environment:

```sh
cd docker-compose
cp .env.example .env
docker compose up --build
```

Check the backend:

```sh
curl http://localhost:8080/healthz
```

Common local URLs:

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:8080` |
| Backend health check | `http://localhost:8080/healthz` |
| PostgreSQL | `localhost:5432` |

Stop the local stack without deleting data:

```sh
docker compose down
```

Reset the local database and frontend dependency volumes only when a full data reset is intended:

```sh
docker compose down -v
```

The local Compose stack builds `../frontend` for the frontend container, `../backend` for the backend container, and `../database/postgresql` for the local PostgreSQL image.

### System Architecture

The system is organized around clear ownership boundaries:

| Layer | Repository | Responsibility |
| --- | --- | --- |
| Project coordination | Repository root and `docs` | README, AI usage notes, agent instructions, project workflow documentation |
| Frontend | `frontend` | React/Vite user-facing client application, frontend package scripts, and frontend Dockerfile |
| Backend service | `backend` | NestJS backend service code, service-specific tests, service Dockerfile, and service CI entrypoint |
| Database assets | `database` | Local PostgreSQL image and initialization assets used by Docker Compose |
| Local integration | `docker-compose` | Docker Compose frontend/backend runtime targets and PostgreSQL |
| CI/CD | `.github/workflows` | GitHub Actions workflows for security, tests, and the pre-delivery and delivery bundles |

The local development stack supports integration work without deployment infrastructure:

| Local concern | Local implementation |
| --- | --- |
| Compose network | `spm` |
| Frontend container | `frontend` container at `http://localhost:5173` |
| Backend container | `backend` container at `http://localhost:8080` |
| PostgreSQL | PostgreSQL at `localhost:5432` |
| Runtime configuration | `.env` file |
| Service readiness | Docker Compose health checks |

### C4 Diagrams

#### Level 1 — System Context

```mermaid
flowchart TB
    ATT(["👤 Attendee<br/>[Person]<br/>Registers for events"])
    ORG(["👤 Event Organiser<br/>[Person]<br/>Creates event requests"])
    COO(["👤 Event Coordinator<br/>[Person]<br/>Plans events"])
    LEAD(["👤 Coordinator Lead<br/>[Person]<br/>Assigns coordinators"])
    VEN(["👤 Venue Staff<br/>[Person]<br/>Manages venues"])
    TECH(["👤 Technical Support Staff<br/>[Person]<br/>Manages equipment"])
    SAFE(["👤 Safety Officer<br/>[Person]<br/>Reviews safety checks"])

    subgraph CS["ConnectSphere"]
        SYS["ConnectSphere<br/>[Software System]<br/>Event-management system for planning,<br/>resources and attendance"]
    end

    ATT -->|Uses| SYS
    ORG -->|Submits requests| SYS
    COO -->|Plans events| SYS
    LEAD -->|Assigns work| SYS
    VEN -->|Updates venue information| SYS
    TECH -->|Updates equipment information| SYS
    SAFE -->|Reviews safety arrangements| SYS

    classDef person fill:#10467D,color:#FFFFFF,stroke:#08335D,stroke-width:2px;
    classDef system fill:#249FD1,color:#FFFFFF,stroke:#0C6597,stroke-width:2px;

    class ATT,ORG,COO,LEAD,VEN,TECH,SAFE person;
    class SYS system;
```

#### Level 2 — Containers

```mermaid
flowchart TB
    ATT(["👤 Attendee<br/>[Person]"])
    ORG(["👤 Event Organiser<br/>[Person]"])
    COO(["👤 Event Coordinator<br/>[Person]"])
    LEAD(["👤 Coordinator Lead<br/>[Person]"])
    VEN(["👤 Venue Staff<br/>[Person]"])
    TECH(["👤 Technical Support Staff<br/>[Person]"])
    SAFE(["👤 Safety Officer<br/>[Person]"])

    subgraph CS["ConnectSphere"]
        direction LR

        WEB["Web Application<br/>[Container: React / Vite]<br/>Role-aware single-page application"]
        API["Backend API<br/>[Container: NestJS]<br/>REST API, authentication,<br/>business rules and reports"]
        DB[("PostgreSQL<br/>[Container: PostgreSQL 16]<br/>Persistent application data")]

        WEB -->|"REST / JSON"| API
        API -->|"SQL"| DB
    end

    ATT -->|"HTTPS"| WEB
    ORG -->|"HTTPS"| WEB
    COO -->|"HTTPS"| WEB
    LEAD -->|"HTTPS"| WEB
    VEN -->|"HTTPS"| WEB
    TECH -->|"HTTPS"| WEB
    SAFE -->|"HTTPS"| WEB

    classDef person fill:#10467D,color:#FFFFFF,stroke:#08335D,stroke-width:2px;
    classDef container fill:#249FD1,color:#FFFFFF,stroke:#0C6597,stroke-width:2px;
    classDef database fill:#287CB7,color:#FFFFFF,stroke:#0C6597,stroke-width:2px;

    class ATT,ORG,COO,LEAD,VEN,TECH,SAFE person;
    class WEB,API container;
    class DB database;
```

#### Level 3 — Components (Backend API)

```mermaid
flowchart TB
    WEB["Web Application<br/>[External Container]<br/>React client calls /api/*"]

    subgraph API["Backend API - NestJS"]
        direction TB

        AUTH["Authentication<br/>[Component]<br/>Login, logout and sessions"]
        EVENTS["Event Lifecycle<br/>[Component]<br/>Drafts, planning, review,<br/>status and cancellation"]
        VENUES["Venue and Booking<br/>[Component]<br/>Venues, availability,<br/>booking requests and holds"]
        EQUIP["Equipment<br/>[Component]<br/>Inventory, requests<br/>and reservations"]
        REG["Registrations<br/>[Component]<br/>Registration, withdrawal,<br/>waitlist and PDF/CSV reports"]
        COORD["Coordination and Safety<br/>[Component]<br/>Assignment, availability<br/>and safety decisions"]
        CLARIFY["Clarifications and Notifications<br/>[Component]"]
        DATA["Data Access<br/>[Component]<br/>Database service and repositories"]
    end

    DB[("PostgreSQL<br/>[Database]<br/>Persistent application data")]

    WEB -->|"REST / JSON"| AUTH
    WEB -->|"REST / JSON"| EVENTS
    WEB -->|"REST / JSON"| VENUES
    WEB -->|"REST / JSON"| EQUIP
    WEB -->|"REST / JSON"| REG
    WEB -->|"REST / JSON"| COORD
    WEB -->|"REST / JSON"| CLARIFY

    AUTH --> DATA
    EVENTS --> DATA
    VENUES --> DATA
    EQUIP --> DATA
    REG --> DATA
    COORD --> DATA
    CLARIFY --> DATA
    DATA -->|"SQL"| DB

    classDef external fill:#6D8195,color:#FFFFFF,stroke:#455A70,stroke-width:2px;
    classDef component fill:#249FD1,color:#FFFFFF,stroke:#0C6597,stroke-width:2px;
    classDef dataAccess fill:#287CB7,color:#FFFFFF,stroke:#0C6597,stroke-width:2px;
    classDef database fill:#287CB7,color:#FFFFFF,stroke:#0C6597,stroke-width:2px;

    class WEB external;
    class AUTH,EVENTS,VENUES,EQUIP,REG,COORD,CLARIFY component;
    class DATA dataAccess;
    class DB database;
```

## Developers

Current contributors visible in this repository history:

- Wei Rong
- Wei Zhi
- Kishore
- Taneisha
- Ei Chaw

Team members should keep GitHub author names, Jira assignees, and pull request reviewers aligned so ownership is visible across Jira, GitHub, and sprint review evidence.

## Jira Workflow Mentality

### Scrum Process Using Jira

The team uses Jira as the source of truth for Scrum planning and delivery tracking. Work should begin in Jira before it becomes code.

Our Jira mentality:

- Epics describe larger product or platform outcomes.
- User stories describe user-facing value and should include acceptance criteria.
- Tasks break implementation work into manageable technical steps.
- Bugs capture defects, regressions, or failed acceptance criteria.
- Sprint boards show current work, ownership, blockers, and review status.
- Every branch, commit, and pull request should reference the Jira issue key when one exists.
- Acceptance criteria should drive implementation, testing, and pull request evidence.
- Work is not considered done just because code is pushed; it is done when the Jira item, code review, CI checks, and acceptance criteria are all satisfied.

A typical Scrum flow:

1. Product or platform work is captured as an epic, story, task, or bug in Jira.
2. The team refines the issue until scope and acceptance criteria are clear.
3. The issue is pulled into a sprint and assigned.
4. A developer creates a branch using the Jira key.
5. The developer implements the work, updates tests and documentation, and opens a GitHub pull request.
6. CI evidence, review feedback, and acceptance criteria are checked before merging.
7. Jira automation reflects branch creation, pull request review, and post-merge testing status.

### Branch Flow: Work Branch To dev

The team uses `dev` as the latest shared branch:

```text
feature/fix/docs branch
        |
        v
dev
```

Recommended branch names:

```text
feature/<ticket_id>-<ticket_name>
fix/<ticket_id>-<ticket_name>
docs/<ticket_id>-<ticket_name>
chore/<ticket_id>-<ticket_name>
```

Use the Jira ticket id, such as `SPM-155`, followed by a hyphenated slug of the Jira ticket name. This keeps the connected Jira and GitHub work easy to recognize from either tool.

#### 1. Feature, Fix, Docs, Or Chore Branch

This is where individual development happens.

- Created from the latest `dev`.
- Named with the Jira key whenever available.
- Contains focused commits for one Jira issue or one tightly related change.
- Developer runs relevant local checks before opening a pull request.
- Pull request explains the change, links the Jira issue, lists tests, and calls out risks or follow-up work.

#### 2. dev

`dev` is the latest shared branch for the project.

- Feature branches merge here after review.
- GitHub Actions should run unit tests on `dev`.
- GitHub Actions should catch security and unit-test problems on `dev`.
- The team resolves merge conflicts and cross-service incompatibilities here.
- Bugs found on `dev` should be fixed from a new branch based on the latest `dev`.
- Jira issues should only be marked done when the implementation, review, CI, and acceptance criteria are complete.

The goal of this workflow is to keep Scrum planning, code review, and CI evidence connected. Jira explains why the work exists; GitHub proves what changed; CI shows whether the change is safe to merge into `dev`.
