import { describe, expect, it } from 'vitest';
import {
  TURNAROUND_MINUTES,
  assessVenueBookings,
  type VenueBookingInput,
} from './event-impact.js';

/**
 * SPM-85 AC2, AC6, AC7 — impact assessment of a proposed change against each
 * venue booking of an event, including setup/turnaround clashes. Confluence IDs:
 * EVENT-FLAG-02-A/B, EVENT-FLAG-02-BND-1, EVENT-FLAG-06-A, EVENT-FLAG-07-A.
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
    expect(result.conflicts[0]).toMatchObject({
      kind: 'overlap',
      withBookingId: 'nb-1',
    });
  });

  // EVENT-FLAG-02-B: a gap shorter than setup/turnaround time is also a conflict.
  it('EVENT-FLAG-02-B reports a turnaround conflict when the gap is too short', () => {
    const [result] = assessVenueBookings({ startDateTime: START }, [
      booking({
        neighbours: [neighbour(shift(START, -120), shift(START, -(T - 1)))],
      }),
    ]);
    expect(result.conflicts[0]).toMatchObject({
      kind: 'turnaround',
      withBookingId: 'nb-1',
    });
  });

  // EVENT-FLAG-02-BND-1: just below, at and just above the turnaround buffer.
  it.each([
    [
      'gap equals the turnaround buffer before',
      neighbour(shift(START, -180), shift(START, -T)),
      undefined,
    ],
    [
      'gap one minute short before',
      neighbour(shift(START, -180), shift(START, -(T - 1))),
      'turnaround',
    ],
    [
      'bookings touch before',
      neighbour(shift(START, -180), START),
      'turnaround',
    ],
    [
      'overlap by one minute at the start',
      neighbour(shift(START, -180), shift(START, 1)),
      'overlap',
    ],
    [
      'gap equals the turnaround buffer after',
      neighbour(shift(END, T), shift(END, T + 180)),
      undefined,
    ],
    [
      'gap one minute short after',
      neighbour(shift(END, T - 1), shift(END, T + 180)),
      'turnaround',
    ],
    [
      'overlap by one minute at the end',
      neighbour(shift(END, -1), shift(END, 180)),
      'overlap',
    ],
  ])('EVENT-FLAG-02-BND-1 %s', (_label, other, expectedKind) => {
    const [result] = assessVenueBookings({ startDateTime: START }, [
      booking({ neighbours: [other] }),
    ]);
    if (expectedKind) {
      expect(result.conflicts.map((c) => c.kind)).toEqual([expectedKind]);
      expect(result.impacted).toBe(true);
    } else {
      expect(result.conflicts).toEqual([]);
      expect(result.impacted).toBe(false);
    }
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

  // EVENT-FLAG-06-A / 07-A: each venue booking is assessed on its own and listed.
  it('EVENT-FLAG-07-A assesses each venue booking independently and lists them all', () => {
    const results = assessVenueBookings({ endDateTime: iso('15:00') }, [
      booking({ neighbours: [neighbour(iso('14:00'), iso('16:00'))] }),
      booking({ id: 'bk-2', venueId: 'venue-b', venueName: 'Hall B' }),
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
    expect(result.conflicts.map((c) => c.kind)).toEqual(['overlap']);
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

  // EVENT-FLAG-02-C: moving only the start or only the end still checks the gap against neighbours.
  it.each([
    ['start', { startDateTime: START }],
    ['end', { endDateTime: END }],
  ])(
    'EVENT-FLAG-02-C still checks the gap when only the %s is proposed',
    (_label, proposal) => {
      const [result] = assessVenueBookings(proposal, [tightGap()]);
      expect(result.conflicts.map((c) => c.kind)).toEqual(['turnaround']);
    },
  );

  // EVENT-FLAG-02-C: no proposal at all changes nothing, so nothing is impacted.
  it('EVENT-FLAG-02-C reports nothing for an empty proposal', () => {
    const [result] = assessVenueBookings({}, [tightGap()]);
    expect(result).toMatchObject({ impacted: false, conflicts: [] });
  });
});
