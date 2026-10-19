export const SUITES = {
  coordinatorBookings: {
    args: ['run', 'src/features/bookings/pages/requests/BookingsPage.test.tsx'],
  },
  venueSuitability: {
    args: ['run', 'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx'],
  },
  availabilityRoute: {
    args: ['run', 'src/app/App.test.tsx'],
  },
  availabilityNavigation: {
    args: ['run', 'src/components/layout/navConfig.test.ts'],
  },
  venueCalendar: {
    args: ['run', 'src/features/venues/pages/records/detail/VenueRecordDetailPage.calendar.test.tsx'],
  },
  eventVenueChecklist: {
    args: [
      'run',
      'src/features/events/pages/detail/planning/PlanningInformationPage.test.tsx',
      'src/features/events/pages/detail/planning/activeVenueRequests.test.ts',
    ],
  },
  eventVenuePanel: {
    args: ['run', 'src/features/events/pages/detail/planning/PlanningInformationPanel.test.tsx'],
  },
  statusLabels: {
    args: ['run', 'src/features/events/components/StatusLabels.test.tsx'],
  },
};

const PAGE = 'src/features/bookings/pages/requests/BookingsPage.tsx';

export const MUTANTS = [
  {
    id: 'SPM54-FE-COORDINATOR-HISTORY',
    name: 'Coordinator booking history is hidden',
    file: PAGE,
    suites: ['coordinatorBookings'],
    kills: [
      {
        file: 'src/features/bookings/pages/requests/BookingsPage.test.tsx',
        title: 'VEN-BKG-08-A SPM-54 shows API-backed event, venue, and booking status',
      },
    ],
    edits: [
      [
        'const coordinator = hasRole(currentUser, "coordinator");',
        'const coordinator = false;',
      ],
    ],
  },
  {
    id: 'SPM54-FE-REPLACEMENT-LINK',
    name: 'cancelled or affected bookings do not offer replacement search',
    file: PAGE,
    suites: ['coordinatorBookings'],
    kills: [
      {
        file: 'src/features/bookings/pages/requests/BookingsPage.test.tsx',
        title: 'VEN-BKG-05-A VEN-BKG-06-A SPM-54 shows replacement context and preserves the affected booking history',
      },
    ],
    edits: [
      [
        '(booking.status === "cancelled" ||\n                            booking.status === "rejected" ||\n                            booking.affected)',
        '(booking.status === "cancelled" &&\n                            booking.status === "rejected" &&\n                            booking.affected)',
      ],
    ],
  },
  {
    id: 'SPM54-FE-EVENT-CONTEXT',
    name: 'Coordinator booking cards omit the event context',
    file: PAGE,
    suites: ['coordinatorBookings'],
    kills: [
      {
        file: 'src/features/bookings/pages/requests/BookingsPage.test.tsx',
        title: 'VEN-BKG-08-A SPM-54 shows API-backed event, venue, and booking status',
      },
    ],
    edits: [
      [
        '<h3 className="font-semibold text-gray-900 dark:text-gray-100">\n                              {booking.eventName}\n                            </h3>',
        '<h3 className="font-semibold text-gray-900 dark:text-gray-100">\n                              {booking.venueName}\n                            </h3>',
      ],
    ],
  },
  {
    id: 'SPM54-FE-CANCEL-ROW-ISOLATION',
    name: 'Cancelling one booking changes every event booking row',
    file: PAGE,
    suites: ['coordinatorBookings'],
    edits: [
      [
        'row.id === booking.id ? { ...row, status: "cancelled" } : row',
        '{ ...row, status: "cancelled" }',
      ],
    ],
  },
  {
    id: 'SPM54-FE-CAPACITY-EQUALITY',
    name: 'venue capacity equal to attendance is incorrectly rejected',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['venueSuitability'],
    kills: [
      {
        file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx',
        title: 'VEN-BKG-01-BND-1 SPM-54 accepts capacity exactly equal to attendance',
      },
    ],
    edits: [['venue.capacity < event.expectedAttendance', 'venue.capacity <= event.expectedAttendance']],
  },
  {
    id: 'SPM54-FE-AVAILABILITY-ROUTE',
    name: 'retired local-store venue availability route remains directly accessible',
    file: 'src/app/App.tsx',
    suites: ['availabilityRoute'],
    kills: [
      {
        file: 'src/app/App.test.tsx',
        title: 'SPM54-ROUTE-RETIRE-01 redirects the retired venue availability route to Venue Records',
      },
    ],
    edits: [['path="/venues/availability" element={<Navigate to="/venue-records" replace />}', 'path="/venues/availability" element={<Navigate to="/events" replace />}']],
  },
  {
    id: 'SPM54-FE-AVAILABILITY-NAV',
    name: 'retired venue availability route is exposed in navigation',
    file: 'src/components/layout/navConfig.ts',
    suites: ['availabilityNavigation'],
    kills: [
      {
        file: 'src/components/layout/navConfig.test.ts',
        title: 'SPM54-ROUTE-RETIRE-01 does not expose the retired venue availability route in navigation',
      },
    ],
    edits: [[
      '  coordinator: [\n    { label: "Events", to: "/events", icon: "📅", feature: "Feature 3, 4, 5, 6" },\n    { label: "Venue Records", to: "/venue-records", icon: "🏛️", feature: "SPM-124" },',
      '  coordinator: [\n    { label: "Events", to: "/events", icon: "📅", feature: "Feature 3, 4, 5, 6" },\n    { label: "Venue Availability", to: "/venues/availability", icon: "🏛️", feature: "SPM-124" },',
    ]],
  },
  {
    id: 'SPM54-FE-MOBILE-DAY-VIEW',
    name: 'phone widths retain the week view instead of switching to a day',
    file: 'src/features/venues/pages/records/detail/VenueScheduleCalendar.tsx',
    suites: ['venueCalendar'],
    kills: [
      {
        file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.calendar.test.tsx',
        title: 'SPM54-UI-MODE-01 adapts calendar view across phone and tablet widths and cleans up its listener',
      },
    ],
    edits: [['const breakpoint = window.matchMedia("(max-width: 639px)");', 'const breakpoint = window.matchMedia("(max-width: 0px)");']],
  },
  {
    id: 'SPM54-FE-ASSIGNED-TIME-EDIT',
    name: 'assigned event start time is editable in the booking form',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['venueSuitability'],
    kills: [
      {
        file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.test.tsx',
        title: 'SPM-54 SPM54-UI-MODE-01 keeps the selected event period fixed when other assigned events are cached',
      },
    ],
    edits: [[
      'aria-label="Event starts"\n                          type="datetime-local"\n                          value={start}\n                          readOnly',
      'aria-label="Event starts"\n                          type="datetime-local"\n                          value={start}',
    ]],
  },
  {
    id: 'SPM54-FE-CALENDAR-RANGE-LOCK',
    name: 'event-linked calendar drag changes the assigned event period',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['venueCalendar'],
    kills: [
      {
        file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.calendar.test.tsx',
        title: 'SPM54-UI-MODE-01 keeps the assigned event period when calendar range selection is attempted',
      },
    ],
    edits: [[
      'onSelectRange={undefined}',
      'onSelectRange={() => setStart("2030-01-12T16:00")}',
    ]],
  },
  {
    id: 'SPM54-FE-EVENT-CHECKLIST-CANCELLED',
    name: 'cancelled venue requests remain in the active event venue checklist',
    file: 'src/features/events/pages/detail/planning/activeVenueRequests.ts',
    suites: ['eventVenueChecklist'],
    kills: [
      {
        file: 'src/features/events/pages/detail/planning/activeVenueRequests.test.ts',
        title: "VEN-BKG-09-A filters only cancelled venue requests from the event's active list",
      },
    ],
    edits: [[
      'return requests.filter((request) => request.status !== "cancelled");',
      'return requests.filter(() => true);',
    ]],
  },
  {
    id: 'SPM54-FE-EVENT-PANEL-CANCELLED',
    name: 'cancelled venue booking remains in the event active venue panel',
    file: 'src/features/events/pages/detail/planning/PlanningInformationPanel.tsx',
    suites: ['eventVenuePanel'],
    kills: [
      {
        file: 'src/features/events/pages/detail/planning/PlanningInformationPanel.test.tsx',
        title: 'VEN-BKG-09-A hides a cancelled venue booking while keeping other active venues visible',
      },
    ],
    edits: [['(booking) => booking.status.toLowerCase() !== "cancelled"', '() => true']],
  },
  {
    id: 'SPM54-FE-CANCELLED-DETAIL-LABEL',
    name: 'cancelled venue detail remains green when request status is approved',
    file: 'src/features/events/components/StatusLabels.tsx',
    suites: ['statusLabels'],
    kills: [{ file: 'src/features/events/components/StatusLabels.test.tsx', title: 'VEN-BKG-08-A SPM-54 labels a Cancelled booking as unavailable when request status is approved' }],
    edits: [['if (booking.status === "Cancelled") return { label: "Unavailable", tone: "red" };', 'if (booking.status === "Unavailable") return { label: "Unavailable", tone: "red" };']],
  },
  {
    id: 'SPM54-FE-CANCELLED-CARD-LABEL',
    name: 'cancelled venue is omitted from event card unavailable labels',
    file: 'src/features/events/components/StatusLabels.tsx',
    suites: ['statusLabels'],
    kills: [{ file: 'src/features/events/components/StatusLabels.test.tsx', title: 'VEN-BKG-09-A SPM-54 labels a cancelled event venue as unavailable on the card' }],
    edits: [[
      '    case "released":\n    case "cancelled":\n      labels.push({ label: "Venue Unavailable", tone: "red" });',
      '    case "released":\n      labels.push({ label: "Venue Unavailable", tone: "red" });',
    ]],
  },
  {
    id: 'SPM54-FE-APPROVED-CARD-LABEL',
    name: 'approved venue without equipment is not shown as reserved on the event card',
    file: 'src/features/events/components/StatusLabels.tsx',
    suites: ['statusLabels'],
    kills: [{ file: 'src/features/events/components/StatusLabels.test.tsx', title: 'VEN-BKG-08-A SPM-54 labels an approved venue as reserved when no equipment is needed' }],
    edits: [['const venueReserved = event.venueRequestStatus === "approved";', 'const venueReserved = false;']],
  },
];
