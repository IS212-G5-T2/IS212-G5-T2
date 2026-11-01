import { describe, expect, it, vi } from 'vitest';
import {
  coordinatorMessage,
  notifyVenueImpact,
  type ImpactedBooking,
} from './venue-impact-notifications.js';

/*
 * SPM-125 AC6 to AC9: unit tests of the venue-impact notifier in isolation. The database client is a fixture that
 * records every statement; no user is signed in.
 */

// 8 Oct 2026, 11:00 am to 1:00 pm Singapore time.
const periodStart = new Date('2026-10-08T03:00:00.000Z');
const periodEnd = new Date('2026-10-08T05:00:00.000Z');
const unavailable = {
  kind: 'unavailable' as const,
  start: periodStart,
  end: periodEnd,
  reason: 'Maintenance',
};

function booking(overrides: Partial<ImpactedBooking> = {}): ImpactedBooking {
  return {
    bookingId: 'booking-1',
    eventId: 'event-1',
    eventName: 'Welcome Evening',
    coordinatorId: 'coordinator-1',
    // 8 Oct 2026, 11:30 am to 12:30 pm Singapore time.
    start: new Date('2026-10-08T03:30:00.000Z'),
    end: new Date('2026-10-08T04:30:00.000Z'),
    ...overrides,
  };
}

/** The INSERT statements the notifier sent, with their parameters. */
function inserts(query: ReturnType<typeof vi.fn>) {
  return query.mock.calls.map(([sql, params]) => ({
    sql: String(sql),
    params: params as unknown[],
  }));
}

describe('SPM-125 venue impact notifications', () => {
  /**
   * VEN-IMPACT-07-A (AC7): the Coordinator's unavailability notice names the event, the venue, the unavailable
   * period in Singapore time and its reason, and says alternative arrangements are required.
   */
  it('VEN-IMPACT-07-A builds the unavailability message with the event, venue, period and reason', () => {
    expect(coordinatorMessage('Orchid Hall', booking(), unavailable)).toBe(
      'Orchid Hall is unavailable from 8 Oct 2026, 11:00 am – 1:00 pm (reason: Maintenance). ' +
        'Alternative arrangements are required for your booking for "Welcome Evening" (8 Oct 2026, 11:30 am – 12:30 pm).',
    );
  });

  /** VEN-IMPACT-08-A (AC8): the timing notice names the venue and the booking and says it now conflicts. */
  it('VEN-IMPACT-08-A builds the setup or turnaround message with the venue and the conflicting booking', () => {
    expect(
      coordinatorMessage('Orchid Hall', booking(), { kind: 'timing' }),
    ).toBe(
      'The setup or turnaround time of Orchid Hall changed, so your booking for "Welcome Evening" ' +
        '(8 Oct 2026, 11:30 am – 12:30 pm) now conflicts with another booking or unavailable period. ' +
        'Review the booking and arrange an alternative if needed.',
    );
  });

  /** VEN-IMPACT-09-A (AC9): the capacity notice gives the old and new capacity and the booking. */
  it('VEN-IMPACT-09-A builds the capacity message with the old and new capacity and the booking', () => {
    expect(
      coordinatorMessage('Orchid Hall', booking(), {
        kind: 'capacity',
        previousCapacity: 120,
        capacity: 80,
      }),
    ).toBe(
      'The capacity of Orchid Hall changed from 120 to 80. Check that your booking for "Welcome Evening" ' +
        '(8 Oct 2026, 11:30 am – 12:30 pm) still suits your expected attendance.',
    );
  });

  /**
   * VEN-IMPACT-06-A (AC6): one notice per affected booking goes to that event's assigned Coordinator, linked to the
   * event and the booking; a booking listed twice is notified once; nothing else is written, so the Venue Staff
   * member who made the change gets no notice (SC-SPM125-01).
   */
  it('VEN-IMPACT-06-A notifies each booking Coordinator once and nobody else', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const second = booking({
      bookingId: 'booking-2',
      eventId: 'event-2',
      eventName: 'Spring Gala',
      coordinatorId: 'coordinator-2',
    });

    const notified = await notifyVenueImpact(
      { query },
      {
        venueName: 'Orchid Hall',
        change: unavailable,
        bookings: [booking(), second, booking()],
      },
    );

    expect([...notified]).toEqual(['booking-1', 'booking-2']);
    const sent = inserts(query);
    expect(sent).toHaveLength(2);
    expect(sent[0].sql).toContain('related_booking_id');
    expect(sent[0].params.slice(1)).toEqual([
      'coordinator-1',
      'venue_unavailable_impact',
      coordinatorMessage('Orchid Hall', booking(), unavailable),
      'event-1',
      'booking-1',
    ]);
    expect(sent[1].params.slice(1, 3)).toEqual([
      'coordinator-2',
      'venue_unavailable_impact',
    ]);
    expect(sent[1].params.slice(4)).toEqual(['event-2', 'booking-2']);
    // Every notice has its own id.
    expect(new Set(sent.map((s) => s.params[0])).size).toBe(2);
  });

  /** VEN-IMPACT-06-BND-1 (AC6): a booking whose event has no assigned Coordinator is not notified. */
  it('VEN-IMPACT-06-BND-1 skips a booking with no assigned Coordinator', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const notified = await notifyVenueImpact(
      { query },
      {
        venueName: 'Orchid Hall',
        change: unavailable,
        bookings: [booking({ coordinatorId: null })],
      },
    );

    expect(notified.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  /** VEN-IMPACT-08-A, VEN-IMPACT-09-A (AC8, AC9): each venue change has its own Coordinator notice type. */
  it.each([
    ['venue_timing_impact', { kind: 'timing' as const }],
    [
      'venue_capacity_impact',
      { kind: 'capacity' as const, previousCapacity: 120, capacity: 80 },
    ],
  ])(
    'VEN-IMPACT-08-A VEN-IMPACT-09-A writes one %s notice and nothing else',
    async (type, change) => {
      const query = vi.fn().mockResolvedValue({ rows: [] });

      await notifyVenueImpact(
        { query },
        { venueName: 'Orchid Hall', change, bookings: [booking()] },
      );

      const sent = inserts(query);
      expect(sent).toHaveLength(1);
      expect(sent[0].params[2]).toBe(type);
      expect(sent[0].params[3]).toBe(
        coordinatorMessage('Orchid Hall', booking(), change),
      );
    },
  );
});
