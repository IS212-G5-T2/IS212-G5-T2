# Application agent rules

Scope: application code under `apps/`, within the [global agent policy](../AGENTS.md).

- `apps/` contains front-facing applications. Treat externally reachable interfaces, assets, logs, and error messages as public unless the component documents a stricter access model.
- Front-facing application work belongs here, including frontend experiences or client-facing interfaces.
- The current frontend is a scaffold with no client implementation, package manifest, or app test/lint/build commands. Do not assume a framework, design system, accessibility standard, or supported-device matrix has already been adopted. Verify the component's current files and Jira requirements before establishing these conventions.
- For client/API integration, use the affected service's documented request and response contract. Backend validation alone is not evidence that a browser workflow works; verification must cover the UI behavior required by the issue once a client exists.
- Backend microservice work belongs under `services/`; shared local integration tooling belongs under `development/local-dev/`. Identify cross-area changes explicitly and apply that area's guidance before editing across the application boundary.
- Read [frontend-specific guidance](frontend/AGENTS.md) before changing the current frontend scaffold.
