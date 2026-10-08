# Frontend page groups

Use this map when placing new frontend files, reviewing a materially changed page family, or planning a requested `src/pages/` reorganization. Confirm ownership from routes and actual imports before moving code; names alone may mislead. These are candidate destinations, not required changes to existing files.

| Feature owner under `src/features/` | Current page family and nearby code |
| --- | --- |
| `events/` | `EventListPage`, `EventDetailPage`, `EventCreatePage`, `EventEditPage`, `EventChangeRequestsPage`, `EventView.ts`; event cards, forms, and event-specific tests. Keep `MyRequestsPage` and draft types here while requests are the event draft workflow. |
| `registrations/` | `RegistrationReportPage`, `components/registrations/`, registration/report utilities. `EventDetailPage` stays with events; it can compose registration-owned components. Tests for that page's combined behavior stay beside the page. |
| `venues/` | `VenuesPage`, `VenueDetailPage`, `VenueAvailabilityPage`, `pages/venues/`, `pages/venue-records/`, and venue-specific cards, options, and availability code. Keep venue-records as a subfeature if its workflow warrants one. |
| `bookings/` | `BookingsPage`, `BookingCard`, `BookingDetailModal`, `SubmitBookingModal`, and booking-specific code. These are venue booking requests; keep the boundary with `venues/` explicit. |
| `equipment/` | `EquipmentPage`, `EquipmentCreatePage`, `EquipmentAvailabilityPage`, `EquipmentRequestsPage`, `AuditTrailPage`, `EquipmentReservationForm`, and `equipment-api.ts`. The audit trail is equipment-specific. |
| `lead/` | `AssignmentQueuePage`, `ReassignmentPage`, lead notifications, and `lead-api.ts`. |
| `account/` | `LoginPage`, `SettingsPage`, and account-specific UI. `SettingsPage` currently hosts coordinator availability; keep that component with the coordinator/assignment owner if it is used there too, or with account settings if it is settings-only. |

Keep app routing and providers in `app/`; keep genuine design primitives in `components/ui/` and shared layout in `components/layout/`. Put a helper, hook, API adapter, or type with its feature when only that feature owns it. Use `lib/`, shared `types/`, or app-wide `store/` only for real cross-feature contracts. Do not move the mixed `useAppStore.ts` merely to match the example tree; split it only as scoped work with its consumers and contracts checked. Avoid feature-to-feature imports of private internals and circular dependencies.

For an authorized move, move page tests, Playwright specs, and fixtures with their owning page or component. Update `App.tsx` imports and any affected aliases, test imports, documentation, and scoped instructions. Preserve public routes and behavior unless the task changes them. Run the affected tests, lint, and build after a code migration. During review-only work, describe a specific ownership or coupling problem and the smallest coherent move; folder shape alone is not a finding.
