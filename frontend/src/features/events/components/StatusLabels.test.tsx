// Story: SPM-94 planning arrangements. Labels are coloured by significance:
// awaiting or requested is amber, approved is green, rejected or cancelled is red.
import { describe, expect, it } from "vitest";
import { arrangementsReserved, cardArrangementLabels, equipmentLabel, safetyCheckReady, safetyLabel, venueLabel } from "@/features/events/components/StatusLabels";

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

  // Kills: an equipment status mapped to the wrong label or tone (e.g. Reserved shown amber, Requested shown green).
  it.each([
    ["Requested", "amber"],
    ["Reserved", "green"],
    ["Unavailable", "red"],
  ] as const)("equipment %s is %s", (status, tone) => {
    expect(equipmentLabel(status)).toEqual({ label: status, tone });
  });

  // Kills: a safety status mapped to the wrong label or tone (e.g. approved shown amber, pending shown green).
  it.each([
    ["pending", "Awaiting Safety Officer Check", "amber"],
    ["changes_needed", "Changes Requested", "amber"],
    ["approved", "Approved", "green"],
    ["not_requested", "Not Requested", "gray"],
  ] as const)("safety %s is %s", (status, label, tone) => {
    expect(safetyLabel(status)).toEqual({ label, tone });
  });

  /** MONITOR-QUEUE-07-C (SPM-48 AC7): a rejected safety arrangement is labelled Rejected in red, not "Not Requested". */
  it("MONITOR-QUEUE-07-C labels a rejected safety check Rejected (red)", () => {
    expect(safetyLabel("rejected")).toEqual({ label: "Rejected", tone: "red" });
  });

  // Kills: cancelled equipment labelled Cancelled or gray instead of red Unavailable, or unknown equipment given a red tone.
  /** Equipment cancellation and unknown statuses retain their red and gray labels. */
  it("labels cancelled equipment unavailable and unknown equipment with a neutral label", () => {
    expect(equipmentLabel("Cancelled")).toEqual({ label: "Unavailable", tone: "red" });
    expect(equipmentLabel("Other")).toEqual({ label: "Other", tone: "gray" });
  });
});

