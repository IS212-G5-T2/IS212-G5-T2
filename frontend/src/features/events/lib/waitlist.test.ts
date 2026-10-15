/*
 * Story: SPM-138 Join Waiting List When Event Is at Capacity (frontend rules).
 * ACs: AC1 (join when full), AC2 (the page shows full and the waiting list), AC3 (Waitlisted status), AC4 (confirmation).
 * Test cases: JOIN-WAITLIST-02-B-UNIT (the registrationUiState table), 04-A-TEXT (the MSG-WL-01 text), and the locked copy
 * for MSG-WL-02 to MSG-WL-06 (D14). Copy is asserted literally; nothing here is computed from the code under test.
 */
import { describe, expect, it } from "vitest";
import { WAITLIST_MESSAGES, registrationUiState } from "./registration";

// JOIN-WAITLIST-02-B-UNIT: the page state for every combination of window, fullness and the attendee's own status.
// Oracle (D16): a waiting or confirmed status wins over the window; a closed window beats not-yet-open, which beats
// the full/open split (full -> join the waiting list, otherwise register). Cancelled wins like a status.
describe("JOIN-WAITLIST-02-B-UNIT: registrationUiState table (D16)", () => {
  it.each([
    // window,        full,  own status,   expected
    ["open", false, undefined, "register"],
    ["open", true, undefined, "full-join"],
    ["closed", false, undefined, "closed"],
    ["closed", true, undefined, "closed"],
    ["not-yet-open", false, undefined, "not-yet-open"],
    ["not-yet-open", true, undefined, "not-yet-open"],
    ["open", false, "registered", "registered"],
    ["open", true, "registered", "registered"],
    ["closed", true, "registered", "registered"],
    ["open", false, "waitlisted", "waitlisted"],
    ["open", true, "waitlisted", "waitlisted"],
    ["closed", true, "waitlisted", "waitlisted"],
    ["not-yet-open", true, "waitlisted", "waitlisted"],
    ["open", false, "cancelled", "cancelled"],
    ["open", true, "cancelled", "cancelled"],
    ["closed", false, "cancelled", "cancelled"],
    ["open", false, "withdrawn", "register"],
    ["open", true, "withdrawn", "full-join"],
    ["closed", true, "withdrawn", "closed"],
    ["open", false, "removed", "register"],
    ["open", true, "removed", "full-join"],
    ["closed", true, "removed", "closed"],
    ["not-yet-open", false, "removed", "not-yet-open"],
  ] as const)("window %s, full %s, own status %s -> %s", (window, full, own, expected) => {
    expect(registrationUiState(window, full, own)).toBe(expected);
  });
});

// JOIN-WAITLIST-04-A-TEXT: the locked copy. Each literal is copied from the SPM-138 message table (D14).
describe("SPM-138 locked copy (D14)", () => {
  it("JOIN-WAITLIST-04-A-TEXT: MSG-WL-01 is built from the event name and the response position", () => {
    expect(WAITLIST_MESSAGES.joined("Gala Waitlist Night", 1)).toBe(
      "You have joined the waiting list for Gala Waitlist Night. Your position is 1.",
    );
  });

  it("JOIN-WAITLIST-02-A-TEXT: MSG-WL-02 is the full-event sentence", () => {
    expect(WAITLIST_MESSAGES.full).toBe("This event is full. Join the waiting list to be notified if a spot opens.");
  });

  it("JOIN-WAITLIST-03-A-TEXT: the attendee's waiting indicator and the position line (A-TXT)", () => {
    expect(WAITLIST_MESSAGES.onList).toBe("You are on the waiting list");
    expect(WAITLIST_MESSAGES.position(2)).toBe("Waiting list position: 2");
    expect(WAITLIST_MESSAGES.join).toBe("Join Waiting List");
  });

  it("JOIN-WAITLIST-10-A-TEXT: the withdrawal prompt copy for a waiting entry names the event", () => {
    expect(WAITLIST_MESSAGES.withdrawPrompt("Gala Waitlist Night")).toBe(
      "You will lose your place on the waiting list for Gala Waitlist Night. You can join again while registration is open.",
    );
  });


});
