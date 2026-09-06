variable "project_id" {
  description = "Google Cloud project ID where API Gateway resources are created."
  type        = string
}

variable "region" {
  description = "Google Cloud region for the API Gateway."
  type        = string
}

variable "environment" {
  description = "Environment label applied to API Gateway resources."
  type        = string
}

variable "api_id" {
  description = "API Gateway API ID."
  type        = string
}

variable "gateway_id" {
  description = "API Gateway gateway ID."
  type        = string
}

variable "api_gateway_sa_email" {
  description = "Service account email used by API Gateway."
  type        = string
}

variable "backend_url" {
  description = "Backend HTTPS URL API Gateway forwards authorized requests to."
  type        = string
}

variable "allowed_jwt_issuer" {
  description = "JWT issuer accepted by API Gateway."
  type        = string
}

variable "allowed_jwt_jwks_uri" {
  description = "JWKS URI used by API Gateway for JWT signature verification."
  type        = string
}

variable "allowed_jwt_audiences" {
  description = "JWT audiences accepted by API Gateway."
  type        = list(string)
}
