/*
 * SPM-136 AC1 and AC3 (frontend rule): who is offered Cancel Event and on which statuses.
 * Literals come from the Confluence cases CANCEL-EVENT-01-C (F) and 03-B; not from the implementation.
 */
import { describe, expect, it } from "vitest";
import { canCancelEvent } from "@/features/events/lib/cancellation";
import type { EventRecord } from "@/types";

const base = {
  id: "00000000-0000-4000-8000-000000000301",
  name: "Annual Gala Dinner",
  organiserId: "org-01",
  coordinatorId: "coo-01",
  status: "confirmed",
} as unknown as EventRecord;

const coordinator = { id: "coo-01", role: "coordinator", roles: ["coordinator"] };
const organiser = { id: "org-01", role: "organiser", roles: ["organiser"] };

describe("SPM-136 canCancelEvent", () => {
  it("CANCEL-EVENT-01-A (FE): the assigned coordinator is offered Cancel Event", () => {
    expect(canCancelEvent({ event: base, currentUser: coordinator })).toBe(true);
  });

  it("CANCEL-EVENT-01-B (FE): the submitting organiser is offered Cancel Event", () => {
    expect(canCancelEvent({ event: base, currentUser: organiser })).toBe(true);
  });

  it.each([
    ["COO-02, not assigned", { id: "coo-02", role: "coordinator", roles: ["coordinator"] }],
    ["ORG-02, another organiser", { id: "org-02", role: "organiser", roles: ["organiser"] }],
    ["LEAD-01, Coordinator Lead", { id: "lead-01", role: "coordinator_lead", roles: ["coordinator_lead"] }],
    ["ATT-01, attendee", { id: "att-01", role: "attendee", roles: ["attendee"] }],
  ])("CANCEL-EVENT-01-C (F): %s is not offered Cancel Event", (_label, user) => {
    expect(canCancelEvent({ event: base, currentUser: user })).toBe(false);
  });

  it.each(["submitted", "approved", "planning", "confirmed"])("CANCEL-EVENT-03-B: %s is offered for the assigned coordinator", (status) => {
    expect(canCancelEvent({ event: { ...base, status } as EventRecord, currentUser: coordinator })).toBe(true);
  });

  it.each(["completed", "rejected", "cancelled", "draft"])("CANCEL-EVENT-03-B: %s is not offered Cancel Event", (status) => {
    expect(canCancelEvent({ event: { ...base, status } as EventRecord, currentUser: coordinator })).toBe(false);
  });
});
