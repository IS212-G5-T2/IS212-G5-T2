# Changelog

## Unreleased

- Added API-backed My Requests and draft create/edit screens with incomplete fields, save confirmation, retry retention and submitted-request protection.
- Replaced the venue and equipment requirement text areas with addable row-and-column grids while preserving older text-only drafts.
- Renamed the attendee-registration field to explain that it controls registration through the system.
- Redirected successful draft saves to My Requests with an explicit not-submitted confirmation; listed drafts reopen the pre-filled form with a saved indication.
- Added component tests and a component CI entrypoint; prevented stale request loads from replacing the current draft.

## 2026-09-09

- Added Dockerfile support for the shared local Docker Compose frontend service.

## 2026-09-06

- Added frontend agent guidance and handover notes for the current scaffold state.
- Documented that no app runtime, package manifest, or test/build entrypoints exist yet.
# Required-field feedback

- Added red required markers, missing-field feedback and first-error focus when attempting submission, preserving incomplete draft saves. Actual submission remains unavailable pending its workflow integration.
- Added a repository-owned Playwright browser suite for mandatory-field validation and incomplete draft saving.

- Moved story tests beside their owning source modules and updated runner discovery; removed the root Jira-key test layout. Restored conflicted package files exactly from dev.
- Enabled anonymous draft create/list/read/update in a shared workspace. Added a real API browser test for saving and reopening without login.
