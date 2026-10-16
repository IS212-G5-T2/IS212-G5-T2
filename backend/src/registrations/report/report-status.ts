/*
 * SPM-63 report status filter (SPM-138 owner decision). The report lists every registration status; the optional `status`
 * query parameter narrows it to one or more of the five API values, comma-separated. An unknown value is a 400 with the
 * registration validation shape. Access is decided before this runs (the controller calls the service first).
 */
import { BadRequestException } from '@nestjs/common';
import { MESSAGES, REGISTRATION_ERROR_CODES } from '../helpers/messages.js';
import { REPORT_STATUSES, type ReportStatus } from './report-types.js';

/** The stored status behind each API value. */
export const REPORT_DB_STATUS: Record<ReportStatus, string> = {
  registered: 'Registered',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
  removed: 'Removed',
  cancelled: 'Cancelled',
};

/** The API value for each stored status (the reverse of REPORT_DB_STATUS). */
export const DB_TO_REPORT_STATUS: Record<string, ReportStatus> = Object.fromEntries(
  REPORT_STATUSES.map((value) => [REPORT_DB_STATUS[value], value]),
);

/** Every stored status the report lists when no filter is given. */
export const ALL_REPORT_DB_STATUSES: readonly string[] = REPORT_STATUSES.map((s) => REPORT_DB_STATUS[s]);

/**
 * Parses the `status` query parameter. Absent means every status (undefined). Otherwise one or more of the API values,
 * comma-separated; duplicates are removed. Anything else (an empty value, an unknown name, a blank list item) is a 400.
 */
export function parseReportStatusFilter(raw: unknown): ReportStatus[] | undefined {
  if (raw === undefined) return undefined;
  const values = typeof raw === 'string' ? raw.split(',').map((value) => value.trim()) : [];
  const unknown = values.filter((value) => !(REPORT_STATUSES as readonly string[]).includes(value));
  if (values.length === 0 || unknown.length > 0) {
    throw new BadRequestException({
      statusCode: 400,
      code: REGISTRATION_ERROR_CODES.validation,
      message: MESSAGES.validation,
      errors: {
        status: `Use one or more of ${REPORT_STATUSES.join(', ')}, separated by commas.`,
      },
    });
  }
  return [...new Set(values as ReportStatus[])];
}
