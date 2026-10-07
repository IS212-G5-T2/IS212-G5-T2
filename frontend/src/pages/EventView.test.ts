import { describe, expect, it } from "vitest";
import type { EventRecord } from "@/types";
import { attendeeEventStatus, matchesAttendeeFilter, registrationState, registrationStateLabel } from "./EventView";

function event(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "event-1", name: "Inclusive Arts Workshop", purpose: "Creative expression", description: "Workshop",
    organiserId: "organiser-1", organiserName: "Organiser", status: "confirmed",
    startDateTime: "2027-03-13T05:00:00.000Z", endDateTime: "2027-03-13T08:00:00.000Z",
    expectedAttendance: 45, venueRequirements: { minCapacity: 120, accessibility: [], facilities: [], layout: "" },
    equipmentNeeds: "", registrationEnabled: true, registrationOpensAt: "2027-03-01T01:00:00.000Z",
    registrationClosesAt: "2027-03-12T15:59:00.000Z", availableRegistrationSpots: 45,
    changeRequests: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...overrides,
  };
}

describe("SPM-99 attendee event-view lifecycle", () => {
  // EVENT-VIEW-05-A: one second before opening, the attendee sees the pre-open state.
  it("shows not yet open immediately before registration starts", () => {
    expect(registrationState(event(), new Date("2027-03-01T00:59:59.000Z"))).toBe("not-yet-open");
  });

  // EVENT-VIEW-05-B: the opening instant ends the pre-open state.
  it("opens at the exact registration opening instant", () => {
    expect(registrationState(event(), new Date("2027-03-01T01:00:00.000Z"))).toBe("open");
  });

  // EVENT-VIEW-03-A cross-check: an event within the displayed window can be open.
  it("stays open inside the configured registration window", () => {
    expect(registrationState(event(), new Date("2027-03-07T04:00:00.000Z"))).toBe("open");
  });

  // EVENT-VIEW-04-A: the closed notice follows the configured closing time.
  it("closes after the registration window", () => {
    expect(registrationState(event(), new Date("2027-03-12T16:00:00.000Z"))).toBe("closed");
  });

  // EVENT-VIEW-04-B: a time just before closing must not be labelled closed.
  it("remains open one second before the closing instant", () => {
    expect(registrationState(event(), new Date("2027-03-12T15:58:59.000Z"))).toBe("open");
  });

  // SPM-61 EVENT-REG-01-BND-1[D] (replaces the SPM-99 inclusive-close policy, D6):
  // the exact closing instant is closed.
  it("closes registration at the exact closing instant", () => {
    expect(registrationState(event(), new Date("2027-03-12T15:59:00.000Z"))).toBe("closed");
  });

  // EVENT-VIEW-02-C/D: one available spot is open and zero spots is full.
  it.each([[1, "open"], [0, "full"]] as const)("uses %i remaining spots to determine %s", (spots, state) => {
    expect(registrationState(event({ availableRegistrationSpots: spots }), new Date("2027-03-07T04:00:00.000Z"))).toBe(state);
  });

  // Cross-dependency path: cancellation or completion blocks registration even during an open window.
  it("closes registration for cancelled and completed events", () => {
    const now = new Date("2027-03-07T04:00:00.000Z");
    expect(registrationState(event({ status: "cancelled" }), now)).toBe("closed");
    expect(registrationState(event({ status: "completed" }), now)).toBe("closed");
  });

  // Supplementary negative paths: disabled registration and legacy capacity remain explicit.
  it("handles disabled registration and legacy capacity", () => {
    const now = new Date("2027-03-07T04:00:00.000Z");
    expect(registrationState(event({ registrationEnabled: false }), now)).toBe("disabled");
    expect(registrationState(event({ availableRegistrationSpots: undefined, expectedAttendance: 0 }), now)).toBe("full");
    expect(registrationState(event({ registrationOpensAt: undefined, registrationClosesAt: undefined }), now)).toBe("open");
  });

  // EVENT-VIEW-06-A: Confirmed before start is Upcoming.
  it("shows a confirmed event before its start as Upcoming", () => {
    expect(attendeeEventStatus(event(), new Date("2027-03-13T04:00:00.000Z"))).toBe("Upcoming");
  });

  // EVENT-VIEW-06-B: Confirmed between start and end is In Progress.
  it("shows a confirmed event during its schedule as In Progress", () => {
    expect(attendeeEventStatus(event(), new Date("2027-03-13T06:00:00.000Z"))).toBe("In Progress");
  });

  // EVENT-VIEW-06-C: persisted Completed takes precedence over the clock.
  it("shows a completed event as Completed", () => {
    expect(attendeeEventStatus(event({ status: "completed" }), new Date("2027-03-13T04:00:00.000Z"))).toBe("Completed");
    expect(attendeeEventStatus(event(), new Date("2027-03-13T08:00:00.000Z"))).toBe("Completed");
  });

  // EVENT-VIEW-06-D: persisted Cancelled takes precedence over the clock.
  it("shows a cancelled event as Cancelled", () => {
    expect(attendeeEventStatus(event({ status: "cancelled" }), new Date("2027-03-13T04:00:00.000Z"))).toBe("Cancelled");
  });

  // Every decision state must have the corresponding attendee-facing notice.
  it("maps registration states to their notices", () => {
    expect(registrationStateLabel("not-yet-open")).toBe("Registration Not Yet Open");
    expect(registrationStateLabel("open")).toBe("Registration Open");
    expect(registrationStateLabel("closed")).toBe("Registration Closed");
    expect(registrationStateLabel("full")).toBe("Registration Full");
    expect(registrationStateLabel("disabled")).toBe("Registration Unavailable");
  });
});

