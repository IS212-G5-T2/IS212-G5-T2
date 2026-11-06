import { describe, expect, it, vi } from 'vitest';
import {
  ArrangementsReader,
  NoSafetyRecordSource,
  type Queryable,
} from './arrangements.reader.js';

describe('ArrangementsReader', () => {
  /** SAFETY-QUEUE-06-SUP-HISTORY: the replacement rule receives the exact venue identity and interval from each distinct SQL row. */
  it('SAFETY-QUEUE-06-SUP-HISTORY preserves distinct venue identities and slot boundaries from PostgreSQL rows', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [
        {
          id: 'rejected-booking', venue_id: 'venue-main', venue_name: 'Main Hall', status: 'rejected',
          request_kind: 'booking', hold_expires_at: null, venue_unavailable: false,
          start_at: new Date('2031-06-10T02:00:00.000Z'), end_at: new Date('2031-06-10T04:00:00.000Z'),
          created_at: new Date('2031-06-01T00:00:00.000Z'),
        },
        {
          id: 'approved-booking', venue_id: 'venue-annex', venue_name: 'Annex', status: 'approved',
          request_kind: 'booking', hold_expires_at: null, venue_unavailable: false,
          start_at: new Date('2031-06-10T03:00:00.000Z'), end_at: new Date('2031-06-10T05:00:00.000Z'),
          created_at: new Date('2031-06-02T00:00:00.000Z'),
        },
      ] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const reader = new ArrangementsReader(new NoSafetyRecordSource());

    const result = await reader.read({ query } as unknown as Queryable, 'event-replacement', { lock: false });

    expect(query.mock.calls[0][0]).toContain('b.venue_id');
    expect(query.mock.calls[0][1]).toEqual(['event-replacement']);
    expect(result.venueBookings).toEqual([
      {
        id: 'rejected-booking', venueId: 'venue-main', venueName: 'Main Hall', status: 'rejected',
        requestKind: 'booking', holdExpiresAt: null, venueUnavailable: false,
        start: '2031-06-10T02:00:00.000Z', end: '2031-06-10T04:00:00.000Z', requestedAt: '2031-06-01T00:00:00.000Z',
      },
      {
        id: 'approved-booking', venueId: 'venue-annex', venueName: 'Annex', status: 'approved',
        requestKind: 'booking', holdExpiresAt: null, venueUnavailable: false,
        start: '2031-06-10T03:00:00.000Z', end: '2031-06-10T05:00:00.000Z', requestedAt: '2031-06-02T00:00:00.000Z',
      },
    ]);
  });

  // Kills: SPM54-BE-ARRANGEMENTS-CANCELLED-HISTORY (cancelled venue bookings dropped from the arrangements read model).
  /** VEN-BKG-09-A: event status reads preserve cancelled booking history and request timing. */
  it('maps venue, equipment, and confirmation rows while using shared locks when requested', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'booking-1',
            venue_id: 'venue-1',
            venue_name: 'Main Hall',
            status: 'cancelled',
            hold_expires_at: null,
            start_at: new Date('2030-01-12T04:00:00.000Z'),
            end_at: new Date('2030-01-12T05:00:00.000Z'),
            created_at: new Date('2030-01-01T00:00:00.000Z'),
            venue_unavailable: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'equipment-1',
            equipment_name: 'Projector',
            quantity: 1,
            status: 'Reserved',
            created_at: new Date('2030-01-01T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ equipment_confirmed_at: new Date('2030-01-01T00:00:00.000Z') }],
      });
    const reader = new ArrangementsReader({ read: vi.fn() });

    const result = await reader.read({ query } as unknown as Queryable, 'event-1', { lock: true });

    expect(result).toMatchObject({
      equipmentNoneConfirmed: true,
      venueBookings: [{ id: 'booking-1', status: 'cancelled', venueName: 'Main Hall' }],
      equipment: [{ id: 'equipment-1', name: 'Projector', quantity: 1 }],
    });
    expect(query.mock.calls[0][0]).toContain('FOR SHARE OF b');
    expect(query.mock.calls[1][0]).toContain('FOR SHARE');
    expect(query).toHaveBeenCalledTimes(3);
  });

  /** Lock-free reads and a missing event confirmation row are handled without a phantom confirmation. */
  it('reads empty arrangements without locks and reports no confirmation', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const reader = new ArrangementsReader(new NoSafetyRecordSource());
    const result = await reader.read({ query } as unknown as Queryable, 'event-2', { lock: false });

    expect(result).toEqual({ venueBookings: [], equipment: [], equipmentNoneConfirmed: false });
    expect(query.mock.calls[0][0]).not.toContain('FOR SHARE');
    expect(query.mock.calls[1][0]).not.toContain('FOR SHARE');
    await expect(new NoSafetyRecordSource().read('event-2')).resolves.toBeUndefined();
  });
});

describe('ArrangementsReader: VEN-HOLD-04-SUP-EVENTS approved holds', () => {
  /** SPM-159: the reader selects request_kind and hold_expires_at and surfaces them, so readiness can tell a hold from a booking. */
  it('VEN-HOLD-04-SUP-EVENTS selects and surfaces the request kind and hold expiry of each booking', async () => {
    const row = (id: string, kind: string, expires: Date | null) => ({
      id,
      venue_id: 'venue-1',
      venue_name: 'Main Hall',
      status: 'approved',
      hold_expires_at: expires,
      request_kind: kind,
      start_at: new Date('2030-01-12T04:00:00.000Z'),
      end_at: new Date('2030-01-12T05:00:00.000Z'),
      created_at: new Date('2030-01-01T00:00:00.000Z'),
      venue_unavailable: false,
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row('hold', 'tentative_hold', new Date('2030-01-20T00:00:00.000Z')), row('plain', 'booking', null)] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const reader = new ArrangementsReader(new NoSafetyRecordSource());

    const result = await reader.read({ query } as unknown as Queryable, 'event-3', { lock: false });

    expect(query.mock.calls[0][0]).toContain('b.request_kind');
    expect(result.venueBookings).toEqual([
      expect.objectContaining({ id: 'hold', requestKind: 'tentative_hold', holdExpiresAt: new Date('2030-01-20T00:00:00.000Z') }),
      expect.objectContaining({ id: 'plain', requestKind: 'booking', holdExpiresAt: null }),
    ]);
  });
});
