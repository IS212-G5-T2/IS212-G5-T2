import { describe, expect, it } from "vitest";
import {
  CHANGE_FIELDS,
  acceptsChangeRequests,
  changeFieldLabel,
  mayNeedSafetyCheck,
  pendingRequest,
} from "@/features/events/lib/changeRequests";
import type { ChangeRequest, EventStatus } from "@/types";

/** SPM-64 rules shared by the change request screens. */
describe("change request rules", () => {
  const future = "2030-01-01T00:00:00.000Z";

  /** REQ-CHANGE-01-F: Submitted to Confirmed accept requests; closed or started events do not. */
  it.each<[EventStatus, string, boolean]>([
    ["submitted", future, true],
    ["approved", future, true],
    ["planning", future, true],
    ["confirmed", future, true],
    ["draft", future, false],
    ["rejected", future, false],
    ["cancelled", future, false],
    ["completed", future, false],
    ["planning", "2020-01-01T00:00:00.000Z", false],
  ])("REQ-CHANGE-01-F %s event starting %s accepts requests: %s", (status, startDateTime, expected) => {
    expect(acceptsChangeRequests({ status, startDateTime }, Date.parse("2026-10-17T00:00:00.000Z"))).toBe(expected);
  });

  /** An event starting exactly now has started. */
  it("treats the start instant as started", () => {
    expect(acceptsChangeRequests({ status: "planning", startDateTime: future }, Date.parse(future))).toBe(false);
  });

  /** REQ-CHANGE-07-A: only events past approval mention a new safety check. */
  it("REQ-CHANGE-07-A mentions a safety check only past approval", () => {
    expect(mayNeedSafetyCheck({ status: "submitted" })).toBe(false);
    expect(mayNeedSafetyCheck({ status: "confirmed" })).toBe(true);
  });

  /** REQ-CHANGE-01-A: the form offers exactly the permitted change types, with accessibility labelled as special requirements. */
  it("REQ-CHANGE-01-A lists the permitted fields and labels accessibility as special requirements", () => {
    expect(CHANGE_FIELDS).toHaveLength(8);
    expect(changeFieldLabel("accessibility")).toBe("Accessibility / special requirements");
    expect(changeFieldLabel("expectedAttendance")).toBe("Expected attendance");
  });

  /** The pending request, if any, is picked out of a list. */
  it("finds the pending request", () => {
    const pending = { id: "p", status: "Pending" } as ChangeRequest;
    expect(pendingRequest([{ id: "a", status: "Approved" } as ChangeRequest, pending])).toBe(pending);
    expect(pendingRequest([])).toBeUndefined();
  });
});
