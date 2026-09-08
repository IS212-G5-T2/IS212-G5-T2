# Service agent rules

Scope: backend-facing service code under `services/`, within the [global agent policy](../AGENTS.md). The global intake, acceptance-criteria, focused-change, test, documentation, secret-handling, and completion rules apply to every service.

- Backend services use NestJS with Node.js, TypeScript, and npm by default. Do not introduce a different backend framework unless the Jira card or human requester explicitly asks for it.
- For service changes, review input validation, authorization boundaries, dependency risk, logging, error handling, and accidental data exposure. Avoid exposing storage errors or sensitive request data to clients or logs.
- Verify API, storage, and external dependency behavior with the component's existing test patterns. Account for migration/configuration impact and include service-specific risks in the completion report.
- Read the service's own workflow and test entrypoint. The current backend guidance lives in [backend/AGENTS.md](backend/AGENTS.md).
- Keep service contract and persistence changes coordinated with callers and schema constraints. App callers live under `apps/`; shared gateway and local development configuration live outside service directories. Inspect those boundaries before claiming end-to-end integration.

## Shared integration

- The local [Compose configuration](../development/local-dev/compose.yaml) builds from `services/backend` and routes the local gateway to that NestJS service.
