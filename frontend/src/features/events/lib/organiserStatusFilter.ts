import type { EventRecord, EventStatus } from "@/types";
import { safetyCheckReady } from "@/features/events/components/StatusLabels";

/**
 * SPM-95: a filter option on My Events (organiser). The real statuses are every EventStatus except draft,
 * which SPM-94 lists separately; the virtual option matches the Awaiting Safety Check flag on the event.
 */
export type OrganiserStatusFilter = Exclude<EventStatus, "draft"> | "awaitingSafetyCheck";

/** SPM-95 AC5: option order and labels as the organiser sees them. */
export const ORGANISER_STATUS_FILTERS: ReadonlyArray<{ value: OrganiserStatusFilter; label: string }> = [
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "planning", label: "Planning" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "awaitingSafetyCheck", label: "Awaiting Safety Check" },
];

/** SPM-95 AC2 and AC5: no filter selected matches every event; otherwise an event matches when it satisfies any selected filter. */
export function matchesOrganiserStatusFilters(
  event: Pick<EventRecord, "status" | "safetyIndicator" | "venueRequestStatus" | "equipmentStatuses">,
  selected: ReadonlySet<OrganiserStatusFilter>,
): boolean {
  if (selected.size === 0) return true;
  return [...selected].some((filter) => {
    switch (filter) {
      case "awaitingSafetyCheck":
        return event.safetyIndicator === "AWAITING_CHECK" && safetyCheckReady(event);
      default:
        return event.status === filter;
    }
  });
}
