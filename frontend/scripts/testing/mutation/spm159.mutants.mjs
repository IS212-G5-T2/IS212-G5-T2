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
    id: 'SPM159-COORDINATOR-STATUS-GUARD',
    name: 'coordinator hold label no longer requires an approved status',
    file: 'src/features/bookings/pages/requests/BookingsPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/bookings/pages/requests/BookingsPage.test.tsx',
      title: 'VEN-HOLD-09-SUP-COORDINATOR shows no hold-state label for a rejected hold or an approved hold without expiry',
    }],
    edits: [[
      'if (booking.status !== "approved" || !booking.holdExpiresAt) return null;',
      'if (!booking.holdExpiresAt) return null;',
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
  {
    id: 'SPM159-SKIP-HOLD-CONFIRMATION',
    name: 'submit action posts the hold without the confirmation modal',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.hold.test.tsx',
      title: 'VEN-HOLD-05-A submits a hold and shows its Pending request summary after confirmation',
    }],
    edits: [[
      'setHoldPrompt(true);',
      'void submitTentativeHoldRequest();',
    ]],
  },
  {
    id: 'SPM159-HOLD-PAYLOAD-KIND',
    name: 'hold confirmation posts an ordinary booking kind',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.hold.test.tsx',
      title: 'VEN-HOLD-05-A submits a hold and shows its Pending request summary after confirmation',
    }],
    edits: [[
      'request_kind: "tentative_hold",',
      'request_kind: "booking",',
    ]],
  },
  {
    id: 'SPM159-CANCEL-SUBMITS-HOLD',
    name: 'cancel in the confirmation modal submits the hold',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.hold.test.tsx',
      title: 'VEN-HOLD-04-A cancels the confirmation without submitting a request',
    }],
    edits: [[
      'onClick={() => setHoldPrompt(false)}',
      'onClick={() => void submitTentativeHoldRequest()}',
    ]],
  },
  {
    id: 'SPM159-HOLD-ERROR-HIDDEN',
    name: 'confirmation modal hides the rejection reason',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.hold.test.tsx',
      title: 'VEN-HOLD-12-B keeps one modal open with a clear error and permits retry',
    }],
    edits: [[
      '<p>{holdError}</p>',
      '<p></p>',
    ]],
  },
  {
    id: 'SPM159-HOLD-RETRY-LABEL',
    name: 'confirmation modal offers no retry action after a failure',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.hold.test.tsx',
      title: 'VEN-HOLD-12-B keeps one modal open with a clear error and permits retry',
    }],
    edits: [[
      '? "Retry request"',
      '? "Confirm request"',
    ]],
  },
  {
    id: 'SPM159-OCCUPIED-PERIOD-TEXT',
    name: 'confirmation modal shows the event range as the occupied period',
    file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/venues/pages/records/detail/VenueRecordDetailPage.hold.test.tsx',
      title: 'VEN-HOLD-02-A displays the event time and calculated occupied period',
    }],
    edits: [[
      '{formatVenueOccupiedRange(',
      '{formatVenueRange(',
    ]],
  },
  {
    id: 'SPM159-STAFF-REASSESSMENT-CARD',
    name: 'Pending card omits the setup reassessment notice',
    file: 'src/features/bookings/pages/requests/BookingCard.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/bookings/pages/requests/BookingsPage.test.tsx',
      title: 'VEN-HOLD-13-A shows the reassessment flag on a Pending card and review dialog',
    }],
    edits: [[
      'booking.reassessmentRequired && booking.status === "pending"',
      'false && booking.status === "pending"',
    ]],
  },
  {
    id: 'SPM159-STAFF-REASSESSMENT-DIALOG',
    name: 'review dialog omits the setup reassessment notice',
    file: 'src/features/bookings/pages/requests/BookingDetailModal.tsx',
    suites: ['holdUi'],
    testMappings: [{
      suite: 'holdUi',
      file: 'src/features/bookings/pages/requests/BookingsPage.test.tsx',
      title: 'VEN-HOLD-13-A shows the reassessment flag on a Pending card and review dialog',
    }],
    edits: [[
      'booking.reassessmentRequired && booking.status === "pending"',
      'false && booking.status === "pending"',
    ]],
  },
];
