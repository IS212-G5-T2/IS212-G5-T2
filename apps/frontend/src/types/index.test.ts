import { describe, expect, it } from "vitest";
import { hasRole } from "./index";

describe("hasRole", () => {
  // Uses the complete server-provided role list rather than only the display role.
  it("allows a role granted as a secondary role", () => {
    expect(hasRole(
      { role: "organiser", roles: ["organiser", "coordinator"] },
      "coordinator",
    )).toBe(true);
  });

  // Allows the account's primary role when it is included in the server role list.
  it("allows a role granted as the primary role", () => {
    expect(hasRole(
      { role: "organiser", roles: ["organiser", "coordinator"] },
      "organiser",
    )).toBe(true);
  });

  // Does not accidentally authorize a role absent from the account's grants.
  it("denies an unassigned role", () => {
    expect(hasRole(
      { role: "organiser", roles: ["organiser", "coordinator"] },
      "venue_staff",
    )).toBe(false);
  });

  // Keeps existing fixtures working until every user fixture supplies roles.
  it("falls back to the primary role when the role list is absent", () => {
    expect(hasRole({ role: "attendee" }, "attendee")).toBe(true);
    expect(hasRole({ role: "attendee" }, "organiser")).toBe(false);
  });
});
