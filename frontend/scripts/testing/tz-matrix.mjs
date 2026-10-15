// Runs the date-sensitive frontend tests under three host time zones: TZ=UTC, TZ=Asia/Singapore and
// TZ=America/Los_Angeles. The SGT formatter pins Asia/Singapore, so the same tests must pass in every zone.
//
//   npm run test:tz            # all three zones, exits 1 if any zone fails
//
// The file list is the set of tests that assert SGT or calendar-date text. Add a file here when a new test asserts
// a date or time string.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ZONES = ['UTC', 'Asia/Singapore', 'America/Los_Angeles'];
const FILES = [
  'src/features/events/lib/registration.test.ts',
  'src/features/events/lib/waitlist.test.ts',
  'src/features/events/pages/detail/EventDetailPage.registration.test.tsx',
  'src/features/events/pages/detail/EventDetailPage.statusHistory.test.tsx',
  'src/features/events/pages/detail/EventDetailPage.withdraw.test.tsx',
  'src/features/events/pages/detail/planning/ConfirmedArrangementsPanel.test.tsx',
  'src/features/events/pages/detail/planning/StatusHistory.test.tsx',
  'src/features/events/pages/detail/registration/RegistrationSection.test.tsx',
  'src/features/events/pages/detail/registration/RegistrationSection.waitlist.test.tsx',
  'src/features/events/pages/detail/registration/RegistrationStatusCard.test.tsx',
  'src/features/events/pages/detail/registration/WithdrawalConfirmation.test.tsx',
  'src/features/events/pages/detail/registration/WithdrawnRegistrationStatus.test.tsx',
  'src/features/registrations/components/report/RegistrationsModal.test.tsx',
  'src/features/registrations/components/report/ReportTable.test.tsx',
  'src/features/registrations/lib/registrationReport.test.ts',
  'src/features/registrations/pages/report/RegistrationReportPage.test.tsx',
  'src/features/venues/pages/records/availability.test.ts',
  'src/features/venues/pages/records/detail/VenueRecordDetailPage.calendar.test.tsx',
  'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx',
  'src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx',
];

const root = fileURLToPath(new URL('../../', import.meta.url));
let failedZones = 0;
for (const zone of ZONES) {
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...FILES], {
    cwd: root,
    env: { ...process.env, TZ: zone },
    stdio: 'inherit',
  });
  const status = result.status ?? 1;
  console.log(`TZ=${zone}: ${status === 0 ? 'passed' : 'FAILED'} (exit ${status})`);
  if (status !== 0) failedZones += 1;
}
process.exit(failedZones === 0 ? 0 : 1);
