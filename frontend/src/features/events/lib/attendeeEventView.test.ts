import { describe, expect, it } from "vitest";
import type { EventRecord, Registration } from "@/types";
import {
  attendeeAction,
  accessibilityIcon,
  attendeeRegistrationLabel,
  formatDeadline,
} from "./attendeeEventView";

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const NOW = new Date(2026, 9, 16, 10, 0);

function event(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "EVT-1",
    name: "Cloud Basics",
    purpose: "p",
    description: "d",
    organiserId: "o",
    organiserName: "Org",
    status: "confirmed",
    startDateTime: local(2026, 11, 12, 8),
    endDateTime: local(2026, 11, 12, 17),
    expectedAttendance: 40,
    venueRequirements: { minCapacity: 40, accessibility: [], facilities: [], layout: "Theatre" },
    equipmentNeeds: "",
    registrationEnabled: true,
    registrationOpensAt: local(2026, 10, 1),
    registrationClosesAt: local(2026, 11, 5, 23, 59),
    availableRegistrationSpots: 20,
    registrationLimit: 40,
    createdAt: local(2026, 9, 15),
    updatedAt: local(2026, 10, 2),
    ...overrides,
  } as EventRecord;
}

const reg = (status: string) => ({ status }) as unknown as Registration;

describe("attendeeAction", () => {
  it.each(["registered", "waitlisted", "withdrawn", "cancelled"])(
    "hides the footer control for a %s attendee",
    (status) => {
      expect(attendeeAction(event(), NOW, reg(status))).toEqual({ kind: "hidden" });
    },
  );

  it("hides the control when website registration is off", () => {
    expect(attendeeAction(event({ registrationEnabled: false }), NOW)).toEqual({ kind: "hidden" });
  });

  it("offers register for an open event with spots", () => {
    expect(attendeeAction(event(), NOW)).toEqual({ kind: "register" });
  });

  it("still offers register to an attendee whose earlier registration has another status", () => {
    expect(attendeeAction(event(), NOW, reg("rejected"))).toEqual({ kind: "register" });
  });

  it("disables the control with the opening time before registration opens", () => {
    const e = event({ registrationOpensAt: local(2026, 10, 20, 9, 0) });
    expect(attendeeAction(e, NOW)).toEqual({
      kind: "disabled",
      reason: `Registration opens ${formatDeadline(e.registrationOpensAt!)}`,
      waitlistAvailable: false,
    });
    expect(formatDeadline(e.registrationOpensAt!)).toBe("20 Oct 2026, 9:00am");
  });

  it("disables the control as closed after the deadline", () => {
    const e = event({ registrationClosesAt: local(2026, 10, 10) });
    expect(attendeeAction(e, NOW)).toEqual({
      kind: "disabled",
      reason: "Registration has closed",
      waitlistAvailable: false,
    });
  });

  it("disables the control as closed for a cancelled event", () => {
    expect(attendeeAction(event({ status: "cancelled" }), NOW)).toMatchObject({
      kind: "disabled",
      reason: "Registration has closed",
    });
  });

  it("disables the control as full and reports waitlist availability", () => {
    const full = event({ availableRegistrationSpots: 0 });
    expect(attendeeAction({ ...full, waitlistAvailable: true } as EventRecord, NOW)).toEqual({
      kind: "disabled",
      reason: "This event is full.",
      waitlistAvailable: true,
    });
    expect(attendeeAction(full, NOW)).toEqual({
      kind: "disabled",
      reason: "This event is full.",
      waitlistAvailable: false,
    });
  });

  it("treats the isFull flag as full even when spots remain", () => {
    expect(attendeeAction({ ...event(), isFull: true } as EventRecord, NOW)).toMatchObject({
      kind: "disabled",
      reason: "This event is full.",
    });
  });
});

describe("attendeeRegistrationLabel", () => {
  it("is null for an event that is not confirmed", () => {
    expect(attendeeRegistrationLabel(event({ status: "cancelled" }), NOW)).toBeNull();
  });

  it("reads open while the window is open and when the event is full", () => {
    expect(attendeeRegistrationLabel(event(), NOW)).toBe("Registration open");
    expect(attendeeRegistrationLabel(event({ availableRegistrationSpots: 0 }), NOW)).toBe("Registration open");
  });

  it("reads opening soon when disabled or not yet open", () => {
    expect(attendeeRegistrationLabel(event({ registrationEnabled: false }), NOW)).toBe("Registration opening soon");
    expect(attendeeRegistrationLabel(event({ registrationOpensAt: local(2026, 10, 20) }), NOW)).toBe(
      "Registration opening soon",
    );
  });

  it("reads closed after the deadline", () => {
    expect(attendeeRegistrationLabel(event({ registrationClosesAt: local(2026, 10, 10) }), NOW)).toBe(
      "Registration closed",
    );
  });
});

describe("accessibilityIcon", () => {
  it.each([
    ["Wheelchair ramp", "access"],
    ["Hearing loop", "hearing"],
    ["Braille signage", "vision"],
    ["High contrast display", "vision"],
    ["Quiet room", "check"],
  ])("maps %s to the %s icon", (feature, icon) => {
    expect(accessibilityIcon(feature)).toBe(icon);
  });
});
