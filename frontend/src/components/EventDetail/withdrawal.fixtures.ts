/*
 * SPM-120 test fixtures (test-only; never imported by the application). The ids
 * and names are the labels used in the Confluence test cases (REG-9001, EVT-101,
 * ATT-01) so the request path in a test matches the case's literal.
 * Suite clock T0 = 2026-10-04T12:00:00+08:00 (= 04:00Z); fixtures are offsets from it.
 */
import type { EventRecord, Registration, User } from "@/types";

export const T0 = new Date("2026-10-04T12:00:00+08:00");
export const HOUR = 3_600_000;
export const iso = (offsetMs: number) => new Date(T0.getTime() + offsetMs).toISOString();

export const ATT_01: User = { id: "ATT-01", name: "Alice Tan", email: "alice@example.com", role: "attendee" };

const EVT_101_START = "2026-10-14T14:00:00+08:00"; // T0 + 10 days, 14:00 SGT
const EVT_104_START = "2026-09-29T10:00:00+08:00"; // T0 - 5 days, 10:00 SGT

/** EVT-101 "Tech Talk: Cloud 101": a future event with registration open. */
export function buildEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "EVT-101",
    name: "Tech Talk: Cloud 101",
    purpose: "p",
    description: "d",
    organiserId: "o",
    organiserName: "O",
    status: "confirmed",
    startDateTime: EVT_101_START,
    endDateTime: new Date(new Date(EVT_101_START).getTime() + 2 * HOUR).toISOString(),
    expectedAttendance: 50,
    venueRequirements: { minCapacity: 50, accessibility: [], facilities: [], layout: "" },
    equipmentNeeds: "",
    registrationEnabled: true,
    registrationOpensAt: iso(-HOUR),
    registrationClosesAt: iso(9 * 24 * HOUR),
    availableRegistrationSpots: 47,
    changeRequests: [],
    createdAt: iso(-HOUR),
    updatedAt: iso(-HOUR),
    ...overrides,
  };
}

/** EVT-104 "Startup Pitch Day": started 5 days before T0 (a past event). */
export function buildPastEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return buildEvent({
    id: "EVT-104",
    name: "Startup Pitch Day",
    startDateTime: EVT_104_START,
    endDateTime: new Date(new Date(EVT_104_START).getTime() + 2 * HOUR).toISOString(),
    ...overrides,
  });
}

/** REG-9001: ATT-01's active ("Confirmed" in the cases, "registered" in the repo) registration. */
export function buildRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "REG-9001",
    eventId: "EVT-101",
    attendeeId: ATT_01.id,
    attendeeName: "Alice Tan",
    fullName: "Alice Tan",
    email: "alice@example.com",
    status: "registered",
    registeredAt: iso(-24 * HOUR),
    ...overrides,
  };
}

/**
 * The server's 200 body for a withdrawal. The message is deliberately different
 * from the one the UI must show: the UI builds its own banner (D9) and must not echo this.
 */
export function withdrawalResponse(registration: Registration, withdrawnAt: Date = T0) {
  return {
    ...registration,
    status: "withdrawn",
    withdrawnAt: withdrawnAt.toISOString(),
    message: "SERVER MESSAGE THE UI MUST NOT ECHO",
  };
}
