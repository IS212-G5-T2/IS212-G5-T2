import { describe, expect, it } from "vitest";
import { formatSgtDateTime, formatSgtDateTimeRange, formatSgtTime, toSgtLocalInput } from "@/utils/sgtDate";

/**
 * Singapore am/pm formatting used for planning values and change requests.
 * Expectations are literal SGT text, so they hold under any process time zone.
 */
describe("Singapore am/pm formatting", () => {
  /** A UTC instant reads 8 hours later, with lowercase am/pm; midnight and noon use 12. */
  it("formats times in Singapore with am/pm", () => {
    expect(formatSgtTime("2026-11-10T10:30:00.000Z")).toBe("6:30 pm");
    expect(formatSgtTime("2026-11-10T16:00:00.000Z")).toBe("12:00 am");
    expect(formatSgtTime("2026-11-10T04:05:00.000Z")).toBe("12:05 pm");
    expect(formatSgtDateTime("2026-11-10T01:00:00.000Z")).toBe("10 Nov 2026, 9:00 am");
  });

  /** The date is named once on one Singapore day and twice across Singapore midnight. */
  it("formats a same-day range once and a range crossing midnight in full", () => {
    expect(formatSgtDateTimeRange("2026-11-10T10:00:00.000Z", "2026-11-10T14:00:00.000Z")).toBe(
      "10 Nov 2026, 6:00 pm – 10:00 pm",
    );
    expect(formatSgtDateTimeRange("2026-11-10T15:00:00.000Z", "2026-11-10T17:00:00.000Z")).toBe(
      "10 Nov 2026, 11:00 pm – 11 Nov 2026, 1:00 am",
    );
  });

  /** Date inputs are filled in Singapore wall time; an unreadable value leaves the input empty. */
  it("converts an instant to a Singapore datetime-local value", () => {
    expect(toSgtLocalInput("2030-02-05T10:30:00.000Z")).toBe("2030-02-05T18:30");
    expect(toSgtLocalInput("2030-02-05T16:30:00.000Z")).toBe("2030-02-06T00:30");
    expect(toSgtLocalInput("not a date")).toBe("");
  });
});