describe("shared arrangement readiness helpers", () => {
  // Kills: arrangementsReserved true without every condition (empty equipment, pending venue, or a non-planning status).
  /** All equipment must be reserved and the event must be planning with an approved venue. */
  it("marks arrangements reserved only when all required conditions hold", () => {
    expect(arrangementsReserved({ status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"] })).toBe(true);
    expect(arrangementsReserved({ status: "planning", venueRequestStatus: "approved", equipmentStatuses: [] })).toBe(false);
    expect(arrangementsReserved({ status: "planning", venueRequestStatus: "pending", equipmentStatuses: ["Reserved"] })).toBe(false);
    expect(arrangementsReserved({ status: "approved", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"] })).toBe(false);
    expect(arrangementsReserved({ status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Requested"] })).toBe(false);
  });

  // Kills: safetyCheckReady true while equipment is Requested or the venue is pending.
  /** A planning event with an approved venue is ready when each equipment item is reserved, including none needed. */
  it("allows safety checks only when the venue and all equipment prerequisites are ready", () => {
    expect(safetyCheckReady({ status: "planning", venueRequestStatus: "approved", equipmentStatuses: [] })).toBe(true);
    expect(safetyCheckReady({ status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"] })).toBe(true);
    expect(safetyCheckReady({ status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Requested"] })).toBe(false);
    expect(safetyCheckReady({ status: "planning", venueRequestStatus: "pending", equipmentStatuses: ["Reserved"] })).toBe(false);
    expect(safetyCheckReady({ status: "approved", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"] })).toBe(false);
  });

  // Kills: an event with no equipment list (the field is optional) throws in the readiness helpers, or is reported as reserved.
  /** VEN-BKG-08-A: an approved venue on a planning event whose equipment list is absent is not reserved, and its safety check is ready. */
  it("VEN-BKG-08-A SPM-54 treats an absent equipment list as no equipment for readiness", () => {
    expect(arrangementsReserved({ status: "planning", venueRequestStatus: "approved" })).toBe(false);
    expect(safetyCheckReady({ status: "planning", venueRequestStatus: "approved" })).toBe(true);
  });
});

describe("card labels name the resource and its state", () => {
  // Kills: a planning event with venue and equipment reserved shown as separate labels instead of one combined label.
  it("TRACK-EVENT-STATUS-01-A CARD: a planning event with venue and all equipment reserved shows one combined label", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved", "Reserved"] })).toEqual([
      { label: "Equipment & Venue Reserved", tone: "green" },
    ]);
  });

  // Kills: venue or equipment labels shown for submitted, approved or confirmed events (phase check removed).
  it("TRACK-EVENT-STATUS-01-A CARD: venue and equipment labels are shown only in the planning phase", () => {
    expect(cardArrangementLabels({ status: "submitted", venueRequestStatus: "pending", equipmentStatuses: ["Requested"] })).toEqual([]);
    expect(cardArrangementLabels({ status: "approved", venueRequestStatus: "rejected", equipmentStatuses: ["Unavailable"] })).toEqual([]);
    expect(cardArrangementLabels({ status: "confirmed", venueRequestStatus: null, equipmentStatuses: [] })).toEqual([]);
  });

  // Kills: a Reserved label shown for a confirmed event.
  it("TRACK-EVENT-STATUS-01-A CARD: reserved labels are not shown outside the planning phase", () => {
    expect(cardArrangementLabels({ status: "confirmed", venueRequestStatus: "approved", equipmentStatuses: ["Reserved"] })).toEqual([]);
  });

  // Kills: a pending venue or a requested item rendered green or merged into a single combined label.
  it("TRACK-EVENT-STATUS-01-A CARD: a pending venue and a requested item read as awaiting requests", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: "pending", equipmentStatuses: ["Requested", "Reserved"] })).toEqual([
      { label: "Awaiting Venue Request", tone: "amber" },
      { label: "Awaiting Equipment Request", tone: "amber" },
    ]);
  });

  // Kills: an extra equipment label shown with no equipment, or the venue awaiting label omitted when the venue is missing.
  it("TRACK-EVENT-STATUS-01-A CARD: a planning event with no venue and no equipment shows only the venue awaiting label", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: null, equipmentStatuses: [] })).toEqual([
      { label: "Awaiting Venue Request", tone: "amber" },
    ]);
  });

  // Kills: a rejected venue or unavailable or cancelled equipment shown amber or green instead of red.
  it("TRACK-EVENT-STATUS-01-A CARD: a rejected venue and unavailable or cancelled items read as red", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: "rejected", equipmentStatuses: ["Unavailable", "Cancelled"] })).toEqual([
      { label: "Venue Unavailable", tone: "red" },
      { label: "Equipment Unavailable", tone: "red" },
    ]);
  });

  // Kills: a Cancelled booking labelled Reserved or Approved because its request status is approved.
  /** VEN-BKG-08-A: a cancelled booking is unavailable even if its request retains approved status. */
  it("VEN-BKG-08-A SPM-54 labels a Cancelled booking as unavailable when request status is approved", () => {
    expect(venueLabel({ status: "Cancelled", requestStatus: "approved" })).toEqual({
      label: "Unavailable",
      tone: "red",
    });
  });

  // Kills: an approved venue with no equipment dropped from the card labels, or labelled with another tone.
  /** VEN-BKG-08-A: an approved venue without equipment is still shown as reserved on the event card. */
  it("VEN-BKG-08-A SPM-54 labels an approved venue as reserved when no equipment is needed", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: "approved" })).toEqual([
      { label: "Venue Reserved", tone: "green" },
    ]);
  });

  // Kills: a cancelled event venue shown as Reserved, or the red Venue Unavailable label omitted.
  /** VEN-BKG-09-A: an event card reports its cancelled venue as unavailable, not reserved. */
  it("VEN-BKG-09-A SPM-54 labels a cancelled event venue as unavailable on the card", () => {
    expect(cardArrangementLabels({ status: "planning", venueRequestStatus: "cancelled", equipmentStatuses: ["Reserved"] })).toEqual([
      { label: "Equipment Reserved", tone: "green" },
      { label: "Venue Unavailable", tone: "red" },
    ]);
  });
});
