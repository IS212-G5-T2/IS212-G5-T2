# Frontend feature groups

Use this map when placing new frontend files, reviewing a materially changed page family, or planning a requested feature reorganization. Confirm ownership from routes and actual imports before moving code; names alone may mislead.

| Feature owner under `src/features/` | Owns |
| --- | --- |
| `events/` | Event list, detail, create, edit, change requests, drafts, event cards, registration UI, and event-specific logic and types. |
| `registrations/` | Registration reports, exports, report components, polling hooks, and report-specific logic. `EventDetailPage` stays with events and composes the registration modal. |
| `venues/` | Venue catalogue, detail, availability, creation, venue-records subfeature, venue cards, and venue options. |
| `bookings/` | Booking requests, cards, details, conflict UI, and booking submission UI. Keep its boundary with venues explicit. |
| `equipment/` | Equipment inventory, creation, availability, requests, audit trail, reservation UI, and equipment API adapter. |
| `lead/` | Assignment queue, reassignment, lead notifications, and lead API adapter. |
| `account/` | Login, settings, coordinator availability, account-specific API calls, and account test helpers. |

Keep app routing and providers in `app/`; keep genuine design primitives in `components/ui/` and shared layout in `components/layout/`. Put a helper, hook, API adapter, or type with its feature when only that feature owns it. Use `lib/`, shared `types/`, or app-wide `store/` only for real cross-feature contracts. Do not move the mixed `useAppStore.ts` merely to match the example tree; split it only as scoped work with its consumers and contracts checked. Avoid feature-to-feature imports of private internals and circular dependencies.

## Capability folders inside a feature

When a feature contains separate user workflows, group each workflow in its own folder once it owns a page plus related files such as tests, fixtures, hooks, or local components. Base the split on an independently routed or independently evolving capability, not on file type alone.

This is a general rule, not a migration checklist or a priority ordering for any
named feature. For example, a feature that owns independently routed assignment
and reassignment workflows could use this layout:

```text
features/<feature>/
  api/                         shared feature API contracts and calls
  components/                  reusable feature UI
  pages/
    assignment-queue/          page, tests, fixtures, and local UI for assignment
    reassignment/              page, tests, fixtures, and local UI for reassignment
```

Apply the same assessment independently to all features. Do not create a folder
for a single simple file with no likely local collaborators.

For an authorized move, move page tests, Playwright specs, and fixtures with their owning page or component. Update `src/app/App.tsx` imports and any affected aliases, test imports, documentation, and scoped instructions. Preserve public routes and behavior unless the task changes them. Run the affected tests, lint, and build after a code migration. During review-only work, describe a specific ownership or coupling problem and the smallest coherent move; folder shape alone is not a finding.
