# SPM Kubernetes Base

This folder contains the Kubernetes baseline for deploying SPM microservices into the private GKE cluster created by `../terraform`.

Terraform owns the Google Cloud foundation:

- GKE private cluster with Workload Identity.
- Artifact Registry for container images.
- Secret Manager metadata.
- Cloud SQL, Cloud Storage, and Pub/Sub.
- IAM grants for the Kubernetes service account through a Google service account.

Kubernetes owns the runtime layer:

- Namespace, service account, limits, quota, and baseline network policy.
- Shared platform config from Terraform outputs.
- Shared GKE Gateway plus per-service HTTPRoute and HealthCheckPolicy resources.
- Microservice Deployment, Service, and HPA resources.

## Layout

```text
.
|-- base/
|   |-- namespace.yaml
|   |-- service-account.yaml
|   |-- gateway.yaml
|   |-- limit-range.yaml
|   |-- resource-quota.yaml
|   `-- network-policy.yaml
|-- apps/
|   `-- sample-service/
|       |-- deployment.yaml
|       |-- service.yaml
|       |-- health-check-policy.yaml
|       |-- hpa.yaml
|       `-- route.yaml
|-- optional/
|   `-- secret-manager-csi/
`-- overlays/
    `-- dev/
        |-- kustomization.yaml
        |-- service-account.patch.yaml
        |-- platform-config.patch.yaml
        `-- gateway-route.patch.yaml
```

## First Deploy

From `../terraform`, provision the cloud base first:

```sh
terraform init
terraform apply -var-file=environments/dev.tfvars
```

From this folder, configure access to the cluster:

```sh
gcloud container clusters get-credentials "$(terraform -chdir=../terraform output -raw gke_cluster_name)" \
  --location "$(terraform -chdir=../terraform output -raw gke_location)" \
  --project "$(terraform -chdir=../terraform output -raw project_id)"
```

Update `overlays/dev/*.patch.yaml` with these Terraform outputs:

```sh
terraform -chdir=../terraform output -raw project_id
terraform -chdir=../terraform output -raw microservices_service_account_email
terraform -chdir=../terraform output -raw cloud_sql_connection_name
terraform -chdir=../terraform output -raw storage_bucket_name
terraform -chdir=../terraform output -raw gke_cluster_name
terraform -chdir=../terraform output -raw gateway_api_channel
```

Also update:

- `PROJECT_ID`
- `STORAGE_BUCKET`
- the Artifact Registry image path in `overlays/dev/kustomization.yaml`
- the API hostname in `overlays/dev/gateway-route.patch.yaml`

Create any runtime Kubernetes secrets before applying workloads. The baseline sample expects this secret if the service reads a database URL:

```sh
kubectl create namespace spm --dry-run=client -o yaml | kubectl apply -f -
kubectl -n spm create secret generic database-url \
  --from-literal=DATABASE_URL='postgres://user:password@host:5432/spm' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Apply the dev overlay:

```sh
kubectl apply -k overlays/dev
```

The sample service includes a Cloud SQL Auth Proxy sidecar that connects through private IP using `CLOUD_SQL_CONNECTION_NAME` from `platform-config`. Workloads can connect to PostgreSQL on `127.0.0.1:5432`.

Terraform creates Secret Manager secrets and grants access through Workload Identity. If you install the GCP Secret Manager CSI driver, `optional/secret-manager-csi` provides a starting `SecretProviderClass`; it is not included in the default overlay because the CRD must exist before it can be applied.

## Adding A Microservice

Copy `apps/sample-service` and replace:

- resource names such as `sample-service`
- the image path and tag
- ports, probes, and resource requests
- HTTPRoute paths or hostnames
- env vars and secret references

For stronger isolation, define the service in Terraform `microservice_identities`, then create a matching Kubernetes service account in this folder using the generated Google service account email.

## API Gateway Backend

Terraform enables GKE Gateway API through `gke_gateway_api_channel = "CHANNEL_STANDARD"`. Kubernetes creates the actual load balancer only after `Gateway` and `HTTPRoute` resources are applied.

After the Gateway provisions, get its address:

```sh
kubectl -n spm get gateway spm-gateway
```

Point DNS for the hostname in `overlays/dev/gateway-route.patch.yaml` to that address. Once the route is reachable, use that URL as Terraform `backend_url` for API Gateway.

The baseline Gateway listens on HTTP port 80. For production HTTPS, create or reference a Google Certificate Manager certificate map and add the `networking.gke.io/certmap` annotation plus an HTTPS listener on `base/gateway.yaml` or an environment overlay.
