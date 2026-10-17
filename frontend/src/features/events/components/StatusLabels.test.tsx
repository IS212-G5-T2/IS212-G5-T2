// Story: SPM-94 planning arrangements. Labels are coloured by significance:
// awaiting or requested is amber, approved is green, rejected or cancelled is red.
import { describe, expect, it } from "vitest";
import { cardArrangementLabels, equipmentLabel, safetyLabel, venueLabel } from "@/features/events/components/StatusLabels";

describe("planning state labels by significance", () => {
  // Kills: a pending venue request shown as approved (green) instead of requested (amber).
  it.each([
    [{ status: "Booked", requestStatus: "pending" }, "Requested", "amber"],
    [{ status: "Booked", requestStatus: "approved" }, "Reserved", "green"],
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

describe("card labels show only the states that need attention", () => {
  // Kills: approved or reserved shown on the card (they need no action), or a requested state dropped.
  it("TRACK-EVENT-STATUS-01-A CARD: a pending venue and a requested projector show as amber; approved and reserved do not", () => {
    expect(cardArrangementLabels({ venueRequestStatus: "pending", equipmentStatuses: ["Requested", "Reserved"] })).toEqual([
      { label: "Requested", tone: "amber" }, // the venue request
      { label: "Requested", tone: "amber" }, // the requested equipment; the reserved item is left off the card
    ]);
    expect(cardArrangementLabels({ venueRequestStatus: "approved", equipmentStatuses: ["Reserved"] })).toEqual([]);
  });

  it("TRACK-EVENT-STATUS-01-A CARD: a rejected venue and an unavailable item show as red", () => {
    expect(cardArrangementLabels({ venueRequestStatus: "rejected", equipmentStatuses: ["Unavailable", "Cancelled"] })).toEqual([
      { label: "Rejected", tone: "red" },
      { label: "Unavailable", tone: "red" },
      { label: "Cancelled", tone: "red" },
    ]);
  });
});
