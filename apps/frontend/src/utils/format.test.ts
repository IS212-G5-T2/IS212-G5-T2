import { describe, expect, it } from "vitest";
import { formatDateTimeRange } from "./format";

// Dates are written without a timezone offset so they parse as local time,
// keeping the expected strings deterministic regardless of the runner's zone.
describe("formatDateTimeRange", () => {
  it("shows both dates and times for a multi-day event, day-month-year with lowercase am/pm", () => {
    expect(
      formatDateTimeRange("2026-09-21T22:08:00", "2026-09-22T23:08:00"),
    ).toBe("21 Sep 2026, 10:08pm – 22 Sep 2026, 11:08pm");
  });

  it("collapses the repeated date for a same-day event but keeps both times", () => {
    expect(
      formatDateTimeRange("2026-09-21T22:08:00", "2026-09-21T23:08:00"),
    ).toBe("21 Sep 2026, 10:08pm – 11:08pm");
  });

  it("renders morning times and a single-digit day/hour without a leading zero on the hour", () => {
    expect(
      formatDateTimeRange("2026-09-01T09:05:00", "2026-09-01T10:30:00"),
    ).toBe("1 Sep 2026, 9:05am – 10:30am");
  });

  it("uses the 3-letter month abbreviation (Sep, not Sept)", () => {
    expect(formatDateTimeRange("2026-09-21T22:08:00", "2026-09-22T23:08:00")).toContain(
      "Sep 2026",
    );
    expect(formatDateTimeRange("2026-09-21T22:08:00", "2026-09-22T23:08:00")).not.toContain(
      "Sept",
    );
  });
});
