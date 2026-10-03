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

function booking(overrides: Partial<VenueBookingInput> = {}): VenueBookingInput {
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
    expect(result.conflicts[0]).toMatchObject({ kind: 'overlap', withBookingId: 'nb-1' });
  });

  // EVENT-FLAG-02-B: a gap shorter than setup/turnaround time is also a conflict.
  it('EVENT-FLAG-02-B reports a turnaround conflict when the gap is too short', () => {
    const [result] = assessVenueBookings({ startDateTime: START }, [
      booking({
        neighbours: [neighbour(shift(START, -120), shift(START, -(T - 1)))],
      }),
    ]);
    expect(result.conflicts[0]).toMatchObject({ kind: 'turnaround', withBookingId: 'nb-1' });
  });

  // EVENT-FLAG-02-BND-1: just below, at and just above the turnaround buffer.
  it.each([
    ['gap equals the turnaround buffer before', neighbour(shift(START, -180), shift(START, -T)), undefined],
    ['gap one minute short before', neighbour(shift(START, -180), shift(START, -(T - 1))), 'turnaround'],
    ['bookings touch before', neighbour(shift(START, -180), START), 'turnaround'],
    ['overlap by one minute at the start', neighbour(shift(START, -180), shift(START, 1)), 'overlap'],
    ['gap equals the turnaround buffer after', neighbour(shift(END, T), shift(END, T + 180)), undefined],
    ['gap one minute short after', neighbour(shift(END, T - 1), shift(END, T + 180)), 'turnaround'],
    ['overlap by one minute at the end', neighbour(shift(END, -1), shift(END, 180)), 'overlap'],
  ])('EVENT-FLAG-02-BND-1 %s', (_label, other, expectedKind) => {
    const [result] = assessVenueBookings({}, [booking({ neighbours: [other] })]);
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
    const [over] = assessVenueBookings({ expectedAttendance: 201 }, [booking()]);
    expect(over.conflicts.map((c) => c.kind)).toEqual(['capacity']);
    const [equal] = assessVenueBookings({ expectedAttendance: 200 }, [booking()]);
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