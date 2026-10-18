import { describe, expect, it, vi } from 'vitest';
import { ArrangementsReader } from './arrangements.reader.js';

const date = new Date('2030-01-01T00:00:00.000Z');

describe('ArrangementsReader', () => {
  /** SPM-135 AC1: cancelled venue requests are excluded while pending and approved arrangements remain readable. */
  it('filters cancelled venue booking rows from the planning snapshot', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [
        { id: 'pending', venue_name: 'Hall A', status: 'pending', hold_expires_at: null, start_at: date, end_at: date, created_at: date, venue_unavailable: false },
        { id: 'approved', venue_name: 'Hall B', status: 'approved', hold_expires_at: null, start_at: date, end_at: date, created_at: date, venue_unavailable: false },
      ] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ equipment_confirmed_at: null }] });
    const reader = new ArrangementsReader({ read: vi.fn().mockResolvedValue(undefined) });

    const snapshot = await reader.read({ query } as never, 'event-1', { lock: false });

    expect(snapshot.venueBookings.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'pending', status: 'pending' },
      { id: 'approved', status: 'approved' },
    ]);
    expect(String(query.mock.calls[0][0])).toContain("b.status <> 'cancelled'");
  });
});
