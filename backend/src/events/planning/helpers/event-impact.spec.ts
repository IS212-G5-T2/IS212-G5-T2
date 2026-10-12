import { describe, expect, it } from 'vitest';
import {
  TURNAROUND_MINUTES,
  assessVenueBookings,
  withinWindow,
  type VenueBookingInput,
} from './event-impact.js';

/**
 * SPM-85 AC2, AC6, AC7 — impact assessment of a proposed change against each
 * venue booking of an event, including setup/turnaround clashes. SPM-49 AC3/AC5
 * — a change that stays compatible with a booking leaves it unimpacted, so it
 * can be applied immediately. Confluence IDs: EVENT-FLAG-02-A/B/C,
 * EVENT-FLAG-02-BND-1, EVENT-FLAG-06-A, EVENT-FLAG-07-A, EVENT-UPDATE-05-B.
 */

const MINUTE = 60_000;
const iso = (time: string) => `2026-11-10T${time}:00.000Z`;
const shift = (value: string, minutes: number) =>
  new Date(Date.parse(value) + minutes * MINUTE).toISOString();

const START = iso('10:00');
const END = iso('13:00');
const T = TURNAROUND_MINUTES;

function booking(
  overrides: Partial<VenueBookingInput> = {},
): VenueBookingInput {
  return {
    id: 'bk-1',
    venueId: 'venue-a',
    venueName: 'Hall A',
    capacity: 200,
    start: START,
    end: END,
    neighbours: [],
    ...overrides,
  };
}

// Another event's booking at the same venue.
function neighbour(start: string, end: string, id = 'nb-1') {
  return { id, eventName: 'Chemistry Workshop', start, end };
}

