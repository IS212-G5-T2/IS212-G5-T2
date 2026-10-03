/*
 * SPM-61 frontend registration rules. Test Case IDs are ASSUMED from the
 * task's matrix (docs/specs/SPM-61-test-cases.md is absent); quotes are Jira
 * AC wording.
 */
import { describe, expect, it } from "vitest";
import {
  REGISTRATION_LIMITS,
  formatSgt,
  formatSgtDateTime,
  isRegistrationOpen,
  registrationClosingHeading,
  sgtCalendarDayDiff,
  validateRegistrationDetails,
} from "./registration";

const opensAt = "2030-01-10T02:00:00.000Z";
const closesAt = "2030-01-20T02:00:00.000Z";
const period = { opensAt, closesAt };
const at = (iso: string, offsetMs: number) => new Date(new Date(iso).getTime() + offsetMs);
const valid = { fullName: "Alice Tan", email: "alice@example.com", contactNumber: "", specialRequirements: "" };

describe("EVENT-REG-01-BND-1 / EVENT-REG-02-BND-1: registration window instants (period util)", () => {
  // [A] one second before opening, registration is not open.
  it("[A] 1s before open: not open", () => {
    expect(isRegistrationOpen(period, at(opensAt, -1000))).toBe(false);
  });
  // [B] the opening instant is open (inclusive).
  it("[B] exactly at open: open", () => {
    expect(isRegistrationOpen(period, new Date(opensAt))).toBe(true);
  });
  // [C] one minute before closing is still open.
  it("[C] 1 min before close: open", () => {
    expect(isRegistrationOpen(period, at(closesAt, -60_000))).toBe(true);
  });
  // [D] the closing instant is closed (exclusive).
  it("[D] exactly at close: closed", () => {
    expect(isRegistrationOpen(period, new Date(closesAt))).toBe(false);
  });
  // A missing bound is unbounded on that side.
  it("treats a missing bound as unbounded", () => {
    expect(isRegistrationOpen({ closesAt }, new Date("2000-01-01"))).toBe(true);
    expect(isRegistrationOpen({ opensAt }, new Date("2999-01-01"))).toBe(true);
  });
});

describe("EVENT-REG-03-B / 03-C: client-side validation (AC3)", () => {
  // Required and malformed fields each produce a field message.
  it.each([
    ["blank name", { ...valid, fullName: "  " }, "fullName"],
    ["blank email", { ...valid, email: "" }, "email"],
    ["email without @", { ...valid, email: "alice.example.com" }, "email"],
    ["contact with letters", { ...valid, contactNumber: "9123abcd" }, "contactNumber"],
    ["contact too short", { ...valid, contactNumber: "1234567" }, "contactNumber"],
  ])("%s -> error on %s", (_name, details, field) => {
    expect(validateRegistrationDetails(details)).toHaveProperty(field);
  });
  // Valid input, including spaced international contact numbers, passes.
  it("accepts valid details and spaced contact numbers", () => {
    expect(validateRegistrationDetails({ ...valid, contactNumber: "+65 9123 4567" })).toEqual({});
  });
});

describe("EVENT-REG-03-BND-1: shared limits", () => {
  // The frontend mirror must equal the backend constants (pinned on both sides).
  it("limit values match the backend mirror", () => {
    expect(REGISTRATION_LIMITS).toEqual({
      fullNameMin: 1,
      fullNameMax: 100,
      emailMax: 254,
      contactDigitsMin: 8,
      contactDigitsMax: 15,
      specialRequirementsMax: 500,
    });
  });
  // Inclusive limits: at the limit passes and one over fails.
  it("name and requirement limits are inclusive", () => {
    expect(validateRegistrationDetails({ ...valid, fullName: "A".repeat(100) })).toEqual({});
    expect(validateRegistrationDetails({ ...valid, fullName: "A".repeat(101) })).toHaveProperty("fullName");
    expect(validateRegistrationDetails({ ...valid, specialRequirements: "x".repeat(500) })).toEqual({});
    expect(validateRegistrationDetails({ ...valid, specialRequirements: "x".repeat(501) })).toHaveProperty("specialRequirements");
  });
});

describe("D20: Singapore time display", () => {
  // Instants are shown in Asia/Singapore regardless of the runner's timezone.
  it("formats a UTC instant as SGT", () => {
    expect(formatSgt("2030-01-10T02:00:00.000Z")).toContain("10:00");
    expect(formatSgt("2030-01-10T02:00:00.000Z")).toMatch(/SGT$/);
  });
});

describe("SPM-61 registration heading helpers", () => {
  // The single date-and-time format used everywhere, in Singapore time.
  it("formats as 12 Mar 2027, 23:59 in SGT", () => {
    expect(formatSgtDateTime("2027-03-12T15:59:00.000Z")).toBe("12 Mar 2027, 23:59");
    expect(formatSgt("2027-03-12T15:59:00.000Z")).toBe("12 Mar 2027, 23:59 SGT");
  });
  // "X days" is the SGT calendar-day difference, so a 23:59 close never reads "1 day" on the closing day.
  it.each([
    ["2027-03-12T02:00:00.000Z", 0, "Registration closes today"],           // 10:00 SGT, closes 23:59 SGT same day
    ["2027-03-12T15:58:00.000Z", 0, "Registration closes today"],           // 23:58 SGT
    ["2027-03-11T15:59:00.000Z", 1, "Registration closes in 1 day"],        // 23:59 SGT the day before
    ["2027-03-11T16:00:00.000Z", 0, "Registration closes today"],           // 00:00 SGT on the closing day
    ["2027-03-09T02:00:00.000Z", 3, "Registration closes in 3 days"],
  ])("now %s -> %i days: %s", (nowIso, days, heading) => {
    const closesAt = "2027-03-12T15:59:00.000Z";
    expect(sgtCalendarDayDiff(new Date(nowIso), new Date(closesAt))).toBe(days);
    expect(registrationClosingHeading(closesAt, new Date(nowIso))).toBe(heading);
  });
  // Days are counted in Singapore, not UTC: 17:00 UTC is already the next SGT day.
  it("counts calendar days in SGT, not UTC", () => {
    expect(sgtCalendarDayDiff(new Date("2027-03-11T17:00:00.000Z"), new Date("2027-03-12T15:59:00.000Z"))).toBe(0);
  });
  // The mock's example: 163 days before 12 Mar 2027.
  it("matches the design example of 163 days", () => {
    expect(registrationClosingHeading("2027-03-12T15:59:00.000Z", new Date("2026-09-30T04:00:00.000Z"))).toBe("Registration closes in 163 days");
  });
});
