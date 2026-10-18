/*
 * SPM-95 Filter My Events by Status (Organiser): the status filter options and the OR matching rule.
 * Literals come from the Jira acceptance criteria (AC2, AC5), not from the implementation.
 * Confluence matrix: FILTER-EVT-01-A through FILTER-EVT-05-F (records/SPM-95.csv).
 */
import { describe, expect, it } from "vitest";
import {
  ORGANISER_STATUS_FILTERS,
  matchesOrganiserStatusFilters,
  type OrganiserStatusFilter,
} from "@/features/events/lib/organiserStatusFilter";
import type { EventRecord } from "@/types";

function event(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: "00000000-0000-4000-8000-000000000095",
    name: "Filter Test Event",
    organiserId: "current-user",
    status: "submitted",
    safetyIndicator: null,
    ...overrides,
  } as unknown as EventRecord;
}

describe("SPM-95 organiser status filter options", () => {
  /** SPM-95 AC5: the virtual Awaiting Safety Check option sits beside the real statuses; draft is excluded because SPM-94 shows drafts separately. */
  it("FILTER-EVT-05-A: offers the seven real statuses except draft, plus Awaiting Safety Check", () => {
    expect(ORGANISER_STATUS_FILTERS.map((option) => option.label)).toEqual([
      "Submitted",
      "Approved",
      "Planning",
      "Confirmed",
      "Completed",
      "Rejected",
      "Cancelled",
      "Awaiting Safety Check",
    ]);
  });
});

describe("SPM-95 AC2: matching rule for the selected filters", () => {
  /** SPM-95 AC1: with no filter selected every event matches, so the list shows all of the organiser's events. */
  it("FILTER-EVT-01-A: an empty selection matches every event", () => {
    const none = new Set<OrganiserStatusFilter>();

    expect(matchesOrganiserStatusFilters(event({ status: "approved" }), none)).toBe(true);
    expect(matchesOrganiserStatusFilters(event({ status: "cancelled" }), none)).toBe(true);
  });

  /** SPM-95 AC2: a status filter matches only events in that status. */
  it("FILTER-EVT-02-A: a single status selection matches only events in that status", () => {
    const approved = new Set<OrganiserStatusFilter>(["approved"]);

    expect(matchesOrganiserStatusFilters(event({ status: "approved" }), approved)).toBe(true);
    expect(matchesOrganiserStatusFilters(event({ status: "planning" }), approved)).toBe(false);
  });

  /** SPM-95 AC2: with several filters selected, an event matches when it satisfies any one of them (OR, not AND). */
  it("FILTER-EVT-02-B: several selections match an event that satisfies any one of them", () => {
    const pair = new Set<OrganiserStatusFilter>(["submitted", "approved"]);

    expect(matchesOrganiserStatusFilters(event({ status: "submitted" }), pair)).toBe(true);
    expect(matchesOrganiserStatusFilters(event({ status: "approved" }), pair)).toBe(true);
    expect(matchesOrganiserStatusFilters(event({ status: "confirmed" }), pair)).toBe(false);
  });
});

describe("SPM-95 AC5: the Awaiting Safety Check virtual filter", () => {
  /** SPM-95 AC5: Awaiting Safety Check matches only events whose safety indicator is AWAITING_CHECK and whose arrangements are all reserved. */
  it("FILTER-EVT-05-B: Awaiting Safety Check matches only events with AWAITING_CHECK and all arrangements reserved", () => {
    const safety = new Set<OrganiserStatusFilter>(["awaitingSafetyCheck"]);
    const reserved = { status: "planning" as const, venueRequestStatus: "approved" as const, equipmentStatuses: ["Reserved"] };

    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "AWAITING_CHECK", ...reserved }), safety)).toBe(true);
    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "AWAITING_CHECK", status: "planning", venueRequestStatus: "approved" as const, equipmentStatuses: [] }), safety)).toBe(true);
    // Intentional business rule: the filter means "awaiting a first check", so CLEARED and no indicator must not match.
    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "CLEARED", ...reserved }), safety)).toBe(false);
    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: null, ...reserved }), safety)).toBe(false);
    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "AWAITING_CHECK", status: "planning", venueRequestStatus: "approved" as const, equipmentStatuses: ["Requested"] }), safety)).toBe(false);
    // CHANGES_REQUESTED is a follow-up state, not an initial awaiting; only AWAITING_CHECK triggers this filter
    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "CHANGES_REQUESTED", ...reserved }), safety)).toBe(false);
  });

  /** SPM-95 AC5: a venue that is not approved keeps an event out of Awaiting Safety Check, whatever the equipment state. */
  // FILTER-EVT-05-C (parameterised)
  it.each([
    ["pending", ["Reserved"]],
    ["pending", []],
    ["rejected", ["Reserved"]],
    ["rejected", []],
    [null, ["Reserved"]],
    [null, []],
  ] as const)("SPM-95 AC5: venue %s with equipment %j does not match Awaiting Safety Check", (venueRequestStatus, equipmentStatuses) => {
    const safety = new Set<OrganiserStatusFilter>(["awaitingSafetyCheck"]);

    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "AWAITING_CHECK", status: "planning", venueRequestStatus, equipmentStatuses: [...equipmentStatuses] }), safety)).toBe(false);
  });

  /** SPM-95 AC5: every arrangement must be Reserved; one Requested or Unavailable item keeps the event out. */
  it("FILTER-EVT-05-D: a mix of Reserved and another equipment state does not match Awaiting Safety Check", () => {
    const safety = new Set<OrganiserStatusFilter>(["awaitingSafetyCheck"]);

    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "AWAITING_CHECK", status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved", "Requested"] }), safety)).toBe(false);
    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "AWAITING_CHECK", status: "planning", venueRequestStatus: "approved", equipmentStatuses: ["Reserved", "Unavailable"] }), safety)).toBe(false);
  });

  /** SPM-95 AC5: Awaiting Safety Check is a planning-phase filter; an event past Planning does not match even with everything reserved. */
  // FILTER-EVT-05-E (parameterised)
  it.each(["approved", "confirmed"] as const)("FILTER-EVT-05-E: status %s does not match Awaiting Safety Check even with venue approved and equipment Reserved", (status) => {
    const safety = new Set<OrganiserStatusFilter>(["awaitingSafetyCheck"]);

    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "AWAITING_CHECK", status, venueRequestStatus: "approved", equipmentStatuses: ["Reserved"] }), safety)).toBe(false);
  });

  /** SPM-95 AC2 and AC5: the virtual filter combines with a status filter under the same OR rule. */
  it("FILTER-EVT-05-F: a virtual filter and a status filter together match an event that satisfies either", () => {
    const reserved = { status: "planning" as const, venueRequestStatus: "approved" as const, equipmentStatuses: ["Reserved"] };
    const mixed = new Set<OrganiserStatusFilter>(["awaitingSafetyCheck", "approved"]);

    expect(matchesOrganiserStatusFilters(event({ status: "approved" }), mixed)).toBe(true);
    expect(matchesOrganiserStatusFilters(event({ safetyIndicator: "AWAITING_CHECK", ...reserved }), mixed)).toBe(true);
    expect(matchesOrganiserStatusFilters(event({ status: "submitted" }), mixed)).toBe(false);
  });
});
