import { describe, expect, it } from "vitest";
import { formatDateTimeRange, formatSingaporeDateTime, formatSingaporeRange } from "./format";

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

describe("formatSingaporeRange (SPM-55)", () => {
  /** VEN-REV-01-A: event times for venue review are shown in Singapore time with an SGT suffix. */
  it("formats a UTC window as Singapore time with an SGT suffix", () => {
    // 04:00 UTC is 12:00 in Singapore (UTC+8), so both ends are shifted by eight hours.
    expect(formatSingaporeRange("2030-01-12T04:00:00.000Z", "2030-01-12T05:30:00.000Z")).toBe(
      "12 Jan 2030, 12:00 – 12 Jan 2030, 13:30 SGT",
    );
  });
});

describe("formatSingaporeDateTime", () => {
  /** MONITOR-QUEUE-08-A (SPM-48 AC8): a hold expiry is shown in Singapore time whatever the runner's zone. */
  it("MONITOR-QUEUE-08-A formats an instant in SGT with a 24-hour clock", () => {
    expect(formatSingaporeDateTime("2026-11-12T04:00:00.000Z")).toBe("12 Nov 2026, 12:00 SGT");
    expect(formatSingaporeDateTime("2026-11-09T16:30:00.000Z")).toBe("10 Nov 2026, 00:30 SGT");
  });
});
