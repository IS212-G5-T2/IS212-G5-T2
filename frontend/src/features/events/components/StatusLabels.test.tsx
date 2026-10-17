// Story: SPM-94 planning arrangements. Labels are coloured by significance:
// awaiting or requested is amber, approved is green, rejected or cancelled is red.
import { describe, expect, it } from "vitest";
import { cardArrangementLabels, equipmentLabel, safetyLabel, venueLabel } from "@/features/events/components/StatusLabels";

describe("planning state labels by significance", () => {
  // Kills: a pending venue request shown as approved (green) instead of requested (amber).
  it.each([
    [{ status: "Booked", requestStatus: "pending" }, "Requested", "amber"],
    [{ status: "Booked", requestStatus: "approved" }, "Approved", "green"],
    [{ status: "Unavailable", requestStatus: "rejected" }, "Rejected", "red"],
    [{ status: "Cancelled", requestStatus: "released" }, "Cancelled", "red"],
  ] as const)("venue %j is %s (%s)", (booking, label, tone) => {
    expect(venueLabel(booking)).toEqual({ label, tone });
  });

  it.each([
    ["Requested", "amber"],
    ["Reserved", "green"],
    ["Unavailable", "red"],
    ["Cancelled", "red"],
  ] as const)("equipment %s is %s", (status, tone) => {
    expect(equipmentLabel(status)).toEqual({ label: status, tone });
  });

  it.each([
    ["pending", "Awaiting Safety Officer check", "amber"],
    ["changes_needed", "Changes requested", "amber"],
    ["approved", "Approved", "green"],
    ["not_requested", "Not requested", "gray"],
  ] as const)("safety %s is %s", (status, label, tone) => {
    expect(safetyLabel(status)).toEqual({ label, tone });
  });
});

describe("card labels name the resource and its state", () => {
  it("TRACK-EVENT-STATUS-01-A CARD: a pending venue and a requested item read as awaiting requests", () => {
    expect(cardArrangementLabels({ venueRequestStatus: "pending", equipmentStatuses: ["Requested", "Reserved"] })).toEqual([
      { label: "Awaiting venue request", tone: "amber" },
      { label: "Awaiting equipment request", tone: "amber" },
      { label: "Equipment reserved", tone: "green" },
    ]);
  });

  it("TRACK-EVENT-STATUS-01-A CARD: an approved venue reads as venue reserved", () => {
    expect(cardArrangementLabels({ venueRequestStatus: "approved", equipmentStatuses: [] })).toEqual([
      { label: "Venue reserved", tone: "green" },
    ]);
  });

  it("TRACK-EVENT-STATUS-01-A CARD: a rejected venue and unavailable or cancelled items read as red", () => {
    expect(cardArrangementLabels({ venueRequestStatus: "rejected", equipmentStatuses: ["Unavailable", "Cancelled"] })).toEqual([
      { label: "Venue rejected", tone: "red" },
      { label: "Equipment unavailable", tone: "red" },
      { label: "Equipment cancelled", tone: "red" },
    ]);
  });
});
