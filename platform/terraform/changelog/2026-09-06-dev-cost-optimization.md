# Dev Cost Optimization

## What changed

- Removed the scheduler-based GKE cost-control module and all Cloud Scheduler wiring.
- Split GKE placement from the regional service setting by adding `gke_location`.
- Set development GKE to a zonal location: `asia-southeast1-a`.
- Set development GKE sizing to `node_count = 1` and `node_machine_type = "e2-small"`.
- Kept VPC Flow Logs configured, but set development `vpc_flow_logs_sampling = 0` to avoid reported flow log volume.
- Kept low-cost observability defaults: `nat_log_filter = "ERRORS_ONLY"`, `log_bucket_retention_days = 7`, `enable_log_bucket_cmek = false`, and no alert email channels by default.
- Kept `enable_api_gateway = false` in dev so API Gateway is not created until there is a real Gateway API backend endpoint.
- Added a manual Terraform destroy workflow guard.

## Why it saves cost

- Zonal GKE avoids multiplying node pools across all zones in the region.
- One small node lowers the main always-on development cost.
- Setting VPC Flow Logs sampling to `0` in dev keeps the subnet logging configuration present while avoiding reported flow log volume.
- Keeping API Gateway disabled and not deploying Gateway API routing resources avoids always-on external entrypoint and load-balancer costs during normal dev.
- The manual destroy job gives an explicit cleanup path when the environment should be fully removed.

## Production overrides

For production, use tfvars overrides rather than changing the dev example:

```hcl
gke_location              = "asia-southeast1"
node_count                = 2
node_machine_type         = "e2-standard-2"
vpc_flow_logs_sampling    = 0.1
nat_log_filter            = "ERRORS_ONLY"
log_bucket_retention_days = 30

monitoring_alert_email_addresses = [
  "alerts@example.com"
]
```

Deploy Kubernetes `Gateway` and `HTTPRoute` resources only when production traffic is ready. Enable API Gateway only after the backend HTTPS endpoint exists:

```hcl
enable_api_gateway = true
backend_url        = "https://api.example.com"
```

## How to undo

- Set `gke_location` back to the regional value, such as `asia-southeast1`, to restore regional GKE.
- Increase `node_count` and `node_machine_type` for production capacity.
- Raise `vpc_flow_logs_sampling` when network auditability matters more than dev cost.
- Configure `monitoring_alert_email_addresses` for real alert delivery.
- Deploy Gateway API routing resources and enable API Gateway only when external traffic should be served.
- Use the manual Terraform destroy workflow on `main` with `confirm_destroy=destroy` when the whole environment should be deleted.
