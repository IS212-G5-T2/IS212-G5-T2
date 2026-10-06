import type { EventRecord } from "@/types";
import { hasEventStarted, isRegistrationOpen } from "@/utils/registration";

export type RegistrationState = "not-yet-open" | "open" | "closed" | "full" | "disabled";

/**
 * Resolves the registration state presented to an attendee.
 *
 * @param event The event and its configured registration window/capacity.
 * @param now The current instant used to evaluate opening and closing boundaries.
 * @returns The attendee-facing registration state. The opening instant is inclusive and the closing instant exclusive.
 */
export function registrationState(event: EventRecord, now: Date): RegistrationState {
  if (!event.registrationEnabled) return "disabled";
  if (event.status === "cancelled" || event.status === "completed") return "closed";

  const period = { opensAt: event.registrationOpensAt, closesAt: event.registrationClosesAt };
  if (!isRegistrationOpen(period, now)) {
    // Inclusive open, exclusive close (SPM-61 D6): before the opening instant is
    // not-yet-open, everything at or after the closing instant is closed.
    return event.registrationOpensAt && now.getTime() < new Date(event.registrationOpensAt).getTime()
      ? "not-yet-open"
      : "closed";
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

export type WithdrawnCardFooterState =
  | { kind: "open"; spots: number; closesAt?: string }
  | { kind: "full" }
  | { kind: "not-yet-open"; opensAt: string }
  | { kind: "closed"; closesAt?: string }
  | { kind: "event-started" };

/**
 * Eligibility for the "Register again" footer on a withdrawn registration card
 * (SPM-120 card redesign). Built on `registrationState` so this can never
 * disagree with the initial register action about whether registration is open;
 * the event-start check is the same `hasEventStarted` predicate used to disable
 * the Withdraw button in the first place.
 *
 * @param event The event, including its registration window and capacity.
 * @param now The current instant.
 * @returns Which footer row of the state matrix applies.
 */
export function withdrawnCardFooterState(event: EventRecord, now: Date): WithdrawnCardFooterState {
  if (hasEventStarted(event, now)) return { kind: "event-started" };
  const state = registrationState(event, now);
  if (state === "open") {
    return {
      kind: "open",
      spots: event.availableRegistrationSpots ?? event.expectedAttendance,
      closesAt: event.registrationClosesAt,
    };
  }
  if (state === "full") return { kind: "full" };
  if (state === "not-yet-open") return { kind: "not-yet-open", opensAt: event.registrationOpensAt! };
  // "Closed on" is only true once the closing time has passed; a cancelled event can still carry a future one.
  const closesAt = event.registrationClosesAt;
  const hasClosed = Boolean(closesAt) && now.getTime() >= new Date(closesAt as string).getTime();
  return { kind: "closed", closesAt: hasClosed ? closesAt : undefined };
}

export type AttendeeBrowseFilter = "upcoming" | "registered" | "past" | "cancelled";

export const ATTENDEE_BROWSE_FILTERS: { value: AttendeeBrowseFilter; label: string }[] = [
  { value: "upcoming", label: "Upcoming events" },
  { value: "registered", label: "Registered Events" },
  { value: "past", label: "Past Events" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * SPM-61 attendee Browse Events filters. "Approved" and "Confirmed" are the
 * same published state for attendees.
 *
 * @param event The event, including the attendee's own registration status.
 * @param filter The selected filter.
 * @param now The current instant used to split upcoming and past events.
 * @returns Whether the event belongs in the selected filter.
 */
export function matchesAttendeeFilter(event: EventRecord, filter: AttendeeBrowseFilter, now: Date): boolean {
  const published = event.status === "approved" || event.status === "confirmed";
  const ended = now.getTime() >= new Date(event.endDateTime).getTime();
  const registered = event.myRegistrationStatus === "registered";
  switch (filter) {
    case "upcoming":
      // Every published event that has not ended, registered or not.
      return published && !ended;
    case "registered":
      // Events I'm registered for that are still to come.
      return registered && published && !ended;
    case "past":
      // Events I registered for that have finished.
      return registered && event.status !== "cancelled" && (event.status === "completed" || ended);
    case "cancelled":
      // Events I registered for that were cancelled.
      return registered && event.status === "cancelled";
  }
}
