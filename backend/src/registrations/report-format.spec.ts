/*
 * Story: SPM-63 View Registration Information (Organiser and Coordinator), report formatters.
 * ACs: AC2 (count wording), AC3 (dates in SGT), AC4 (filename date, CSV date).
 * Test cases: VIEW-REG-INFO-02-A (count lines, BND singular), 03-A (SGT dates), 04-A (filename date BND),
 *             04-B (event range, generated line).
 *
 * Pure functions: no clock, no database. Every expected value is a literal worked out by hand from the
 * Confluence cases and the prompt's resolved specs (2.5), never taken from the code's output.
 * Tests that depend on dates are run under TZ=UTC, Asia/Singapore and America/Los_Angeles in Phase 4.
 */
import { describe, expect, it } from 'vitest';
import {
  attendeeCountLine,
  formatReportDateTime,
  formatReportDateTimeSgt,
  formatReportEventRange,
  formatReportGenerated,
  sgtCalendarDate,
  spotsLine,
} from './report-format.js';

describe('SPM-63 AC3: registration dates are shown in Singapore time, never the process or UTC hour', () => {
  // VIEW-REG-INFO-03-A
  // Oracle (SPEC 03-A): 27 Sep 15:00, 28 Sep 10:30 and 29 Sep 09:00 SGT; stored as UTC (SGT = UTC+8).
  //   2026-09-27T07:00Z + 8h = 15:00; 2026-09-28T02:30Z + 8h = 10:30; 2026-09-29T01:00Z + 8h = 09:00.
  // Kills: UTC hour shown (07:00 / 02:30 / 01:00); process-TZ formatting; the zone suffix missing.
  it.each([
    ['2026-09-27T07:00:00Z', '27 Sep 2026 15:00 SGT'],
    ['2026-09-28T02:30:00Z', '28 Sep 2026 10:30 SGT'],
    ['2026-09-29T01:00:00Z', '29 Sep 2026 09:00 SGT'],
  ])('VIEW-REG-INFO-03-A: %s is shown as %s', (iso, expected) => {
    // Arrange / Act
    const shown = formatReportDateTimeSgt(new Date(iso));

    // Assert
    expect(shown).toBe(expected);
  });

  // VIEW-REG-INFO-04-A
  // Oracle (SPEC 04-A): the CSV date has the same wording but no zone suffix: "28 Sep 2026 10:30".
  // Kills: the SGT suffix leaking into the CSV cell; day or month padding.
  it('VIEW-REG-INFO-04-A: the CSV date has no zone suffix', () => {
    // Arrange / Act
    const shown = formatReportDateTime(new Date('2026-09-28T02:30:00Z'));

    // Assert
    expect(shown).toBe('28 Sep 2026 10:30');
  });

  // VIEW-REG-INFO-03-A-BND
  // Oracle (ASSUMED A1): September is "Sep", never the "Sept" that en-GB ICU data prints.
  // Kills: relying on Intl's short month name.
  it('VIEW-REG-INFO-03-A-BND: September is abbreviated "Sep"', () => {
    // Arrange / Act
    const shown = formatReportDateTime(new Date('2026-09-01T04:00:00Z'));

    // Assert
    expect(shown).toBe('1 Sep 2026 12:00');
  });

  // VIEW-REG-INFO-03-A-BND
  // Oracle (derived): 2026-12-31T16:30Z + 8h = 1 Jan 2027 00:30 SGT; the 24-hour clock prints 00, not 24.
  // Kills: UTC calendar date used; "24:30" from an h24 hour cycle; month index off by one.
  it('VIEW-REG-INFO-03-A-BND: the SGT date can be a different month and year from the UTC one', () => {
    // Arrange / Act
    const shown = formatReportDateTimeSgt(new Date('2026-12-31T16:30:00Z'));

    // Assert
    expect(shown).toBe('1 Jan 2027 00:30 SGT');
  });
});

describe('SPM-63 AC4: the export filename date is the SGT calendar date of generation', () => {
  // VIEW-REG-INFO-04-A
  // Oracle (SPEC 04-A / 2.5): T0 = 2026-09-29 12:00 SGT -> 2026-09-29.
  // Kills: wrong separator or order.
  it('VIEW-REG-INFO-04-A: noon SGT on 29 Sep is 2026-09-29', () => {
    // Arrange / Act
    const date = sgtCalendarDate(new Date('2026-09-29T04:00:00Z'));

    // Assert
    expect(date).toBe('2026-09-29');
  });

  // VIEW-REG-INFO-04-A-BND
  // Oracle (SPEC 2.5 added BND): 2026-09-30 00:30 SGT is still 29 Sep in UTC (16:30Z) -> filename date 2026-09-30.
  // Kills: M9 filename date taken from UTC.
  it('VIEW-REG-INFO-04-A-BND: half past midnight SGT is the next calendar day', () => {
    // Arrange / Act
    const date = sgtCalendarDate(new Date('2026-09-29T16:30:00Z'));

    // Assert
    expect(date).toBe('2026-09-30');
  });

  // VIEW-REG-INFO-04-A-BND
  // Oracle (derived): the last second of 29 Sep SGT is 15:59:59Z; one second later is 30 Sep SGT.
  // Kills: an off-by-one at the midnight boundary (the UTC boundary is 8 hours earlier).
  it.each([
    ['2026-09-29T15:59:59Z', '2026-09-29'],
    ['2026-09-29T16:00:00Z', '2026-09-30'],
  ])('VIEW-REG-INFO-04-A-BND: %s falls on %s in Singapore', (iso, expected) => {
    // Arrange / Act
    const date = sgtCalendarDate(new Date(iso));

    // Assert
    expect(date).toBe(expected);
  });
});

