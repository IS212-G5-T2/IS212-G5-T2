/*
 * SPM-61 frontend registration rules. Test Case IDs are ASSUMED from the
 * task's matrix (docs/specs/SPM-61-test-cases.md is absent); quotes are Jira
 * AC wording.
 */
import { describe, expect, it } from "vitest";
import {
  REGISTRATION_LIMITS,
  WITHDRAWAL_MESSAGES,
  daysUntilLabel,
  formatSgt,
  formatSgtDateTime,
  hasEventStarted,
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

// EVENT-REG-01-BND-1, EVENT-REG-02-BND-1
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

// EVENT-REG-03-B, EVENT-REG-03-C
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

// EVENT-REG-03-BND-1
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

/*
 * Story: SPM-120 Withdraw Registration (attendee), frontend rules.
 * Test cases: WITHDRAW-EVENT-REG-04-C (unit), 05-E (formatter), 06-A/06-B (message literals).
 * Oracles are literals from the AC text and the Confluence pages.
 */
describe("SPM-120 AC4: hasEventStarted (event start is an exclusive cut-off)", () => {
  // EVT-T5 starts 2026-11-01 09:00:00 SGT.
  const event = { startDateTime: "2026-11-01T09:00:00+08:00" };

  // Oracle (SPEC 04-C): not started 1 s before; started at the start; started 1 s after.
  // Kills: M1 `>=` -> `>` (middle row); `>=` -> `===` (last row); `<` / `<=` swap (first row).
  it.each([
    ["WITHDRAW-EVENT-REG-04-C A: 1 second before", "2026-11-01T08:59:59+08:00", false],
    ["WITHDRAW-EVENT-REG-04-C B: exactly at the start", "2026-11-01T09:00:00+08:00", true],
    ["WITHDRAW-EVENT-REG-04-C C (added): 1 second after", "2026-11-01T09:00:01+08:00", true],
  ])("%s", (_label, clock, expected) => {
    expect(hasEventStarted(event, new Date(clock))).toBe(expected);
  });
});

describe("SPM-120 AC5: formatSgtDateTime (the timeline's absolute SGT timestamp)", () => {
  // WITHDRAW-EVENT-REG-05-E
  // Oracle (SPEC 05-E, as amended by the card redesign): the timeline shows "D Mon YYYY, HH:mm" in Singapore
  // time, with the SGT day, not the UTC day, deciding the date.
  // Kills: UTC day or hour shown instead of SGT (the first row crosses midnight between the two zones).
  it.each([
    ["crosses midnight: 17:30Z is already the next SGT day", "2026-10-04T17:30:00.000Z", "5 Oct 2026, 01:30"],
    ["same SGT and UTC day", "2026-10-04T04:00:00.000Z", "4 Oct 2026, 12:00"],
    ["previous UTC day, same SGT day", "2026-09-28T16:30:00.000Z", "29 Sep 2026, 00:30"],
  ])("WITHDRAW-EVENT-REG-05-E: %s", (_label, instant, expected) => {
    expect(formatSgtDateTime(instant)).toBe(expected);
  });

  // WITHDRAW-EVENT-REG-05-E
  // Oracle (DERIVED from the app's one date format, "12 Mar 2027"): every month is the fixed three-letter
  // name. The "en-GB" short form of September is "Sept" in newer ICU data, which is not the app format.
  // Kills: month names taken from Intl instead of a fixed table (September fails on current ICU).
  it.each([
    ["Jan", "2026-01-04T01:05:00.000Z"], ["Feb", "2026-02-04T01:05:00.000Z"], ["Mar", "2026-03-04T01:05:00.000Z"],
    ["Apr", "2026-04-04T01:05:00.000Z"], ["May", "2026-05-04T01:05:00.000Z"], ["Jun", "2026-06-04T01:05:00.000Z"],
    ["Jul", "2026-07-04T01:05:00.000Z"], ["Aug", "2026-08-04T01:05:00.000Z"], ["Sep", "2026-09-04T01:05:00.000Z"],
    ["Oct", "2026-10-04T01:05:00.000Z"], ["Nov", "2026-11-04T01:05:00.000Z"], ["Dec", "2026-12-04T01:05:00.000Z"],
  ])("WITHDRAW-EVENT-REG-05-E: %s uses the fixed three-letter month", (month, instant) => {
    expect(formatSgtDateTime(instant)).toBe(`4 ${month} 2026, 09:05`);
  });
});

describe("SPM-120 redesign: daysUntilLabel (footer 'Closes ... (N days)')", () => {
  // Oracle (DERIVED from registrationClosingHeading / SPM-61: the SGT calendar-day difference, not hours / 24).
  // Kills: hours / 24 instead of calendar days (row 4 is two minutes apart but a day later); the UTC
  // day instead of the SGT day (row 5); "1 days" plural; "today" shown as "0 days".
  const closesAt = "2027-03-12T15:59:00.000Z"; // 23:59 SGT on 12 Mar 2027
  it.each([
    ["same SGT day, hours earlier", "2027-03-12T02:00:00.000Z", closesAt, "today"],
    ["same SGT day, one minute earlier", "2027-03-12T15:58:00.000Z", closesAt, "today"],
    ["exactly 24 hours earlier", "2027-03-11T15:59:00.000Z", closesAt, "1 day"],
    ["two minutes apart across SGT midnight", "2027-03-12T15:59:00.000Z", "2027-03-12T16:01:00.000Z", "1 day"],
    ["UTC day differs but the SGT day is the same", "2027-03-11T17:00:00.000Z", closesAt, "today"],
    ["two days earlier", "2027-03-10T02:00:00.000Z", closesAt, "2 days"],
    ["the design example (5 Oct 2026 to 12 Mar 2027)", "2026-10-05T07:53:00.000Z", closesAt, "158 days"],
  ])("%s -> %s", (_label, now, target, expected) => {
    expect(daysUntilLabel(target, new Date(now))).toBe(expected);
  });
});

describe("SPM-120 AC5/AC6: message literals", () => {
  // WITHDRAW-EVENT-REG-05-A, WITHDRAW-EVENT-REG-06-B
  // Oracle (SPEC AC5, D8): the blocked message has no full stop; MSG-11 is built from the event name.
  // Kills: reworded blocked message; hard-coded event name in the success message.
  it("WITHDRAW-EVENT-REG-05-A / 06-B: exact literals", () => {
    expect(WITHDRAWAL_MESSAGES.eventAlreadyOccurred).toBe("Event has already occurred");
    expect(WITHDRAWAL_MESSAGES.success("Workshop: Docker Mastery")).toBe(
      "Your withdrawal from Workshop: Docker Mastery has been processed.",
    );
  });
});

/*
 * SPM-120 assumption index. Decision IDs (A*, D*, F*) are defined in docs/specs/SPM-120-test-results.md,
 * "Decision and assumption IDs". assumption -> tests that rely on it:
 *  SPM-120 tests in this file only:
 *  A7   event start is an exclusive cut-off, ASSUMED -> 04-C (unit)
 *  D8   the blocked message has no full stop -> message literals
 *  SGT  timestamps are shown in Asia/Singapore -> 05-E (formatSgtDateTime)
 *  MONTHS every month is a fixed three-letter name, DERIVED from the app's date format -> 05-E (months)
 *  DAYS the footer day count is the SGT calendar-day difference, DERIVED from the SPM-61 heading -> daysUntilLabel
 */
