import { describe, expect, it } from "vitest";
import type { EventRecord } from "@/types";
import { attendeeEventStatus, registrationState, registrationStateLabel } from "./EventView";

function event(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "event-1", name: "SMU Tech Connect", purpose: "Networking", description: "Meet peers.",
    organiserId: "organiser-1", organiserName: "Organiser", status: "confirmed",
    startDateTime: "2026-10-15T14:00:00.000Z", endDateTime: "2026-10-15T17:00:00.000Z",
    expectedAttendance: 80, venueRequirements: { minCapacity: 120, accessibility: [], facilities: [], layout: "" },
    equipmentNeeds: "", registrationEnabled: true, registrationOpensAt: "2026-10-01T09:00:00.000Z",
    registrationClosesAt: "2026-10-14T23:59:00.000Z", availableRegistrationSpots: 17,
    changeRequests: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...overrides,
  };
}

describe("SPM-99 attendee event-view lifecycle", () => {
  // EVENT-VIEW-02-A: before the window is not registerable.
  it("shows not yet open before registration starts", () => {
    expect(registrationState(event(), new Date("2026-09-24T15:00:00.000Z"))).toBe("not-yet-open");
  });

  // EVENT-VIEW-02-B/C: the opening instant is inclusive and remains open inside the window.
  it.each(["2026-10-01T09:00:00.000Z", "2026-10-07T12:00:00.000Z"])("opens at and within the registration window (%s)", (now) => {
    expect(registrationState(event(), new Date(now))).toBe("open");
  });

  // EVENT-VIEW-02-D: after the closing time registration is closed.
  it("closes after the registration window", () => {
    expect(registrationState(event(), new Date("2026-10-15T00:00:00.000Z"))).toBe("closed");
  });

  // EVENT-VIEW-02-D: the agreed policy keeps the exact closing instant open;
  // only an instant after it is closed. This prevents an accidental >= change.
  it("keeps registration open at the exact closing instant", () => {
    expect(registrationState(event(), new Date("2026-10-14T23:59:00.000Z"))).toBe("open");
  });

  // EVENT-VIEW-03-A/B/C: remaining places use the registration limit, including 1 and 0 boundaries.
  it.each([[17, "open"], [1, "open"], [0, "full"]] as const)("uses %i available registration spots to determine %s", (spots, state) => {
    expect(registrationState(event({ availableRegistrationSpots: spots }), new Date("2026-10-07T12:00:00.000Z"))).toBe(state);
  });

  // EVENT-VIEW-04-B: a cancelled event wins over an otherwise-open window.
  it("closes registration for cancelled and completed events", () => {
    const now = new Date("2026-10-07T12:00:00.000Z");
    expect(registrationState(event({ status: "cancelled" }), now)).toBe("closed");
    expect(registrationState(event({ status: "completed" }), now)).toBe("closed");
  });

  it("handles disabled registration and uses expected attendance for legacy events", () => {
    const now = new Date("2026-10-07T12:00:00.000Z");
    expect(registrationState(event({ registrationEnabled: false }), now)).toBe("disabled");
    expect(registrationState(event({ availableRegistrationSpots: undefined, expectedAttendance: 0 }), now)).toBe("full");
    expect(registrationState(event({ registrationOpensAt: undefined, registrationClosesAt: undefined }), now)).toBe("open");
  });

  it("provides attendee lifecycle labels for upcoming, in-progress, completed, and cancelled events", () => {
    expect(attendeeEventStatus(event(), new Date("2026-10-01T00:00:00.000Z"))).toBe("Upcoming");
    expect(attendeeEventStatus(event(), new Date("2026-10-15T15:00:00.000Z"))).toBe("In Progress");
    expect(attendeeEventStatus(event(), new Date("2026-10-15T17:00:00.000Z"))).toBe("Completed");
    expect(attendeeEventStatus(event({ status: "completed" }), new Date("2026-10-01T00:00:00.000Z"))).toBe("Completed");
    expect(attendeeEventStatus(event({ status: "cancelled" }), new Date("2026-10-01T00:00:00.000Z"))).toBe("Cancelled");
  });

  it("maps every registration state to its attendee-facing notice", () => {
    expect(registrationStateLabel("not-yet-open")).toBe("Registration Not Yet Open");
    expect(registrationStateLabel("open")).toBe("Registration Open");
    expect(registrationStateLabel("closed")).toBe("Registration Closed");
    expect(registrationStateLabel("full")).toBe("Registration Full");
    expect(registrationStateLabel("disabled")).toBe("Registration Unavailable");
  });
});
