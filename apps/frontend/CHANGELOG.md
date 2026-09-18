# Changelog

## Unreleased

- Added the three-step event submission form, API-backed My Events/details, light-mode startup, and interaction tests.
- Removed the account sign-in label; account support remains a separate ticket.

## 2026-09-09

- Added Dockerfile support for the shared local Docker Compose frontend service.

## 2026-09-06

- Added frontend agent guidance and handover notes for the current scaffold state.
- Documented that no app runtime, package manifest, or test/build entrypoints exist yet.

- Added draft saving and My Requests to the current three-step event UI, including retry feedback, reopening, repeated saves, attachment persistence and submitted-request locking (SPM-37).
- Drafts now resume on the wizard step they were saved on, instead of always reopening at step one (SPM-37).
