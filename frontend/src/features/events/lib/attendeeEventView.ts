/*
 * Pure rules and formatting for the attendee's event view (AttendeeEventView). Kept out of the component file so the
 * component module exports only components. Times are local to the viewer, as the spec asks; the registration UI
 * elsewhere uses Singapore time.
 */
import type { EventRecord, Registration } from "@/types";
import { attendeeEventStatus, registrationState } from "@/features/events/lib/EventView";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The attendee-facing lifecycle label; the internal event status is never shown. */
export type AttendeeEventBadge = "upcoming" | "ongoing" | "ended";

/** What the footer's register control does right now, and why it is disabled when it is. */
export type AttendeeAction =
  | { kind: "hidden" }
  | { kind: "register" }
  | { kind: "disabled"; reason: string; waitlistAvailable: boolean };

const CLOSED_REASON = "Registration closed";
const FULL_REASON = "This event is full.";
/** Statuses that leave the footer hidden: the registration status card (RegistrationSection) is the only thing shown. */
const HIDDEN_FOR = new Set(["registered", "waitlisted", "withdrawn", "cancelled"]);

/** "Thu, 12 Nov 2026" in local time. */
export function formatAttendeeDate(value: string): string {
  const d = new Date(value);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "8:00am" in local time: no leading zero on the hour, two-digit minutes, lowercase am or pm. */
export function formatAttendeeTime(value: string): string {
  const d = new Date(value);
  const hours = d.getHours() % 12 || 12;
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}${d.getHours() < 12 ? "am" : "pm"}`;
}

/** Day, month, year and time in local time (for example, "4 Nov 2026, 11:59pm"): the deadline in the Register by item. */
export function formatDeadline(value: string): string {
  const d = new Date(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${formatAttendeeTime(value)}`;
}

/** Maps the lifecycle label from attendeeEventStatus to the three values the attendee sees. Cancelled reads as ended. */
export function attendeeBadge(event: EventRecord, now: Date): AttendeeEventBadge {
  const label = attendeeEventStatus(event, now);
  if (label === "Upcoming") return "upcoming";
  if (label === "In Progress") return "ongoing";
  return "ended";
}

/**
 * The footer's register control. The server still enforces every rule; this only decides what the attendee sees.
 * A registered, waitlisted, withdrawn or cancelled attendee, or an event without website registration, gets no footer.
 *
 * @param event The event, with its registration window, capacity and waitlist availability.
 * @param now The current instant.
 * @param registration The attendee's own registration for this event, if any.
 */
export function attendeeAction(event: EventRecord, now: Date, registration?: Registration): AttendeeAction {
  if (registration && HIDDEN_FOR.has(registration.status)) return { kind: "hidden" };
  // Registration through the website is off: RegistrationSection says so, and there is no register flow to lead into.
  if (!event.registrationEnabled) return { kind: "hidden" };
  const state = registrationState(event, now);
  if (state === "not-yet-open" && event.registrationOpensAt) {
    return {
      kind: "disabled",
      reason: `Registration opens ${formatDeadline(event.registrationOpensAt)}`,
      waitlistAvailable: false,
    };
  }
  if (state === "closed" || state === "disabled") {
    return { kind: "disabled", reason: CLOSED_REASON, waitlistAvailable: false };
  }
  if (state === "full" || event.isFull) {
    return { kind: "disabled", reason: FULL_REASON, waitlistAvailable: Boolean(event.waitlistAvailable) };
  }
  return { kind: "register" };
}

/** The Register by value: the deadline, or "Registration closed" once it has passed. */
export function deadlineValue(event: EventRecord, now: Date): string | null {
  if (!event.registrationClosesAt) return null;
  return now.getTime() >= new Date(event.registrationClosesAt).getTime()
    ? CLOSED_REASON
    : formatDeadline(event.registrationClosesAt);
}

/** Venue text: the booked venue's name, or "To be announced" while none is booked. */
export function venueText(event: EventRecord): string {
  return event.venueName?.trim() ? event.venueName : "To be announced";
}

/** Accessibility features the event offers, with blanks removed. */
export function accessibilityFeatures(event: EventRecord): string[] {
  return event.venueRequirements.accessibility.map((feature) => feature.trim()).filter(Boolean);
}

export type IconName = "calendar" | "clock" | "map-pin" | "hourglass" | "access" | "hearing" | "vision" | "check";

/** Picks the chip icon from the feature's wording: mobility, hearing, vision, or a generic tick. */
export function accessibilityIcon(feature: string): IconName {
  if (/ramp|step|wheelchair|lift|elevator|restroom|toilet|mobility|accessible/i.test(feature)) return "access";
  if (/hearing|audio|loop|sign language|captions?/i.test(feature)) return "hearing";
  if (/visual|braille|blind|vision|contrast|tactile/i.test(feature)) return "vision";
  return "check";
}
