// Story: SPM-94 planning arrangements. Labels are coloured by significance:
// awaiting or requested is amber, approved is green, rejected or cancelled is red.
import { describe, expect, it } from "vitest";
import { equipmentLabel, safetyLabel, venueLabel } from "@/features/events/components/StatusLabels";

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
