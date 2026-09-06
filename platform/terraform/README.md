# SPM GCP Terraform

This Terraform layout implements the GCP structure shown in the updated secure architecture diagram:

- Vercel frontend integration through HTTPS/JWT-facing API Gateway variables.
- Authentication through an external identity provider; API Gateway verifies issuer, JWKS, audience, and expiry.
- Identity Platform project configuration, with optional Terraform-managed Google sign-in provider configuration.
- Platform services: Artifact Registry and Secret Manager.
- Identity and access: dedicated service accounts, least-privilege IAM, and Workload Identity for GKE workloads.
- Private platform network: VPC, private subnet, GKE secondary ranges, Cloud NAT, Private Service Access, VPC Flow Logs, and NAT logging.
- Runtime: private GKE cluster for private microservices with Gateway API enabled. Dev defaults use a zonal cluster to reduce cost.
- Managed services: private-IP Cloud SQL, Pub/Sub, and Cloud Storage.
- Centralized observability: Cloud Logging bucket, Log Router sink, cost-control exclusions, monitoring alert policies, optional CMEK, optional budget alerts, and a storage bucket for Cloud Storage server-access logs.

## Layout

```text
.
|-- main.tf
|-- outputs.tf
|-- providers.tf
|-- terraform.tf
|-- variables.tf
|-- environments/
|   `-- dev.tfvars.example
`-- modules/
    |-- api_gateway/
    |-- gke/
    |-- iam/
    |-- managed_services/
    |-- network/
    |-- observability/
    `-- platform_services/
```

## Usage

Copy `environments/dev.tfvars.example` to a real tfvars file and replace the placeholder values:

```sh
cp environments/dev.tfvars.example environments/dev.tfvars
terraform init
terraform plan -var-file=environments/dev.tfvars
```

Secret payloads are optional and intentionally empty by default. If initial values are needed, pass `secret_payloads` from a protected variable source rather than committing them.
For production secrets, prefer creating secret versions through a protected operational process instead of Terraform variables, because secret payloads are stored in Terraform state even when marked sensitive.

## GitHub Actions Flow

The Terraform workflow follows the branch flow:

- `staging`: runs `terraform fmt`, `terraform validate`, and `terraform plan`.
- `main`: exposes a manual `terraform apply` job.
- `main`: exposes a manual `terraform destroy` job guarded by `TF_DESTROY_CONFIRM=destroy`.

Do not commit real tfvars files. Provide environment-specific values through GitHub Actions secrets, variables, or environment-scoped configuration for `staging` and `production`. At minimum, set `TF_VAR_environment` and `TF_VAR_project_id`. Add `TF_VAR_enable_api_gateway=true` and `TF_VAR_backend_url` only after the backend HTTPS endpoint managed through GKE Gateway API exists.

To destroy the production stack from GitHub Actions, run the Terraform workflow manually on `main`, choose `destroy`, and set `confirm_destroy` to `destroy`.

JWT signing keys are intentionally not managed here. The identity provider signs tokens, API Gateway verifies them, and backend services should enforce authorization by checking roles or permissions in the application database.

## Gateway API Runtime Routing

Terraform enables the GKE Gateway API controller through `gke_gateway_api_channel = "CHANNEL_STANDARD"`, but it does not create Kubernetes routing resources.

Use Kubernetes Gateway API resources such as `Gateway` and `HTTPRoute` for runtime traffic exposure. Do not add new Kubernetes `Ingress` resources for this architecture unless the routing decision is explicitly changed later.

API Gateway remains the JWT verification layer. Once the GKE Gateway API endpoint is available and HTTPS is ready, set `backend_url` to that endpoint so API Gateway can forward authorized requests to the private services route.

## Dev Cost Controls

The dev example is tuned to avoid running an expensive baseline:

- `gke_location = "asia-southeast1-a"` keeps GKE zonal for dev while regional services still use `region = "asia-southeast1"`.
- `gke_enable_private_endpoint = false` keeps the control plane reachable for local and CI deployment while nodes remain private. Set it to `true` only when deployment runners can reach the VPC.
- `node_count = 1` and `node_machine_type = "e2-small"` keep the dev node pool small.
- `vpc_flow_logs_sampling = 0`, `nat_log_filter = "ERRORS_ONLY"`, and `log_bucket_retention_days = 7` keep observability lower-volume.
- `enable_api_gateway = false` avoids creating API Gateway until a real backend endpoint exists.
- `cloud_sql_deletion_protection = false` is shown in the dev example so disposable dev environments can be destroyed. Keep the default `true` outside dev.

Gateway API is enabled on the cluster, but no Google Cloud Load Balancer is created until Kubernetes `Gateway` and `HTTPRoute` resources are deployed. For dev, deploy those routing resources only when external access is actively needed.

## Application Manifests

Terraform creates the cloud foundation. Kubernetes Deployments, Services, Gateway API routing resources, HPA/KEDA objects, and service account annotations should be applied by the application delivery pipeline after the cluster exists. The Kubernetes service account must use this annotation:

```yaml
iam.gke.io/gcp-service-account: <microservices_service_account_email>
```

For multiple microservices, set `microservice_identities` so each workload gets its own Kubernetes service account, Google service account, and resource-specific IAM grants. Leave it empty to create the baseline `microservices` identity.

The companion Kubernetes base lives in `../kubernetes`. It expects these Terraform outputs when preparing an environment overlay:

```sh
terraform output -raw project_id
terraform output -raw region
terraform output -raw gke_location
terraform output -raw microservices_service_account_email
terraform output -raw cloud_sql_connection_name
terraform output -raw storage_bucket_name
terraform output -raw gateway_api_channel
```

NetworkPolicy enforcement is enabled on the GKE cluster by default through `gke_network_policy_enabled = true`, matching the baseline namespace policies in the Kubernetes folder.