describe('assessVenueBookings', () => {
  // Guard: the boundary cases below assume a positive turnaround buffer.
  it('uses a positive turnaround buffer', () => {
    expect(T).toBeGreaterThan(0);
  });

  // EVENT-FLAG-02-A: a proposed window that overlaps another event is an overlap.
  it('EVENT-FLAG-02-A reports an overlap with another event at the same venue', () => {
    const [result] = assessVenueBookings({ endDateTime: iso('15:00') }, [
      booking({ neighbours: [neighbour(iso('14:00'), iso('16:00'))] }),
    ]);
    expect(result.impacted).toBe(true);
    // The move leaves the held window ('window') and lands on the neighbour.
    expect(result.conflicts.map((c) => c.kind)).toEqual(['window', 'overlap']);
    expect(result.conflicts[1]).toMatchObject({
      kind: 'overlap',
      withBookingId: 'nb-1',
    });
  });

  // EVENT-FLAG-02-B: a gap shorter than setup/turnaround time is also a conflict.
  it('EVENT-FLAG-02-B reports a turnaround conflict when the gap is too short', () => {
    // Start moved one hour earlier, to within T-1 minutes of the neighbour.
    const earlier = shift(START, -60);
    const [result] = assessVenueBookings({ startDateTime: earlier }, [
      booking({
        neighbours: [neighbour(shift(earlier, -120), shift(earlier, -(T - 1)))],
      }),
    ]);
    expect(result.conflicts[1]).toMatchObject({
      kind: 'turnaround',
      withBookingId: 'nb-1',
    });
  });

  // EVENT-FLAG-02-BND-1: just below, at and just above the turnaround buffer.
  // Each case moves the booking one hour outside its held window (start one
  // hour earlier, or end one hour later), so a 'window' conflict always comes
  // first; the boundary decides what, if anything, follows it.
  const S2 = shift(START, -60);
  const E2 = shift(END, 60);
  it.each([
    [
      'gap equals the turnaround buffer before',
      { startDateTime: S2 },
      neighbour(shift(S2, -180), shift(S2, -T)),
      undefined,
    ],
    [
      'gap one minute short before',
      { startDateTime: S2 },
      neighbour(shift(S2, -180), shift(S2, -(T - 1))),
      'turnaround',
    ],
    [
      'bookings touch before',
      { startDateTime: S2 },
      neighbour(shift(S2, -180), S2),
      'turnaround',
    ],
    [
      'overlap by one minute at the start',
      { startDateTime: S2 },
      neighbour(shift(S2, -180), shift(S2, 1)),
      'overlap',
    ],
    [
      'gap equals the turnaround buffer after',
      { endDateTime: E2 },
      neighbour(shift(E2, T), shift(E2, T + 180)),
      undefined,
    ],
    [
      'gap one minute short after',
      { endDateTime: E2 },
      neighbour(shift(E2, T - 1), shift(E2, T + 180)),
      'turnaround',
    ],
    [
      'overlap by one minute at the end',
      { endDateTime: E2 },
      neighbour(shift(E2, -1), shift(E2, 180)),
      'overlap',
    ],
  ])('EVENT-FLAG-02-BND-1 %s', (_label, proposal, other, expectedKind) => {
    const [result] = assessVenueBookings(proposal, [
      booking({ neighbours: [other] }),
    ]);
    // The booking must move either way; only a real clash adds a second entry.
    expect(result.impacted).toBe(true);
    expect(result.conflicts.map((c) => c.kind)).toEqual(
      expectedKind ? ['window', expectedKind] : ['window'],
    );
  });

  // EVENT-FLAG-02-A: attendance above the venue capacity is a capacity conflict.
  it('EVENT-FLAG-02-A flags attendance above venue capacity but not equal to it', () => {
    const [over] = assessVenueBookings({ expectedAttendance: 201 }, [
      booking(),
    ]);
    expect(over.conflicts.map((c) => c.kind)).toEqual(['capacity']);
    const [equal] = assessVenueBookings({ expectedAttendance: 200 }, [
      booking(),
    ]);
    expect(equal.impacted).toBe(false);
  });

  // EVENT-UPDATE-05-B: lowering attendance well inside the confirmed capacity
  // (80 -> 70 with capacity 200) cannot affect the booking.
  it('EVENT-UPDATE-05-B leaves the booking unimpacted when attendance stays within capacity', () => {
    const [result] = assessVenueBookings({ expectedAttendance: 70 }, [
      booking({ capacity: 200 }),
    ]);
    expect(result).toMatchObject({ impacted: false, conflicts: [] });
  });

  // EVENT-FLAG-06-A / 07-A: each venue booking is assessed on its own and listed.
  it('EVENT-FLAG-07-A assesses each venue booking independently and lists them all', () => {
    // Hall B already holds the venue until 16:00, so the later end fits it.
    const results = assessVenueBookings({ endDateTime: iso('15:00') }, [
      booking({ neighbours: [neighbour(iso('14:00'), iso('16:00'))] }),
      booking({
        id: 'bk-2',
        venueId: 'venue-b',
        venueName: 'Hall B',
        end: iso('16:00'),
      }),
    ]);
    expect(results.map((r) => [r.bookingId, r.venueName, r.impacted])).toEqual([
      ['bk-1', 'Hall A', true],
      ['bk-2', 'Hall B', false],
    ]);
    expect(results[1].conflicts).toEqual([]);
  });
});
describe('assessVenueBookings: requirements checks and output shape', () => {
  // EVENT-FLAG-02-A: layout and facilities cannot be verified (no venue data yet), so every booking is listed for a manual check.
  it('EVENT-FLAG-02-A asks for a manual layout check on every booking', () => {
    const results = assessVenueBookings({ layout: 'Theatre' }, [
      booking(),
      booking({ id: 'bk-2', venueId: 'venue-b', venueName: 'Hall B' }),
    ]);
    expect(results.map((r) => [r.bookingId, r.impacted])).toEqual([
      ['bk-1', true],
      ['bk-2', true],
    ]);
    expect(results[0].conflicts).toEqual([
      { kind: 'requirements', detail: expect.stringContaining('Hall A') },
    ]);
    expect(results[0].conflicts[0].detail).toContain('Theatre');
    expect(results[1].conflicts[0].detail).toContain('Hall B');
  });

  // EVENT-FLAG-02-A: the facilities check names the facilities, or says none are required.
  it.each([
    [['AV System', 'Stage'], 'AV System, Stage'],
    [[], 'no specific facilities'],
  ])(
    'EVENT-FLAG-02-A asks for a manual facilities check for %j',
    (facilities, wording) => {
      const [result] = assessVenueBookings({ facilities }, [booking()]);
      expect(result.impacted).toBe(true);
      expect(result.conflicts).toEqual([
        { kind: 'requirements', detail: expect.stringContaining(wording) },
      ]);
    },
  );

  // EVENT-FLAG-02-A: a layout and a capacity change together report both reasons for the same booking.
  it('EVENT-FLAG-02-A reports every reason on a booking together', () => {
    const [result] = assessVenueBookings(
      { expectedAttendance: 250, layout: 'Banquet', facilities: ['Catering'] },
      [booking()],
    );
    expect(result.conflicts.map((c) => c.kind)).toEqual([
      'capacity',
      'requirements',
      'requirements',
    ]);
  });

  // EVENT-FLAG-06-A: each result carries the booking and venue ids so the UI can address one booking.
  it('EVENT-FLAG-06-A returns the booking and venue identity with each assessment', () => {
    const [result] = assessVenueBookings({ expectedAttendance: 10 }, [
      booking(),
    ]);
    expect(result).toMatchObject({
      bookingId: 'bk-1',
      venueId: 'venue-a',
      venueName: 'Hall A',
      impacted: false,
      conflicts: [],
    });
  });

  // EVENT-FLAG-06-A: no bookings, no assessments.
  it('EVENT-FLAG-06-A returns nothing when there are no bookings', () => {
    expect(assessVenueBookings({ expectedAttendance: 999 }, [])).toEqual([]);
  });

  // EVENT-FLAG-02-B: a missing edge keeps the booking's own value (only the start moves here).
  it('EVENT-FLAG-02-B keeps the booking end when only the start is proposed', () => {
    const [result] = assessVenueBookings({ startDateTime: iso('09:00') }, [
      booking({ neighbours: [neighbour(iso('12:30'), iso('15:00'))] }),
    ]);
    // The booking still ends at 13:00, so the 12:30 neighbour overlaps.
    expect(result.conflicts.map((c) => c.kind)).toEqual(['window', 'overlap']);
  });

  // EVENT-FLAG-02-B: several neighbours are all reported, in input order.
  it('EVENT-FLAG-02-B reports each clashing neighbour', () => {
    const [result] = assessVenueBookings({ endDateTime: iso('15:00') }, [
      booking({
        neighbours: [
          neighbour(iso('14:00'), iso('16:00'), 'nb-1'),
          neighbour(shift(iso('15:00'), T - 1), iso('18:00'), 'nb-2'),
        ],
      }),
    ]);
    expect(result.conflicts.map((c) => [c.kind, c.withBookingId])).toEqual([
      ['window', undefined],
      ['overlap', 'nb-1'],
      ['turnaround', 'nb-2'],
    ]);
  });
});

