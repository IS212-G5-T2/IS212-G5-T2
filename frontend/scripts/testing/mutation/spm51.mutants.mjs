// SPM-51 UI mutants, run by scripts/testing/mutation/run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm51.mutants.mjs
// B06-B12 map the tested interval/operating-day boundaries, stale async route
// responses, and coordinator role alternatives to their focused page suites.
export const SUITES = {
  venues: {
    args: [
      'run',
      'src/features/venues/pages/records/availability.test.ts',
      'src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx',
      'src/features/venues/pages/records/detail/VenueRecordDetailPage.calendar.test.tsx',
      'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx',
      'src/features/venues/pages/catalogue/VenuesPage.test.tsx',
      'src/features/venues/pages/detail/VenueDetailPage.test.tsx',
    ],
  },
};

const CALENDAR = 'src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx';
const DETAIL = 'src/features/venues/pages/detail/VenueDetailPage.tsx';
const CATALOGUE = 'src/features/venues/pages/catalogue/VenuesPage.tsx';

export const MUTANTS = [
  { id: 'B06', name: 'zero-duration calendar selection is accepted', file: CALENDAR, suites: ['venues'],
    edits: [['if (start >= end) return false;', 'if (start > end) return false;']] },
  { id: 'B07', name: 'closed days inside a multi-day selection are ignored', file: CALENDAR, suites: ['venues'],
    edits: [['if (!venue.operatingDays.some((operatingDay) => operatingDay.toLowerCase() === dayName.toLowerCase())) return false;', 'if (false) return false;']] },
  { id: 'B08', name: 'selection may start after the venue closes', file: CALENDAR, suites: ['venues'],
    edits: [['startMinute <= closing', 'startMinute < closing']] },
  { id: 'B09', name: 'selection may not end exactly when the next open day begins', file: CALENDAR, suites: ['venues'],
    edits: [['endMinute >= opening', 'endMinute > opening']] },
  { id: 'B10', name: 'a stale success replaces the venue selected by the current route', file: DETAIL, suites: ['venues'],
    edits: [['if (active) setVenue(record);', 'setVenue(record);']] },
  { id: 'B11', name: 'a stale failure replaces the venue selected by the current route', file: DETAIL, suites: ['venues'],
    edits: [['if (active) {\n          setError(', 'if (true) {\n          setError(']] },
  { id: 'B12', name: 'a coordinator granted as a secondary role loses the availability action', file: CATALOGUE, suites: ['venues'],
    edits: [['const canBook = hasRole(currentUser, "coordinator");', 'const canBook = currentUser.role === "coordinator";']] },
];
