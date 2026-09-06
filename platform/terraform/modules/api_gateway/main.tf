resource "google_api_gateway_api" "api" {
  provider = google-beta
  project  = var.project_id
  api_id   = var.api_id
}

resource "google_api_gateway_api_config" "config" {
  provider             = google-beta
  project              = var.project_id
  api                  = google_api_gateway_api.api.api_id
  api_config_id_prefix = "${var.api_id}-${var.environment}-"

  openapi_documents {
    document {
      path = "openapi.yaml"
      contents = base64encode(templatefile("${path.module}/openapi.yaml.tftpl", {
        title                 = "SPM API"
        backend_url           = var.backend_url
        allowed_jwt_issuer    = var.allowed_jwt_issuer
        allowed_jwt_jwks_uri  = var.allowed_jwt_jwks_uri
        allowed_jwt_audiences = var.allowed_jwt_audiences
      }))
    }
  }

  gateway_config {
    backend_config {
      google_service_account = var.api_gateway_sa_email
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_api_gateway_gateway" "gateway" {
  provider   = google-beta
  project    = var.project_id
  region     = var.region
  api_config = google_api_gateway_api_config.config.id
  gateway_id = var.gateway_id

  labels = {
    environment = var.environment
  }
}
