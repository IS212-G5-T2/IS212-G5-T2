// SPM-51 UI mutants, run by scripts/testing/mutation/run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm51.mutants.mjs
// FE-B06-FE-B17 map the tested interval/operating-day boundaries, route context,
// server-backed reservations, stale async responses, and role alternatives.
export const EXPECTED_ID_PREFIX = 'FE-B';

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
  routeContext: {
    args: [
      'run',
      'src/features/venues/pages/catalogue/VenuesPage.test.tsx',
      'src/features/venues/pages/detail/VenueDetailPage.test.tsx',
    ],
  },
};

const CALENDAR = 'src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx';
const DETAIL = 'src/features/venues/pages/detail/VenueDetailPage.tsx';
const CATALOGUE = 'src/features/venues/pages/catalogue/VenuesPage.tsx';
const VENUE_CARD = 'src/features/venues/pages/catalogue/VenueCard.tsx';

const testCase = (file, title) => ({ file, title });

export const MUTANTS = [
  { id: 'FE-B06', name: 'zero-duration calendar selection is accepted', file: CALENDAR, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'rejects closed weekdays and non-positive ranges')],
    edits: [['if (start >= end) return false;', 'if (start > end) return false;']] },
  { id: 'FE-B07', name: 'closed days inside a multi-day selection are ignored', file: CALENDAR, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'rejects closed weekdays and non-positive ranges'), testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'passes valid cross-day ranges and rejects closed-day or out-of-hour ranges through selectAllow')],
    edits: [['if (!venue.operatingDays.some((operatingDay) => operatingDay.toLowerCase() === dayName.toLowerCase())) return false;', 'if (false) return false;']] },
  { id: 'FE-B08', name: 'selection may start after the venue closes', file: CALENDAR, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'passes valid cross-day ranges and rejects closed-day or out-of-hour ranges through selectAllow')],
    edits: [['startMinute <= closing', 'startMinute < closing']] },
  { id: 'FE-B09', name: 'selection may not end exactly when the next open day begins', file: CALENDAR, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'passes valid cross-day ranges and rejects closed-day or out-of-hour ranges through selectAllow')],
    edits: [['endMinute >= opening', 'endMinute > opening']] },
  { id: 'FE-B10', name: 'a stale success replaces the venue selected by the current route', file: DETAIL, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/detail/VenueDetailPage.test.tsx', 'keeps the route-selected venue when an earlier detail request resolves last')],
    edits: [['if (active) setVenue(record);', 'setVenue(record);']] },
  { id: 'FE-B11', name: 'a stale failure replaces the venue selected by the current route', file: DETAIL, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/detail/VenueDetailPage.test.tsx', 'does not replace the new venue with an earlier request error')],
    edits: [['if (active) {\n          setError(', 'if (true) {\n          setError(']] },
  { id: 'FE-B12', name: 'a coordinator granted as a secondary role loses the availability action', file: CATALOGUE, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/catalogue/VenuesPage.test.tsx', 'shows the availability action to coordinator roles and hides it from other roles')],
    edits: [['const canBook = hasRole(currentUser, "coordinator");', 'const canBook = currentUser.role === "coordinator";']] },
  { id: 'FE-B15', name: 'venue details link drops its event catalogue context', file: VENUE_CARD, suites: ['routeContext'],
    kills: [testCase('src/features/venues/pages/catalogue/VenuesPage.test.tsx', 'fetches and renders catalogue records when opened for a specific event')],
    edits: [['? `?${new URLSearchParams({ eventId }).toString()}`', '? ""']] },
  { id: 'FE-B16', name: 'detail page returns to the catalogue without its event context', file: DETAIL, suites: ['routeContext'],
    kills: [testCase('src/features/venues/pages/detail/VenueDetailPage.test.tsx', 'returns to the event-specific catalogue when eventId is present')],
    edits: [['? `/venues?${new URLSearchParams({ eventId }).toString()}`', '? "/venues"']] },
  { id: 'FE-B17', name: 'venue detail uses stale app-store bookings instead of the API reservations', file: DETAIL, suites: ['routeContext'],
    kills: [testCase('src/features/venues/pages/detail/VenueDetailPage.test.tsx', 'renders server-backed confirmed bookings and active holds instead of app-store bookings')],
    edits: [
      ['import { useEffect, useState } from "react";', 'import { useEffect, useState } from "react";\nimport { useAppStore } from "@/store/useAppStore";'],
      ['  const { id } = useParams();', '  const { id } = useParams();\n  const staleBookings = useAppStore((s) => s.bookings);'],
      ['const venueBookings = venue.reservations ?? [];', 'const venueBookings = staleBookings.filter((booking) => booking.venueId === venue.id) as unknown as typeof venue.reservations;'],
    ] },
];
