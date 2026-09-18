import { describe, expect, it } from "vitest";
import { getRoleFromFirebaseClaims } from "./firebaseRoles";

describe("getRoleFromFirebaseClaims", () => {
  it.each([
    ["ORGANISER", "organiser"],
    ["COORDINATOR", "coordinator"],
    ["VENUE_STAFF", "venue_staff"],
    ["TECH_SUPPORT", "tech_support"],
    ["ATTENDEE", "attendee"],
  ] as const)("maps the %s Firebase claim to the %s UI role", (claim, role) => {
    expect(getRoleFromFirebaseClaims([claim])).toBe(role);
  });

  it("normalizes role claims and uses the policy order for multiple roles", () => {
    expect(getRoleFromFirebaseClaims([" attendee ", "organiser"])).toBe("organiser");
  });

  it("rejects absent, malformed, and unsupported claims", () => {
    expect(getRoleFromFirebaseClaims(undefined)).toBeUndefined();
    expect(getRoleFromFirebaseClaims("ATTENDEE")).toBeUndefined();
    expect(getRoleFromFirebaseClaims(["ADMIN", 123])).toBeUndefined();
  });
});
