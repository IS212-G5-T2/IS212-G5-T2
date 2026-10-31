/*
 * SPM-155 client rules: who is offered Request Cancellation and the decision controls, the status labels, and the
 * reason length. The server stays authoritative. Oracle: docs/specs/SPM-155-test-cases.md and Gate-1 decisions
 * D3 (assigned Coordinator decides), D4 (Closed lines), D5 (eligible set is SPM-136's); labels are ASSUMED text.
 * Mutant IDs in each "Kills:" line are defined in frontend/scripts/testing/mutation/spm155.mutants.mjs.
 */
import { describe, expect, it } from "vitest";
import {
  REASON_MAX,
  canDecideCancellation,
  canRequestCancellation,
  codePointLength,
  listLabelFor,
  statusLabelFor,
} from "@/features/events/lib/cancellationRequests";
import type { EventRecord } from "@/types";

const event = (status: string, over: Partial<EventRecord> = {}) =>
  ({ id: "e1", name: "Hack Night", organiserId: "org-01", coordinatorId: "coo-01", status, ...over }) as unknown as EventRecord;
const org1 = { id: "org-01", role: "organiser" };
const org2 = { id: "org-02", role: "organiser" };
const coo1 = { id: "coo-01", role: "coordinator" };
const coo2 = { id: "coo-02", role: "coordinator" };
const lead = { id: "lead-01", role: "lead" };
const att = { id: "att-01", role: "attendee" };

describe("SPM-155 canRequestCancellation (AC1)", () => {
  // Kills: FM4
  /** CANCEL-REQUEST-01-B (D5): the owning Organiser is offered the action on Submitted, Approved, Planning and Confirmed only. */
  it.each([
    ["submitted", true],
    ["approved", true],
    ["planning", true],
    ["confirmed", true],
    ["completed", false],
    ["cancelled", false],
    ["rejected", false],
    ["draft", false],
  ])("CANCEL-REQUEST-01-B: a %s event offers the action: %s", (status, offered) => {
    // Act / Assert
    expect(canRequestCancellation({ event: event(status), currentUser: org1 })).toBe(offered);
  });

  // Kills: FM5
  /** CANCEL-REQUEST-01-E: only the submitting Organiser is offered the action. */
  it.each([
    ["ORG-02", org2],
    ["COO-01", coo1],
    ["LEAD-01", lead],
    ["ATT-01", att],
  ])("CANCEL-REQUEST-01-E: %s is not offered the action on ORG-01's Approved event", (_label, user) => {
    // Act / Assert
    expect(canRequestCancellation({ event: event("approved"), currentUser: user })).toBe(false);
  });
});

describe("SPM-155 canDecideCancellation (AC3)", () => {
  // Kills: FM6
  /** CANCEL-REQUEST-03-C (D3): only the Coordinator assigned to the event is offered Accept and Decline. */
  it.each([
    ["COO-01, assigned", coo1, true],
    ["COO-02, not assigned", coo2, false],
    ["LEAD-01", lead, false],
    ["ORG-01, the requester", org1, false],
    ["ATT-01", att, false],
  ])("CANCEL-REQUEST-03-C: %s is offered the decision controls: %s", (_label, user, offered) => {
    // Act / Assert
    expect(canDecideCancellation({ event: event("confirmed"), currentUser: user })).toBe(offered);
  });

  // Kills: FM6
  /** CANCEL-REQUEST-01-G: on an unassigned event nobody is offered the decision controls. */
  it("CANCEL-REQUEST-01-G: an unassigned event offers the decision controls to nobody", () => {
    // Act / Assert
    expect(canDecideCancellation({ event: event("submitted", { coordinatorId: undefined }), currentUser: coo1 })).toBe(false);
  });
});

describe("SPM-155 labels and reason length", () => {
  // Kills: FM7
  /** CANCEL-REQUEST-02-A to 02-C: the status words the Organiser reads. */
  it.each([
    ["pending", "Pending"],
    ["accepted", "Accepted"],
    ["declined", "Declined"],
    ["closed", "Closed"],
  ] as const)("CANCEL-REQUEST-02-A: status %s reads %s", (status, label) => {
    // Act / Assert
    expect(statusLabelFor(status)).toBe(label);
  });

  // Kills: FM51
  /** CANCEL-REQUEST-02-A: the event-list indicator (D13b). */
  it.each([
    ["pending", "Cancellation requested"],
    ["accepted", "Cancellation accepted"],
    ["declined", "Cancellation declined"],
    ["closed", "Cancellation request closed"],
  ] as const)("CANCEL-REQUEST-02-A: the list indicator for %s reads %s", (status, label) => {
    // Act / Assert
    expect(listLabelFor(status)).toBe(label);
  });

  // Kills: FM8
  /** CANCEL-REQUEST-01-H: the limit is 500 code points, matching the server. */
  it("CANCEL-REQUEST-01-H: REASON_MAX is 500 and the count is in code points", () => {
    // Assert
    expect(REASON_MAX).toBe(500);
    expect(codePointLength("\u{1F600}".repeat(500))).toBe(500);
    expect(codePointLength("abc")).toBe(3);
    expect(codePointLength("")).toBe(0);
  });
});