describe('SPM-63 AC4: PDF header lines', () => {
  // VIEW-REG-INFO-04-B
  // Oracle (SPEC 04-B): EVT-101 runs 9 Oct 2026 18:00-21:00 SGT (10:00Z-13:00Z); the day is not zero padded.
  // Kills: day padding ("09 Oct"); UTC hours; the range separator changed.
  it('VIEW-REG-INFO-04-B: a same-day event reads "9 Oct 2026 18:00-21:00 SGT"', () => {
    // Arrange / Act
    const line = formatReportEventRange(new Date('2026-10-09T10:00:00Z'), new Date('2026-10-09T13:00:00Z'));

    // Assert
    expect(line).toBe('9 Oct 2026 18:00-21:00 SGT');
  });

  // VIEW-REG-INFO-04-B
  // Oracle (ASSUMED A2): a multi-day event repeats the date: start and end are separated by " - ".
  // 2026-10-09T10:00Z = 18:00 SGT; 2026-10-10T19:00Z = 11 Oct 03:00 SGT (the end date is the SGT date, not UTC's 10 Oct).
  // Kills: the end date taken from UTC; a same-day format forced on a multi-day event.
  it('VIEW-REG-INFO-04-B: a multi-day event shows both dates', () => {
    // Arrange / Act
    const line = formatReportEventRange(new Date('2026-10-09T10:00:00Z'), new Date('2026-10-10T19:00:00Z'));

    // Assert
    expect(line).toBe('9 Oct 2026 18:00 - 11 Oct 2026 03:00 SGT');
  });

  // VIEW-REG-INFO-04-B
  // Oracle (SPEC 04-B + ASSUMED A3): "Generated 29 Sep 2026 12:00 SGT" at T0 = 04:00Z.
  // Kills: the label missing; UTC hour (04:00).
  it('VIEW-REG-INFO-04-B: the generated line uses SGT', () => {
    // Arrange / Act
    const line = formatReportGenerated(new Date('2026-09-29T04:00:00Z'));

    // Assert
    expect(line).toBe('Generated 29 Sep 2026 12:00 SGT');
  });
});

describe('SPM-63 AC2: the attendee count and availability lines', () => {
  // VIEW-REG-INFO-02-A
  // Oracle (SPEC 04-B / F3): "3 Attendees Registered (3 / 50)".
  // Kills: wording drift; capacity omitted.
  it('VIEW-REG-INFO-02-A: three of fifty', () => {
    // Arrange / Act
    const line = attendeeCountLine(3, 50);

    // Assert
    expect(line).toBe('3 Attendees Registered (3 / 50)');
  });

  // VIEW-REG-INFO-02-A-BND
  // Oracle (ASSUMED A4 singular): 1 -> "1 Attendee Registered (1 / 50)".
  // Kills: M20 plural always "Attendees".
  it('VIEW-REG-INFO-02-A-BND: one attendee is singular', () => {
    // Arrange / Act
    const line = attendeeCountLine(1, 50);

    // Assert
    expect(line).toBe('1 Attendee Registered (1 / 50)');
  });

  // VIEW-REG-INFO-02-A-BND
  // Oracle (derived): zero is plural in English: "0 Attendees Registered (0 / 50)".
  // Kills: singular chosen for n < 2.
  it('VIEW-REG-INFO-02-A-BND: zero attendees is plural', () => {
    // Arrange / Act
    const line = attendeeCountLine(0, 50);

    // Assert
    expect(line).toBe('0 Attendees Registered (0 / 50)');
  });

  // VIEW-REG-INFO-02-A
  // Oracle (SPEC 02-A: 50 - 3 = 47; ASSUMED A5 wording "{k} spots available", singular "1 spot available").
  // Kills: count and spots swapped; no singular; zero rendered as blank.
  it.each([
    [47, '47 spots available'],
    [1, '1 spot available'],
    [0, '0 spots available'],
  ])('VIEW-REG-INFO-02-A: %i spots reads "%s"', (spots, expected) => {
    // Arrange / Act
    const line = spotsLine(spots);

    // Assert
    expect(line).toBe(expected);
  });
});

// ASSUMPTION index
// A1: "Sep" (not "Sept") for September                      -> VIEW-REG-INFO-03-A-BND
// A2: multi-day event range wording                         -> VIEW-REG-INFO-04-B
// A3: "Generated <date> SGT" wording                        -> VIEW-REG-INFO-04-B
// A4: singular "1 Attendee Registered (1 / N)"              -> VIEW-REG-INFO-02-A-BND
// A5: "{k} spots available", singular "1 spot available"    -> VIEW-REG-INFO-02-A