describe('assessVenueBookings: only conflicts the change can cause', () => {
  // A neighbour that ends 10 minutes before the booking starts: a tight gap that
  // already exists today, whatever is being changed.
  const tightGap = () =>
    booking({
      capacity: 100,
      neighbours: [neighbour(shift(START, -120), shift(START, -10))],
    });

  // EVENT-FLAG-02-C: a change that does not move the booking is not blamed for a gap that already existed.
  it.each([
    ['attendance', { expectedAttendance: 90 }],
    ['layout', { layout: 'Theatre' }],
    ['facilities', { facilities: ['Stage'] }],
  ])(
    'EVENT-FLAG-02-C does not report an existing tight gap for a %s change',
    (_label, proposal) => {
      const [result] = assessVenueBookings(proposal, [tightGap()]);
      expect(result.conflicts.map((c) => c.kind)).not.toContain('turnaround');
      expect(result.conflicts.map((c) => c.kind)).not.toContain('overlap');
    },
  );

  // EVENT-FLAG-02-C: an attendance change over capacity still reports only the capacity problem.
  it('EVENT-FLAG-02-C reports only the capacity conflict for an attendance change over capacity', () => {
    const [result] = assessVenueBookings({ expectedAttendance: 150 }, [
      tightGap(),
    ]);
    expect(result.conflicts.map((c) => c.kind)).toEqual(['capacity']);
  });

  // EVENT-FLAG-02-C: a layout change still asks for the manual check, and nothing else.
  it('EVENT-FLAG-02-C reports only the requirements check for a layout change', () => {
    const [result] = assessVenueBookings({ layout: 'Theatre' }, [tightGap()]);
    expect(result.conflicts.map((c) => c.kind)).toEqual(['requirements']);
  });

  // EVENT-FLAG-02-C: a time that stays inside the held window cannot create a
  // clash, so the existing tight gap is not reported for it.
  it.each([
    ['start', { startDateTime: START }],
    ['end', { endDateTime: END }],
  ])(
    'EVENT-FLAG-02-C does not report the existing gap when the %s stays inside the held window',
    (_label, proposal) => {
      const [result] = assessVenueBookings(proposal, [tightGap()]);
      expect(result).toMatchObject({ impacted: false, conflicts: [] });
    },
  );

  // EVENT-FLAG-02-C: moving the start earlier, outside the held window, makes
  // the gap tighter, so it is checked against the neighbour again.
  it('EVENT-FLAG-02-C checks the gap again when the start moves outside the held window', () => {
    const [result] = assessVenueBookings({ startDateTime: shift(START, -5) }, [
      tightGap(),
    ]);
    expect(result.conflicts.map((c) => c.kind)).toEqual([
      'window',
      'turnaround',
    ]);
  });

  // EVENT-FLAG-02-C: no proposal at all changes nothing, so nothing is impacted.
  it('EVENT-FLAG-02-C reports nothing for an empty proposal', () => {
    const [result] = assessVenueBookings({}, [tightGap()]);
    expect(result).toMatchObject({ impacted: false, conflicts: [] });
  });
});

