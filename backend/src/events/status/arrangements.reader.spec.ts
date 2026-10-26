import { describe, expect, it, vi } from 'vitest';
import {
  ArrangementsReader,
  NoSafetyRecordSource,
  type Queryable,
} from './arrangements.reader.js';

describe('ArrangementsReader', () => {
  // Kills: SPM54-BE-ARRANGEMENTS-CANCELLED-HISTORY (cancelled venue bookings dropped from the arrangements read model).
  /** VEN-BKG-09-A: event status reads preserve cancelled booking history and request timing. */
  it('maps venue, equipment, and confirmation rows while using shared locks when requested', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'booking-1',
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