describe("SPM-61 attendee Browse Events filters", () => {
  const now = new Date("2027-01-01T00:00:00.000Z");
  const future = { startDateTime: "2027-02-01T00:00:00.000Z", endDateTime: "2027-02-01T03:00:00.000Z" };
  const ended = { startDateTime: "2026-12-01T00:00:00.000Z", endDateTime: "2026-12-01T03:00:00.000Z" };
  const matching = (filter: Parameters<typeof matchesAttendeeFilter>[1], overrides: Partial<EventRecord>) =>
    matchesAttendeeFilter(event(overrides), filter, now);

  // Upcoming lists every published future event, registered or not; Approved counts as published.
  it("upcoming shows published future events whether or not I'm registered", () => {
    expect(matching("upcoming", { ...future, status: "confirmed" })).toBe(true);
    expect(matching("upcoming", { ...future, status: "approved" })).toBe(true);
    expect(matching("upcoming", { ...future, status: "confirmed", myRegistrationStatus: "registered" })).toBe(true);
    expect(matching("upcoming", { ...ended, status: "confirmed" })).toBe(false);
    expect(matching("upcoming", { ...future, status: "cancelled" })).toBe(false);
  });

  // Registered Events: registered for, still to come.
  it("registered shows only my future registrations", () => {
    expect(matching("registered", { ...future, myRegistrationStatus: "registered" })).toBe(true);
    expect(matching("registered", { ...future, myRegistrationStatus: "withdrawn" })).toBe(false);
    expect(matching("registered", { ...future })).toBe(false);
    expect(matching("registered", { ...ended, myRegistrationStatus: "registered" })).toBe(false);
    expect(matching("registered", { ...future, status: "cancelled", myRegistrationStatus: "registered" })).toBe(false);
  });

  // Past Events: registered for, and finished by time or by Completed status.
  it("past shows my registrations that have ended or completed", () => {
    expect(matching("past", { ...ended, myRegistrationStatus: "registered" })).toBe(true);
    expect(matching("past", { ...future, status: "completed", myRegistrationStatus: "registered" })).toBe(true);
    expect(matching("past", { ...ended })).toBe(false);
    expect(matching("past", { ...ended, status: "cancelled", myRegistrationStatus: "registered" })).toBe(false);
  });

  // Cancelled: only cancelled events I had registered for.
  it("cancelled shows only cancelled events I registered for", () => {
    expect(matching("cancelled", { ...future, status: "cancelled", myRegistrationStatus: "registered" })).toBe(true);
    expect(matching("cancelled", { ...future, status: "cancelled" })).toBe(false);
  });
});
