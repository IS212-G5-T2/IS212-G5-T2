# Backend changelog

## Unreleased

- Added protected `GET /auth/me`, which returns the identity and roles from a
  verified Firebase ID token without exposing credentials or raw claims.
- Updated Firebase Auth Emulator E2E coverage to test the production auth
  endpoint and incorrect-password rejection.
- Added Firebase JWT authentication middleware and database-backed RBAC query helpers for single-request permission and ownership checks.
- Added local Firebase Auth Emulator initialization that uses the shared
  emulator project without requiring application-default or service-account credentials.
- Added NestJS backend scaffold under `services/backend`.
