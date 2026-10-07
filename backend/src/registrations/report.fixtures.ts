/*
 * SPM-63 test fixtures: the suite clock and the EVT-101 report from the Confluence cases (labels such as
 * EVT-101 and REG-9001 are the case ids; the repo's own ids are UUIDs). Test-only; excluded from the build.
 */
import type { RegistrationReport, ReportRow } from './report-types.js';

/** Suite clock T0 = 2026-09-29T12:00:00+08:00. */
export const T0 = new Date('2026-09-29T12:00:00+08:00');
export const T0_ISO = '2026-09-29T04:00:00.000Z';

export const EVT_101_ID = '11111111-1111-4111-8111-111111111101';

/** REG-9007: ATT-04 Dev Patel, registered 27 Sep 2026 15:00 SGT. */
export const DEV_PATEL: ReportRow = {
  registrationId: '00000000-0000-4000-8000-000000009007',
  fullName: 'Dev Patel',
  email: 'dev.patel@example.com',
  contactNumber: '87654321',
  registeredAt: '2026-09-27T07:00:00.000Z',
  status: 'Confirmed',
};

/** REG-9001: ATT-01 Alice Tan, registered 28 Sep 2026 10:30 SGT. */
export const ALICE_TAN: ReportRow = {
  registrationId: '00000000-0000-4000-8000-000000009001',
  fullName: 'Alice Tan',
  email: 'alice.tan@example.com',
  contactNumber: '98765432',
  registeredAt: '2026-09-28T02:30:00.000Z',
  status: 'Confirmed',
};

/** REG-EXTRA-01: ATT-03 Chloe Ng, registered 29 Sep 2026 09:00 SGT. */
export const CHLOE_NG: ReportRow = {
  registrationId: '00000000-0000-4000-8000-000000000e01',
  fullName: 'Chloe Ng',
  email: 'chloe.ng@example.com',
  contactNumber: '91234567',
  registeredAt: '2026-09-29T01:00:00.000Z',
  status: 'Confirmed',
};

/** The three Confirmed rows in registration-date order (D7). */
export const THREE_ROWS: ReportRow[] = [DEV_PATEL, ALICE_TAN, CHLOE_NG];

/** EVT-101 "Tech Talk: Cloud 101", capacity 50, 9 Oct 2026 18:00-21:00 SGT. */
export function makeReport(overrides: Partial<RegistrationReport> = {}): RegistrationReport {
  const registrations = overrides.registrations ?? THREE_ROWS.map((row) => ({ ...row }));
  return {
    event: {
      id: EVT_101_ID,
      name: 'Tech Talk: Cloud 101',
      startDateTime: '2026-10-09T10:00:00.000Z',
      endDateTime: '2026-10-09T13:00:00.000Z',
      capacity: 50,
    },
    totalConfirmed: registrations.length,
    availableSpots: 50 - registrations.length,
    generatedAt: T0_ISO,
    ...overrides,
    registrations,
  };
}

export const makeRow = (overrides: Partial<ReportRow> = {}): ReportRow => ({ ...DEV_PATEL, ...overrides });
