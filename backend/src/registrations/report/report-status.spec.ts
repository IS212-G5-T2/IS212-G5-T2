/*
 * SPM-63 report status filter (SPM-138 owner decision), unit level: the parser that turns the `status` query parameter into
 * the list of API values, and the mapping between API values and stored statuses. Access is decided before this runs (see
 * the service), so only the parsing is asserted here. End-to-end cases are in test/registrations.report.e2e-spec.ts.
 * Oracle source: the owner decision (registrations report lists every status; the filter takes one or more values).
 */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ALL_REPORT_DB_STATUSES, DB_TO_REPORT_STATUS, parseReportStatusFilter } from './report-status.js';

describe('REP-STATUS-02-D: the status parameter keeps the chosen values', () => {
  // Kills: ALL-NARROWED (the unfiltered list of stored statuses drops a status)
  it('REP-STATUS-02-D-BND: an absent parameter means every stored status, and no filter', () => {
    expect(parseReportStatusFilter(undefined)).toBeUndefined();
    expect(ALL_REPORT_DB_STATUSES).toEqual(['Registered', 'Waitlisted', 'Withdrawn', 'Removed', 'Cancelled']);
  });

  // Kills: FILTER-ONE-ONLY-U (the list keeps only its first value)
  it('REP-STATUS-02-D: a comma-separated list keeps each value once, in the order given', () => {
    expect(parseReportStatusFilter('waitlisted,registered,waitlisted')).toEqual(['waitlisted', 'registered']);
    expect(parseReportStatusFilter(' withdrawn , cancelled ')).toEqual(['withdrawn', 'cancelled']);
  });
});

describe('REP-STATUS-02-C-ERR: unknown or empty values are refused with the validation shape', () => {
  // Kills: FILTER-UNKNOWN-IGNORED-U (an unknown or blank value is ignored instead of refused)
  it.each([
    ['pending'],
    [''],
    ['registered,'],
    ['Registered'],
    ['registered,,waitlisted'],
  ])('REP-STATUS-02-C-ERR-UNIT: %j is a 400 with the registration validation shape', (value) => {
    let error: unknown;
    try {
      parseReportStatusFilter(value);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      statusCode: 400,
      code: 'validation_error',
      message: 'Please correct the highlighted fields.',
      errors: { status: expect.any(String) },
    });
  });

  // Kills: FILTER-ARRAY-ACCEPTED (a repeated parameter, which arrives as an array, is joined and accepted)
  it('REP-STATUS-02-C-ERR-ARRAY: a repeated parameter (an array) is refused', () => {
    expect(() => parseReportStatusFilter(['registered', 'waitlisted'])).toThrow(BadRequestException);
  });
});

describe('each API value maps to its stored status and back', () => {
  // Kills: DB-MAP-SWAP (the Waitlisted API value is mapped to the Removed stored status)
  it('REP-STATUS-02-E-MAP: registered, waitlisted, withdrawn, removed and cancelled map to their stored statuses', () => {
    expect(DB_TO_REPORT_STATUS).toEqual({
      Registered: 'registered',
      Waitlisted: 'waitlisted',
      Withdrawn: 'withdrawn',
      Removed: 'removed',
      Cancelled: 'cancelled',
    });
  });
});
