# Service agent rules

Scope: backend-facing service code under `services/`, within the [global agent policy](../AGENTS.md). The global intake, acceptance-criteria, focused-change, test, documentation, secret-handling, and completion rules apply to every service.

- For service changes, review input validation, authorization boundaries, dependency risk, logging, error handling, and accidental data exposure. Avoid exposing storage errors or sensitive request data to clients or logs.
- Verify API, storage, and external dependency behavior with the component's existing test patterns. Account for migration/configuration impact and include service-specific risks in the completion report.
- Read the service's own workflow and test entrypoint. The [template](template/AGENTS.md) is a scaffold with deliberately unconfigured tests; do not apply one service's runtime, branch rules, or test commands to another.
- Services are deployed through Kubernetes. When writing or reviewing Kubernetes for a backend service, inspect the service contract, runtime port, probes, environment variables, storage dependencies, and readiness behavior from the service code.
- Keep service contract and persistence changes coordinated with callers and schema constraints. App callers live under `apps/`; shared gateway, local development, and cloud configuration live outside service directories. Inspect those boundaries before claiming end-to-end integration.

## Shared integration limits

- The local [Compose configuration](../development/local-dev/compose.yaml) builds from `services/sample-service`, which is absent from this workspace. Its gateway still targets that sample service.
- The [Kubernetes workload example](../platform/kubernetes/apps/sample-service/deployment.yaml) is also a sample-service manifest, not a deployment for an implemented service.
