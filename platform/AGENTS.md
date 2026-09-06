# Platform agent rules

Scope: `platform/`, within the [global agent instructions](../AGENTS.md). This area owns the deployment strategy for the system.

## Ownership boundaries

- `terraform/` owns provisioning for cloud infrastructure, IAM, networking, managed services, API Gateway configuration, and GKE cluster creation.
- `kubernetes/` owns runtime Kubernetes resources for backend services: namespace, service accounts, Gateway API routing, workload manifests, autoscaling, network policy, and overlays.
- Repository CI belongs in `.github/workflows/`.
- `apps/` deployments are front-facing and outside Kubernetes. Platform work may define the strategy or integration boundary for app hosting, but Kubernetes manifests should focus on backend services unless an explicit architecture change says otherwise.

## Infrastructure safety

- Treat Terraform apply and destroy as environment-changing operations. The Terraform GitHub Actions workflow exposes manual apply and destroy jobs; ordinary validation must use formatting, validation, and planning unless the user explicitly requests an environment change.
- Never commit real tfvars files, credentials, secret payloads, certificates, or production data. Secret payloads passed through Terraform can enter state even when marked sensitive.
- For Kubernetes changes, inspect the affected backend service under `services/` before writing manifests. Keep Terraform outputs, service account annotations, gateway settings, image paths, probes, service ports, routes, and environment overlays consistent. Do not claim a workload is deployed from manifests alone.

## Automation lifecycle

- CI jobs may leave cleanup to the runner. Do not assume the runner cleaned run-owned resources unless the job environment proves it.
- Commit-tagged registry images are intended build outputs when produced by CI. Temporary Docker containers, networks, and volumes created during local disposable tests must still be removed by recorded identity.
- Local integration behavior belongs under `development/local-dev`; preserve that shared stack unless an explicit stop or reset is requested.
