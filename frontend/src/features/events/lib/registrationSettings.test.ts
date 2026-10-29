/*
 * SPM-139 coordinator form rules. Literal oracles from the resolved spec: event start 2026-11-07 18:00 SGT, SET-OK
 * period (opens 19 Oct 09:00 SGT, closes 28 Oct 23:59 SGT, capacity 50).
 */
import { describe, expect, it } from "vitest";
import {
  checkSettingsForm,
  isoToSgtInput,
  parseCapacityInput,
  sgtInputToIso,
  SETTINGS_MESSAGES,
  type SettingsFormValues,
} from "@/features/events/lib/registrationSettings";

const START = "2026-11-07T10:00:00.000Z";
const SET_OK: SettingsFormValues = {
  enabled: true,
  opens: "2026-10-19T09:00",
  closes: "2026-10-28T23:59",
  capacity: "50",
};

describe("SPM-139 Singapore time", () => {
  // 02-A and 02-C: Singapore time is stored and shown as UTC instants.
  it("CONFIG-REG-02-B: reads a Singapore wall-clock value as an offset ISO date-time", () => {
    expect(sgtInputToIso("2026-10-19T09:00")).toBe("2026-10-19T09:00:00+08:00");
    expect(Date.parse(sgtInputToIso("2026-10-19T09:00")!)).toBe(Date.parse("2026-10-19T01:00:00Z"));
  });

  it("CONFIG-REG-02-B: shows a UTC instant as the Singapore wall clock", () => {
    expect(isoToSgtInput("2026-10-19T01:00:00.000Z")).toBe("2026-10-19T09:00");
    expect(isoToSgtInput("2026-11-10T16:30:00Z")).toBe("2026-11-11T00:30");
  });

  it("CONFIG-REG-02-D: refuses text that is not a date-time", () => {
    expect(sgtInputToIso("2026-13-45T25:61")).toBeUndefined();
    expect(sgtInputToIso("not-a-date")).toBeUndefined();
  });
});

describe("SPM-139 capacity text", () => {
  // 05-A: surrounding spaces are removed; 05-B: anything that is not a positive whole number is refused.
  it.each([
    ["25", 25],
    [" 25 ", 25],
    ["1000", 1000],
    ["2147483647", 2147483647],
  ])("CONFIG-REG-07-A: reads %j as %i", (text, value) => {
    expect(parseCapacityInput(text)).toBe(value);
  });

  it.each(["", "   ", "0", "-5", "2.5", "abc", "12abc", "2147483648"])("CONFIG-REG-07-B: refuses %j", (text) => {
    expect(parseCapacityInput(text)).toBeUndefined();
  });
});

describe("SPM-139 AC4 and AC5 in the form: the same rules as the server", () => {
  // Kills: a closing time equal to the opening time accepted (04-B), a closing time after the start accepted (04-C).
  it.each([
    ["equal to the opening time", "2026-10-19T09:00", SETTINGS_MESSAGES.closeAfterOpen, "registrationClosesAt"],
    ["before the opening time", "2026-10-18T09:00", SETTINGS_MESSAGES.closeAfterOpen, "registrationClosesAt"],
    ["after the event start", "2026-11-07T18:30", SETTINGS_MESSAGES.closeOnOrBeforeStart, "registrationClosesAt"],
  ])("CONFIG-REG-05-B: closing %s is refused with its message", (_label, closes, message, field) => {
    const check = checkSettingsForm({ ...SET_OK, closes }, START, 0);
    expect(check.request).toBeUndefined();
    expect(check.errors).toEqual({ [field]: message });
  });

  // The start instant itself is valid (R3).
  it("CONFIG-REG-06-C: accepts a closing time equal to the event start", () => {
    expect(checkSettingsForm({ ...SET_OK, closes: "2026-11-07T18:00" }, START, 0).request).toBeDefined();
  });

  // Boundary at 17:59 on the start day (accepted); FM15 flips the start rule.
  it("CONFIG-REG-06-C: accepts 17:59 on the start day", () => {
    expect(checkSettingsForm({ ...SET_OK, closes: "2026-11-07T17:59" }, START, 0).request).toBeDefined();
  });

  // Boundary at 18:01, one minute after the start (refused); FM15 flips the start rule.
  it("CONFIG-REG-06-C: refuses 18:01 on the start day", () => {
    expect(checkSettingsForm({ ...SET_OK, closes: "2026-11-07T18:01" }, START, 0).errors).toEqual({
      registrationClosesAt: SETTINGS_MESSAGES.closeOnOrBeforeStart,
    });
  });

  // 01-E: enabling needs the opening and closing times; disabling does not.
  it("CONFIG-REG-01-E: refuses enabling without an opening time", () => {
    const check = checkSettingsForm({ ...SET_OK, opens: "" }, START, 0);
    expect(check.errors).toEqual({ registrationOpensAt: SETTINGS_MESSAGES.incomplete });
  });

  it("CONFIG-REG-01-B: accepts disabling without dates", () => {
    const check = checkSettingsForm({ enabled: false, opens: "", closes: "", capacity: "50" }, START, 3);
    expect(check.request).toEqual({ registrationEnabled: false, capacity: 50, version: 3 });
  });

  // 05-B: an empty or invalid capacity is refused and the request is not built.
  it.each(["", "0", "2.5", "12abc"])("CONFIG-REG-07-B: refuses capacity %j with the capacity message", (capacity) => {
    const check = checkSettingsForm({ ...SET_OK, capacity }, START, 0);
    expect(check.errors).toEqual({ capacity: SETTINGS_MESSAGES.capacityInvalid });
  });

  // The body sends instants with offsets, whole-number capacity and the version the form loaded (BR7, BR8).
  it("CONFIG-REG-01-A: builds the request from SET-OK with the loaded version", () => {
    const check = checkSettingsForm(SET_OK, START, 4);
    expect(check.errors).toEqual({});
    expect(check.request).toEqual({
      registrationEnabled: true,
      registrationOpensAt: "2026-10-19T09:00:00+08:00",
      registrationClosesAt: "2026-10-28T23:59:00+08:00",
      capacity: 50,
      version: 4,
    });
  });
});

describe("SPM-139 unreadable typed values in the form", () => {
  it("shows an instant that cannot be read as a blank input", () => {
    expect(isoToSgtInput("not a date")).toBe("");
  });

  it("CONFIG-REG-02-D: refuses an opening time that does not exist in the calendar", () => {
    const check = checkSettingsForm({ ...SET_OK, opens: "2026-13-01T09:00" }, START, 0);
    expect(check.request).toBeUndefined();
    expect(check.errors).toEqual({ registrationOpensAt: SETTINGS_MESSAGES.invalidDatetime });
  });

  it("CONFIG-REG-02-D: refuses a closing time that does not exist in the calendar", () => {
    const check = checkSettingsForm({ ...SET_OK, closes: "2026-13-28T23:59" }, START, 0);
    expect(check.request).toBeUndefined();
    expect(check.errors).toEqual({ registrationClosesAt: SETTINGS_MESSAGES.invalidDatetime });
  });
});
