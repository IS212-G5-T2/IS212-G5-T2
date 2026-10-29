// SPM-51 UI mutants, run by scripts/testing/mutation/run.mjs:
//   node scripts/testing/mutation/run.mjs --mutants spm51.mutants.mjs
// FE-B06-FE-B09 map positive-duration and full-day availability boundaries; FE-B10-FE-B17 map route context,
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
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'rejects zero-length, reversed, and invalid ranges')],
    edits: [['start < end', 'start <= end']] },
  { id: 'FE-B07', name: 'free availability stops shading before the start of the day', file: CALENDAR, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'shades clear periods over a full SGT day without an operating-hours label')],
    edits: [['`${dayKey}T00:00`).toISOString()', '`${dayKey}T09:00`).toISOString()']] },
  { id: 'FE-B08', name: 'free availability stops shading before the end of the day', file: CALENDAR, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'shades clear periods over a full SGT day without an operating-hours label')],
    edits: [['`${nextDay.toISOString().slice(0, 10)}T00:00`', '`${nextDay.toISOString().slice(0, 10)}T18:00`']] },
  { id: 'FE-B09', name: 'selection is restricted to an invented opening hour', file: CALENDAR, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'allows daytime, weekend, overnight, and after-hours selections')],
    edits: [['start < end', 'start < end && start.getUTCHours() >= 8']] },
  { id: 'FE-B10', name: 'a stale success replaces the venue selected by the current route', file: DETAIL, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/detail/VenueDetailPage.test.tsx', 'keeps the route-selected venue when an earlier detail request resolves last')],
    edits: [['if (active) setVenue(record);', 'setVenue(record);']] },
  { id: 'FE-B11', name: 'a stale failure replaces the venue selected by the current route', file: DETAIL, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/detail/VenueDetailPage.test.tsx', 'does not replace the new venue with an earlier request error')],
    edits: [['if (active) {\n          setError(', 'if (true) {\n          setError(']] },
  { id: 'FE-B12', name: 'a coordinator granted as a secondary role loses the availability action', file: CATALOGUE, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/catalogue/VenuesPage.test.tsx', 'preserves event scope for users with a secondary coordinator role')],
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
  { id: 'FE-B18', name: 'calendar minimum time regresses from midnight to venue opening time', file: CALENDAR, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'shows a full-day time grid with a neutral default scroll position')],
    edits: [['slotMinTime="00:00:00"', 'slotMinTime="09:00:00"']] },
  { id: 'FE-B19', name: 'calendar maximum time regresses from midnight to venue closing time', file: CALENDAR, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/records/detail/VenueScheduleCalendar.test.tsx', 'shows a full-day time grid with a neutral default scroll position')],
    edits: [['slotMaxTime="24:00:00"', 'slotMaxTime="18:00:00"']] },
  { id: 'FE-B20', name: 'secondary-role coordinator loses the selected event scope when opening availability', file: CATALOGUE, suites: ['venues'],
    kills: [testCase('src/features/venues/pages/catalogue/VenuesPage.test.tsx', 'preserves event scope for users with a secondary coordinator role')],
    edits: [['new URLSearchParams({ eventId: selectedEvent.id })', 'new URLSearchParams()']] },
];
