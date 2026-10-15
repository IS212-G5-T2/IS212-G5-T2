/*
 * Story: SPM-138 Join Waitlist When Event Is at Capacity (frontend rules).
 * ACs: AC1 (join when full), AC2 (the page shows full and the waitlist), AC3 (Waitlisted status), AC4 (confirmation).
 * Test cases: JOIN-WAITLIST-02-B-UNIT (the registrationUiState table), 04-A-TEXT (the MSG-WL-01 text), and the locked copy
 * for MSG-WL-02 to MSG-WL-06 (D14). Copy is asserted literally; nothing here is computed from the code under test.
 */
import { describe, expect, it } from "vitest";
import { WAITLIST_MESSAGES, registrationUiState } from "./registration";

// JOIN-WAITLIST-02-B-UNIT: the page state for every combination of window, fullness and the attendee's own status.
// Oracle (D16): a waiting or confirmed status wins over the window; a closed window beats not-yet-open, which beats
// the full/open split (full -> join the waitlist, otherwise register). Cancelled wins like a status.
describe("JOIN-WAITLIST-02-B-INT-UNIT: registrationUiState table (D16)", () => {
  // Kills: F1, F2, F33, F34
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
  // Kills: F19
  it("JOIN-WAITLIST-04-A-TEXT: MSG-WL-01 is built from the event name and the response position", () => {
    expect(WAITLIST_MESSAGES.joined("Gala Waitlist Night", 1)).toBe(
      "You have joined the waitlist for Gala Waitlist Night. Your position is 1.",
    );
  });

  // Kills: F20
  it("JOIN-WAITLIST-02-A-TEXT: MSG-WL-02 is the full-event sentence", () => {
    expect(WAITLIST_MESSAGES.full).toBe("This event is full. Join the waitlist to be notified if a spot opens.");
  });

  // Kills: CARD-COPY
  it("JOIN-WAITLIST-03-A-TEXT: the position notice in the card and the join control copy", () => {
    expect(WAITLIST_MESSAGES.inLine(2)).toBe("You're #2 in line");
    expect(WAITLIST_MESSAGES.join).toBe("Join Waitlist");
  });

  // The leave-waitlist and withdraw copy (the dialog that replaces the old withdraw prompt) is asserted in ConfirmDialog.test.tsx.


});
