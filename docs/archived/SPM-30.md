# SPM-30 AI usage history

Historical AI-assisted work associated with SPM-30.

## 2026-09-22

- swr - maintenance - Correct event-assignment E2E seed parameter mapping: Restored the event seed query's placeholders so organiser, coordinator, attachments, and status values align with the supplied PostgreSQL parameter array.

## 2026-09-16

- swr - fix - Restore SPM-30 frontend authentication integration: Restored the SPM-30 Firebase-derived user model after the manual merge combined it with mock-role code.
- swr - documentation - Reconcile merged documentation with implementation: Reviewed the staged manual merge against the current implementation and corrected documentation that combined real Firebase authentication with the separate demo-only event API.
- swr - testing - Configure Firebase defaults for frontend tests: Added inert Firebase Web SDK environment values to the global Vitest setup so store imports cannot initialize Firebase Auth with an empty CI API key.
- swr - implementation - Complete SPM-30 attendee route and registration controls: Restricted attendee routes and registration actions to the authenticated attendee.
- swr - testing - Close SPM-30 acceptance-path test gaps: Fixed role fixtures and expanded frontend CI and E2E acceptance coverage.
- swr - maintenance - Remove superseded local Firebase verification helper: Removed the interactive real-Firebase curl helper and its README/changelog references at the requester's direction.
- swr - maintenance - Verify Firebase authentication through the production route: Added authenticated `GET /auth/me`, corrected the local curl helper to call it, and changed the Firebase emulator E2E test to exercise the production route rather than a test-only controller.
- swr - maintenance - Add local real-Firebase backend verification helper: Added an interactive curl-based helper that signs a prompted non-production Firebase user in through the real Firebase REST API and sends its ID token to the local backend's protected root route.
- swr - maintenance - Use real Firebase in local Compose: Removed the local Firebase Auth Emulator service and fake Firebase settings from Compose.

## 2026-09-15

- swr - implementation - Enforce role-aware organiser routes for SPM-30: Restricted organiser and coordinator routes using Firebase role claims and guarded nested routes.
- swr - maintenance - Share local Firebase Auth Emulator between frontend and backend: Added opt-in frontend Auth Emulator connection, a shared Compose Auth Emulator service, and backend emulator initialization using the same `demo-is212` project without service-account credentials.
