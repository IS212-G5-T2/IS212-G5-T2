/*
 * SPM-63 report status filter (SPM-138 owner decision), unit level: the parser that turns the `status` query parameter into
 * the list of API values. Access is decided before this runs (see the service), so only the parsing is asserted here.
 * Test cases: REP-STATUS-02-C-ERR (unknown and empty values are a 400 with the validation shape), REP-STATUS-02-D (absent
 * means every status; a list keeps each value once, in the order given).
 */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ALL_REPORT_DB_STATUSES, DB_TO_REPORT_STATUS, REPORT_DB_STATUS, parseReportStatusFilter } from './report-status.js';

describe('REP-STATUS-02-D: the status parameter', () => {
  it('REP-STATUS-02-D-BND: an absent parameter means every status (no filter)', () => {
    expect(parseReportStatusFilter(undefined)).toBeUndefined();
    expect(ALL_REPORT_DB_STATUSES).toEqual(['Registered', 'Waitlisted', 'Withdrawn', 'Removed', 'Cancelled']);
  });

  it('REP-STATUS-02-D: a comma-separated list keeps each value once, in the order given', () => {
    expect(parseReportStatusFilter('waitlisted,registered,waitlisted')).toEqual(['waitlisted', 'registered']);
    expect(parseReportStatus(' withdrawn , cancelled ')).toEqual(['withdrawn', 'cancelled']);
  });

  it('maps every API value to its stored status and back', () => {
    for (const [api, stored] of Object.entries(REPORT_DB_STATUS)) expect(DB_TO_REPORT_STATUS[stored]).toBe(api);
  });
});

describe('REP-STATUS-02-C-ERR: unknown or empty values are refused', () => {
  it.each([['pending'], [''], ['registered,'], ['Registered'], ['registered,,waitlisted']])(
    'REP-STATUS-02-C-ERR-UNIT: %j is a 400 with the registration validation shape',
    (value) => {
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
    },
  );

  it('an array (a repeated parameter) is refused', () => {
    expect(() => parseReportStatusFilter(['registered', 'waitlisted'])).toThrow(BadRequestException);
  });
});

function parseReportStatus(value: string) {
  return parseReportStatusFilter(value);
}
