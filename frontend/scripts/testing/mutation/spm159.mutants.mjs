// Focused SPM-159 frontend mutation for active-hold visibility on the venue record page.
export const SUITES = {
  holdUi: {
    args: [
      'run',
      'src/features/venues/pages/records/detail/VenueRecordDetailPage.hold.test.tsx',
      'src/features/bookings/pages/requests/BookingsPage.test.tsx',
    ],
  },
};

export const MUTANTS = [
  {
    id: 'SPM159-EXPIRED-HOLD-VISIBLE',
    name: 'expired approved hold remains visible in venue upcoming holds',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.hold.test.tsx',
      title: 'VEN-HOLD-04-A shows an approved active hold in the venue list and omits an expired hold',
    }],
    edits: [[
      'Date.parse(reservation.holdExpiresAt) > availabilityNow',
      'true',
    ]],
  },
  {
    id: 'SPM159-EXPIRED-HOLD-LABEL',
    name: 'staff UI calls an expired approved tentative hold active',
    file: 'src/features/bookings/pages/requests/BookingCard.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/bookings/pages/requests/BookingsPage.test.tsx',
      title: 'VEN-HOLD-09-SUP-LOOKUP labels an approved hold expired after its cutoff',
    }],
    edits: [[
      'booking.holdExpired ? "Expired tentative hold" : "Active tentative hold"',
      '"Active tentative hold"',
    ]],
  },
  {
    id: 'SPM159-COORDINATOR-HOLD-LABEL',
    name: 'coordinator booking cards omit tentative hold state labels',
    file: 'src/features/bookings/pages/requests/BookingsPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/bookings/pages/requests/BookingsPage.test.tsx',
      title: 'VEN-HOLD-09-SUP-COORDINATOR shows coordinator hold state and expiry from the API',
    }],
    edits: [[
      'if (booking.requestKind !== "tentative_hold") return null;',
      'if (booking.requestKind === "tentative_hold") return null;',
    ]],
  },
  {
    id: 'SPM159-COORDINATOR-HOLD-EXPIRY-TEXT',
    name: 'coordinator hold cards format the event start instead of hold expiry',
    file: 'src/features/bookings/pages/requests/BookingsPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/bookings/pages/requests/BookingsPage.test.tsx',
      title: 'VEN-HOLD-09-SUP-COORDINATOR shows coordinator hold state and expiry from the API',
    }],
    edits: [[
      'formatSingaporeDateTime(booking.holdExpiresAt)',
      'formatSingaporeDateTime(booking.start)',
    ]],
  },
];
