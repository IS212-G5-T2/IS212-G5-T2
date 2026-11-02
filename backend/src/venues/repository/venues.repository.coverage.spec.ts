import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../database/database.service.js';
import { VenuesRepository } from './venues.repository.js';

const venueId = '00000000-0000-4000-8000-000000000002';
const eventId = '00000000-0000-4000-8000-000000000003';
const input = { eventId };
const clock = { now: () => new Date('2030-01-01T00:00:00.000Z') };

function repository(rows: unknown[]) {
  const query = vi.fn();
  for (const row of rows) query.mockResolvedValueOnce({ rows: row ? [row] : [] });
  const database = { transaction: (work: (client: { query: typeof query }) => unknown) => work({ query }) };
  return { repository: new VenuesRepository(database as unknown as DatabaseService, clock), query };
}

describe('tentative hold repository early outcomes', () => {
  it('returns venue-not-found without looking up an event', async () => {
    const { repository: repo, query } = repository([undefined]);
    await expect(repo.submitTentativeHoldRequest(venueId, 'coordinator', input)).resolves.toEqual({ kind: 'venue-not-found' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns configuration-unavailable when setup or turnaround is missing', async () => {
    const { repository: repo } = repository([{ id: venueId, setup_time_minutes: 30, turnaround_time_minutes: null }]);
    await expect(repo.submitTentativeHoldRequest(venueId, 'coordinator', input)).resolves.toEqual({ kind: 'configuration-unavailable' });
  });

  it('returns event-not-assigned when the event is outside the coordinator assignment', async () => {
    const { repository: repo } = repository([
      { id: venueId, setup_time_minutes: 30, turnaround_time_minutes: 45 }, undefined,
    ]);
    await expect(repo.submitTentativeHoldRequest(venueId, 'coordinator', input)).resolves.toEqual({ kind: 'event-not-assigned' });
  });

  it('returns the closed event status without creating a hold', async () => {
    const { repository: repo, query } = repository([
      { id: venueId, setup_time_minutes: 30, turnaround_time_minutes: 45 },
      { id: eventId, status: 'Completed', start_date_time: new Date('2030-02-01T10:00:00Z'), end_date_time: new Date('2030-02-01T11:00:00Z') },
    ]);
    await expect(repo.submitTentativeHoldRequest(venueId, 'coordinator', input)).resolves.toEqual({ kind: 'event-not-open', status: 'Completed' });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
