import type { EventRecord } from "@/types";

export type RegistrationState = "not-yet-open" | "open" | "closed" | "full" | "disabled";

/**
 * Resolves the registration state presented to an attendee.
 *
 * @param event The event and its configured registration window/capacity.
 * @param now The current instant used to evaluate opening and closing boundaries.
 * @returns The attendee-facing registration state. The opening instant is inclusive.
 */
export function registrationState(event: EventRecord, now: Date): RegistrationState {
  if (!event.registrationEnabled) return "disabled";
  if (event.status === "cancelled" || event.status === "completed") return "closed";

  const current = now.getTime();
  if (event.registrationOpensAt && current < new Date(event.registrationOpensAt).getTime()) {
    return "not-yet-open";
  }
  if (event.registrationClosesAt && current > new Date(event.registrationClosesAt).getTime()) {
    return "closed";
  }
  if ((event.availableRegistrationSpots ?? event.expectedAttendance) <= 0) return "full";
  return "open";
}

/**
 * Converts a registration state into the notice displayed in the event detail page.
 *
 * @param state The evaluated registration state.
 * @returns A concise attendee-facing registration notice.
 */
export function registrationStateLabel(state: RegistrationState): string {
  return {
    "not-yet-open": "Registration Not Yet Open",
    open: "Registration Open",
    closed: "Registration Closed",
    full: "Registration Full",
    disabled: "Registration Unavailable",
  }[state];
}

/**
 * Derives the attendee-facing event lifecycle label from its cancellation flag and schedule.
 *
 * @param event The event whose lifecycle is being displayed.
 * @param now The current instant used to distinguish Upcoming and In Progress events.
 * @returns Upcoming, In Progress, Completed, or Cancelled.
 */
export function attendeeEventStatus(event: EventRecord, now: Date): string {
  if (event.status === "cancelled") return "Cancelled";
  if (event.status === "completed" || now.getTime() >= new Date(event.endDateTime).getTime()) {
    return "Completed";
  }
  if (now.getTime() >= new Date(event.startDateTime).getTime()) return "In Progress";
  return "Upcoming";
}