describe('assessVenueBookings: compatible changes leave bookings unimpacted (SPM-49 AC3/AC5)', () => {
  // A neighbour 10 minutes before and 10 minutes after the held window, so any
  // move outside the window would clash.
  const boxedIn = () =>
    booking({
      neighbours: [
        neighbour(shift(START, -120), shift(START, -10), 'nb-before'),
        neighbour(shift(END, 10), shift(END, 120), 'nb-after'),
      ],
    });

  // EVENT-UPDATE-05-B: shortening the event inside the booked window keeps the
  // booking valid, even with tight neighbours on both sides.
  it.each([
    ['a later start', { startDateTime: iso('10:30') }],
    ['an earlier end', { endDateTime: iso('12:00') }],
    [
      'both edges inward',
      { startDateTime: iso('10:30'), endDateTime: iso('12:30') },
    ],
    ['the same window', { startDateTime: START, endDateTime: END }],
  ])(
    'EVENT-UPDATE-05-B leaves the booking unimpacted for %s',
    (_label, proposal) => {
      const [result] = assessVenueBookings(proposal, [boxedIn()]);
      expect(result).toMatchObject({ impacted: false, conflicts: [] });
    },
  );

  // EVENT-FLAG-02-A: leaving the held window is reported with both windows so
  // the coordinator can see what the booking must change to.
  it('EVENT-FLAG-02-A describes the held and proposed windows', () => {
    const [result] = assessVenueBookings({ endDateTime: iso('14:00') }, [
      booking(),
    ]);
    expect(result.conflicts).toEqual([
      {
        kind: 'window',
        detail:
          'Booking holds Hall A 2026-11-10 10:00–13:00 UTC; the event would run 2026-11-10 10:00–14:00 UTC, so the booking must change',
      },
    ]);
  });

  // EVENT-UPDATE-05-B: removing facilities only can never make a venue unsuitable.
  it('EVENT-UPDATE-05-B leaves bookings unimpacted when facilities are only removed', () => {
    const [result] = assessVenueBookings(
      { facilities: ['Catering'], currentFacilities: ['Catering', 'Stage'] },
      [booking()],
    );
    expect(result).toMatchObject({ impacted: false, conflicts: [] });
  });

  // EVENT-FLAG-02-A: added facilities are the only ones the coordinator must re-check.
  it('EVENT-FLAG-02-A names only the facilities being added', () => {
    const [result] = assessVenueBookings(
      {
        facilities: ['Catering', 'Projector'],
        currentFacilities: ['Catering'],
      },
      [booking()],
    );
    expect(result.conflicts).toEqual([
      { kind: 'requirements', detail: 'Check that Hall A provides: Projector' },
    ]);
  });
});

describe('withinWindow', () => {
  const at = (time: string) => Date.parse(iso(time));

  // EVENT-UPDATE-05-B: edges may touch the held window; the window must not be empty.
  it.each([
    ['identical window', '10:00', '13:00', true],
    ['strictly inside', '10:30', '12:30', true],
    ['starts early', '09:59', '13:00', false],
    ['ends late', '10:00', '13:01', false],
    ['empty window', '11:00', '11:00', false],
    ['reversed window', '12:00', '11:00', false],
  ])('EVENT-UPDATE-05-B %s', (_label, start, end, expected) => {
    expect(withinWindow(at(start), at(end), at('10:00'), at('13:00'))).toBe(
      expected,
    );
  });
});
