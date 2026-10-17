// Story: SPM-94 planning arrangements. Labels are coloured by significance:
// awaiting or requested is amber, approved is green, rejected or cancelled is red.
import { describe, expect, it } from "vitest";
import { cardArrangementLabels, equipmentLabel, safetyLabel, venueLabel } from "@/features/events/components/StatusLabels";

describe("planning state labels by significance", () => {
  // Kills: a pending venue request shown as approved (green) instead of requested (amber).
  it.each([
    [{ status: "Booked", requestStatus: "pending" }, "Requested", "amber"],
    [{ status: "Booked", requestStatus: "approved" }, "Approved", "green"],
    [{ status: "Unavailable", requestStatus: "rejected" }, "Unavailable", "red"],
    [{ status: "Cancelled", requestStatus: "released" }, "Unavailable", "red"],
  ] as const)("venue %j is %s (%s)", (booking, label, tone) => {
    expect(venueLabel(booking)).toEqual({ label, tone });
  });

  it.each([
    ["Requested", "amber"],
    ["Reserved", "green"],
    ["Unavailable", "red"],
  ] as const)("equipment %s is %s", (status, tone) => {
    expect(equipmentLabel(status)).toEqual({ label: status, tone });
  });

  it.each([
    ["pending", "Awaiting Safety Officer Check", "amber"],
    ["changes_needed", "Changes Requested", "amber"],
    ["approved", "Approved", "green"],
    ["not_requested", "Not Requested", "gray"],
  ] as const)("safety %s is %s", (status, label, tone) => {
    expect(safetyLabel(status)).toEqual({ label, tone });
  });
});

describe("card labels name the resource and its state", () => {
  it("TRACK-EVENT-STATUS-01-A CARD: a planning event with venue and all equipment reserved shows one combined label", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved", "Reserved"] })).toEqual([
      { label: "Equipment & Venue Reserved", tone: "green" },
    ]);
  });

  it("TRACK-EVENT-STATUS-01-A CARD: reserved labels are not shown outside the planning phase", () => {
    expect(cardArrangementLabels({ status: "confirmed", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"] })).toEqual([]);
  });

  it("TRACK-EVENT-STATUS-01-A CARD: a pending venue and a requested item read as awaiting requests", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: "pending", equipmentStatuses: ["Requested", "Reserved"] })).toEqual([
      { label: "Awaiting Venue Request", tone: "amber" },
      { label: "Awaiting Equipment Request", tone: "amber" },
    ]);
  });

  it("TRACK-EVENT-STATUS-01-A CARD: a planning event with nothing requested is awaiting both requests", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: null, equipmentStatuses: [] })).toEqual([
      { label: "Awaiting Venue Request", tone: "amber" },
      { label: "Awaiting Equipment Request", tone: "amber" },
    ]);
  });

  it("TRACK-EVENT-STATUS-01-A CARD: a rejected venue and unavailable or cancelled items read as red", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: "rejected", equipmentStatuses: ["Unavailable", "Cancelled"] })).toEqual([
      { label: "Venue Unavailable", tone: "red" },
      { label: "Equipment Unavailable", tone: "red" },
    ]);
  });
});
