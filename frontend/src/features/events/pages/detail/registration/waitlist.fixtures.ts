/*
 * SPM-138 test fixtures (test-only; never imported by the application). The labels are the spec's: EVT-701 "Gala Waitlist
 * Night" (capacity 3, full), ATT-01 to ATT-07 attendees. Suite clock T0 = 2026-10-14T12:00:00+08:00 (= 04:00Z).
 * Times are offsets from T0 unless a builder names an absolute instant.
 */
import { screen } from "@testing-library/react";
import { expect } from "vitest";
import type { EventRecord, Registration, User } from "@/types";

export const T0 = new Date("2026-10-14T12:00:00+08:00");
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const iso = (offsetMs: number) => new Date(T0.getTime() + offsetMs).toISOString();

export const GALA_NAME = "Gala Waitlist Night";
const GALA_OPENS = "2026-10-13T12:00:00+08:00"; // T0 - 1 day
const GALA_CLOSES = "2026-10-19T23:59:00+08:00"; // T0 + 5 days 23:59
const GALA_START = "2026-10-24T18:00:00+08:00"; // T0 + 10 days 18:00

export const attendee = (id: string, name: string): User => ({
  id,
  name,
  email: `${id.toLowerCase()}@example.com`,
  role: "attendee",
});
export const ATT_01 = attendee("ATT-01", "Attendee One");
export const ATT_04 = attendee("ATT-04", "Attendee Four");
export const ATT_05 = attendee("ATT-05", "Attendee Five");
export const ATT_06 = attendee("ATT-06", "Attendee Six");
export const ATT_07 = attendee("ATT-07", "Attendee Seven");

/** EVT-701 "Gala Waitlist Night": capacity 3, full (isFull), open, waiting list available. Override fields per case. */
export function buildGala(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "EVT-701",
    name: GALA_NAME,
    purpose: "p",
    description: "d",
    organiserId: "o",
    organiserName: "O",
    status: "confirmed",
    startDateTime: GALA_START,
    endDateTime: new Date(new Date(GALA_START).getTime() + 2 * HOUR).toISOString(),
    expectedAttendance: 50,
    venueRequirements: { minCapacity: 50, accessibility: [], facilities: [], layout: "" },
    equipmentNeeds: "",
    registrationEnabled: true,
    registrationOpensAt: GALA_OPENS,
    registrationClosesAt: GALA_CLOSES,
    registrationOpen: true,
    registrationLimit: 3,
    availableRegistrationSpots: 0,
    availableSpots: 0,
    isFull: true,
    waitlistAvailable: true,
    changeRequests: [],
    createdAt: iso(-HOUR),
    updatedAt: iso(-HOUR),
    ...overrides,
  };
}

/** The same event with a free place: 9 of 10 style counts, no waiting list. */
export const notFull = (overrides: Partial<EventRecord> = {}) =>
  buildGala({ registrationLimit: 10, availableRegistrationSpots: 1, availableSpots: 1, isFull: false, waitlistAvailable: false, ...overrides });

/** A waiting entry for the given attendee at the given position. */
export function buildWaitlisted(attendeeId: string, position: number | null, overrides: Partial<Registration> = {}): Registration {
  return {
    id: `REG-${attendeeId}`,
    eventId: "EVT-701",
    attendeeId,
    attendeeName: attendeeId,
    fullName: attendeeId,
    email: `${attendeeId.toLowerCase()}@example.com`,
    status: "waitlisted",
    registeredAt: iso(-HOUR),
    waitlistPosition: position,
    ...overrides,
  };
}

/** Confirmed (status registered) for the attendee. */
export const buildRegistered = (attendeeId: string, overrides: Partial<Registration> = {}): Registration =>
  buildWaitlisted(attendeeId, null, { status: "registered", ...overrides });

/** Assertion helper: the text of the one element with this exact text is present. */
export const expectText = (text: string) => expect(screen.getByText(text)).toBeInTheDocument();
