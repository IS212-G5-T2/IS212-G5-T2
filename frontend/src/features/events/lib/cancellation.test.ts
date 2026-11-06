/*
 * SPM-136 AC1 and AC3 (frontend rule): who is offered Cancel Event and on which statuses.
 * Literals come from the Confluence cases CANCEL-EVENT-01-C (F) and 03-B; not from the implementation.
 * Mutant IDs in each "Kills:" line are defined in frontend/scripts/testing/mutation/spm136.mutants.mjs.
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
  // Kills: F24 (the assigned-coordinator branch dropped: only the organiser is offered)
  it("CANCEL-EVENT-01-A (FE): the assigned coordinator is offered Cancel Event", () => {
    // Act: the assigned coordinator is checked against the event
    const offered = canCancelEvent({ event: base, currentUser: coordinator });

    // Assert: the assigned coordinator is offered the action
    expect(offered).toBe(true);
  });

  // Kills: F25 (the submitting organiser is offered Cancel Event)
  it("CANCEL-EVENT-01-B (FE): the submitting organiser is not offered Cancel Event", () => {
    // Act: the submitting organiser is checked against the event
    const offered = canCancelEvent({ event: base, currentUser: organiser });

    // Assert: the submitting organiser is not offered the action
    expect(offered).toBe(false);
  });

  // Kills: F26 (the assigned-coordinator id check dropped: COO-02 is offered), F1 (LEAD-01 row), F2 (ORG-02 row),
  // F27 (the attendee ATT-01 row: an attendee is offered the action), F25 (the submitting organiser row)
  it.each([
    ["COO-02, not assigned", { id: "coo-02", role: "coordinator", roles: ["coordinator"] }],
    ["ORG-01, the submitting organiser", organiser],
    ["ORG-02, another organiser", { id: "org-02", role: "organiser", roles: ["organiser"] }],
    ["LEAD-01, Coordinator Lead", { id: "lead-01", role: "coordinator_lead", roles: ["coordinator_lead"] }],
    ["ATT-01, attendee", { id: "att-01", role: "attendee", roles: ["attendee"] }],
  ])("CANCEL-EVENT-01-C-F: %s is not offered Cancel Event", (_label, user) => {
    // Act: the user is checked against the event
    const offered = canCancelEvent({ event: base, currentUser: user });

    // Assert: the user is not offered the action
    expect(offered).toBe(false);
  });

  // Kills: F3 (approved dropped), F29 (submitted dropped), F30 (planning dropped), F31 (confirmed dropped)
  it.each(["submitted", "approved", "planning", "confirmed"])("CANCEL-EVENT-03-B: %s is offered for the assigned coordinator", (status) => {
    // Act: the assigned coordinator is checked against an event in this status
    const offered = canCancelEvent({ event: { ...base, status } as EventRecord, currentUser: coordinator });

    // Assert: each cancellable status is offered to the assigned coordinator
    expect(offered).toBe(true);
  });

  // Kills: F32 (a deny-list instead of the allow-list: draft is offered), F33 (cancelled allowed), F34 (completed
  // allowed), F35 (rejected allowed)
  it.each(["completed", "rejected", "cancelled", "draft"])("CANCEL-EVENT-03-B: %s is not offered Cancel Event", (status) => {
    // Act: the assigned coordinator is checked against an event in this status
    const offered = canCancelEvent({ event: { ...base, status } as EventRecord, currentUser: coordinator });

    // Assert: each non-cancellable status is not offered the action
    expect(offered).toBe(false);
  });
});
