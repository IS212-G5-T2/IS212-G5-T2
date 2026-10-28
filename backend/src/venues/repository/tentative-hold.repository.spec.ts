import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../database/database.service.js';
import { VenuesRepository } from './venues.repository.js';

const venueId = '00000000-0000-4000-8000-000000000124';
const eventId = '00000000-0000-4000-8000-000000000159';
const coordinatorId = '00000000-0000-4000-8000-000000000126';
const now = new Date('2030-01-10T12:00:00.000Z');
const start = new Date('2030-01-25T10:00:00.000Z');
const end = new Date('2030-01-25T12:00:00.000Z');

function repositoryFor(options: {
  venue?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  active?: Record<string, unknown>;
  conflict?: Record<string, unknown>;
  saved?: Record<string, unknown>;
  approvedTransition?: boolean;
}) {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: options.venue === null ? [] : [options.venue ?? {
      id: venueId,
      setup_time_minutes: 60,
      turnaround_time_minutes: 30,
    }] })
    .mockResolvedValueOnce({ rows: options.event === null ? [] : [options.event ?? {
      id: eventId,
      status: 'Planning',
      start_date_time: start,
      end_date_time: end,
    }] })
    .mockResolvedValueOnce({ rows: options.active ? [options.active] : [] });
  if (options.conflict !== undefined)
    query.mockResolvedValueOnce({ rows: options.conflict ? [options.conflict] : [] });
  else if (!options.active)
    query.mockResolvedValueOnce({ rows: [] });
  if (!options.active && !options.conflict)
    query.mockResolvedValueOnce({ rows: [options.saved ?? {
      id: '00000000-0000-4000-8000-000000000777',
      start_at: start,
      end_at: end,
    }] });
  if (options.approvedTransition) {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    query.mockResolvedValueOnce({ rows: [] });
  }
  const repository = new VenuesRepository(
    {
      transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }),
    } as unknown as DatabaseService,
    { now: () => now },
  );
  return { repository, query };
}

describe('SPM-159 tentative hold persistence rules', () => {
  beforeEach(() => vi.clearAllMocks());

  /** VEN-HOLD-01-A: a missing venue cannot be used for a new hold request. */
  it('VEN-HOLD-01-A returns not found when the venue has been removed', async () => {
    const { repository } = repositoryFor({ venue: null });
    await expect(repository.submitTentativeHoldRequest(venueId, coordinatorId, { eventId }))
      .resolves.toEqual({ kind: 'venue-not-found' });
  });

  /** VEN-HOLD-02-B: missing timing configuration is rejected before reading or saving an event request. */
  it('VEN-HOLD-02-B fails closed when venue timing configuration is unavailable', async () => {
    const { repository, query } = repositoryFor({ venue: { id: venueId, setup_time_minutes: null, turnaround_time_minutes: 30 } });
    await expect(repository.submitTentativeHoldRequest(venueId, coordinatorId, { eventId }))
      .resolves.toEqual({ kind: 'configuration-unavailable' });
    expect(query).toHaveBeenCalledOnce();
  });

  /** VEN-HOLD-01-SEC-1: the request cannot be created for an event not assigned to the session Coordinator. */
  it('VEN-HOLD-01-SEC-1 returns not found when the event is not assigned to the Coordinator', async () => {
    const { repository } = repositoryFor({ event: null });
    await expect(repository.submitTentativeHoldRequest(venueId, coordinatorId, { eventId }))
      .resolves.toEqual({ kind: 'event-not-assigned' });
  });

  /** VEN-HOLD-01-A: an event state outside booking workflow does not create a Pending hold. */
  it('VEN-HOLD-01-A refuses an event that is not open for venue requests', async () => {
    const { repository } = repositoryFor({ event: { id: eventId, status: 'Cancelled', start_date_time: start, end_date_time: end } });
    await expect(repository.submitTentativeHoldRequest(venueId, coordinatorId, { eventId }))
      .resolves.toEqual({ kind: 'event-not-open', status: 'Cancelled' });
  });

  /** VEN-HOLD-03-BND-1/2: the setup-adjusted occupied start passes at 336 hours and fails one millisecond before it. */
  it('VEN-HOLD-03-BND-1 accepts exactly 336 hours and refuses a shorter lead', async () => {
    const exact = repositoryFor({ event: {
      id: eventId,
      status: 'Planning',
      start_date_time: new Date(now.getTime() + 336 * 60 * 60_000 + 60 * 60_000),
      end_date_time: end,
    } });
    await expect(exact.repository.submitTentativeHoldRequest(venueId, coordinatorId, { eventId }))
      .resolves.toMatchObject({ kind: 'created' });

    const short = repositoryFor({ event: {
      id: eventId,
      status: 'Planning',
      start_date_time: new Date(now.getTime() + 336 * 60 * 60_000 + 60 * 60_000 - 1),
      end_date_time: end,
    } });
    await expect(short.repository.submitTentativeHoldRequest(venueId, coordinatorId, { eventId }))
      .resolves.toEqual({ kind: 'lead-time' });
  });

  /** VEN-HOLD-09-B: a Pending ordinary booking request for the same event and venue prevents a duplicate hold. */
  it('VEN-HOLD-09-B treats an ordinary Pending booking as an existing request', async () => {
    const { repository, query } = repositoryFor({ active: { status: 'pending', request_kind: 'booking' } });
    await expect(repository.submitTentativeHoldRequest(venueId, coordinatorId, { eventId }))
      .resolves.toEqual({ kind: 'already-requested', status: 'pending' });
    const activePairQuery = String(query.mock.calls[2][0]).replace(/\s+/g, ' ').trim();
    expect(activePairQuery).toContain("AND (status = 'pending' OR (status = 'approved'");
    expect(activePairQuery).not.toContain("status = 'pending' AND");
    expect(query).toHaveBeenCalledTimes(3);
  });

  /** VEN-HOLD-07-B/C: an existing confirmed booking or active hold blocks the buffered occupied period. */
  it('VEN-HOLD-07-B returns the conflict reason without inserting a request', async () => {
    const { repository, query } = repositoryFor({ conflict: { reason: 'Annual meeting' } });
    await expect(repository.submitTentativeHoldRequest(venueId, coordinatorId, { eventId }))
      .resolves.toEqual({ kind: 'conflict', reason: 'Annual meeting' });
    expect(query).toHaveBeenCalledTimes(4);
  });

  /** VEN-HOLD-05-A/10-A: a valid request stores the venue and event times, then transitions an Approved event atomically. */
  it('VEN-HOLD-05-A stores a Pending hold and moves an Approved event to Planning', async () => {
    const { repository, query } = repositoryFor({
      event: { id: eventId, status: 'Approved', start_date_time: start, end_date_time: end },
      approvedTransition: true,
    });
    await expect(repository.submitTentativeHoldRequest(venueId, coordinatorId, { eventId }))
      .resolves.toEqual({
        kind: 'created',
        id: '00000000-0000-4000-8000-000000000777',
        start: start.toISOString(),
        end: end.toISOString(),
      });
    const insert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO venue_bookings'));
    expect(insert?.[1]).toEqual([venueId, eventId, start, end, null]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('venue_booking_requests'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'Planning'"))).toBe(true);
  });

  /** VEN-HOLD-05-SUP-NOTE: optional coordinator text is persisted with the Pending hold request. */
  it('VEN-HOLD-05-SUP-NOTE persists the optional special request with the tentative hold booking row', async () => {
    const { repository, query } = repositoryFor({
      event: { id: eventId, status: 'Planning', start_date_time: start, end_date_time: end },
    });
    await repository.submitTentativeHoldRequest(venueId, coordinatorId, {
      eventId,
      request_kind: 'tentative_hold',
      specialRequest: 'Microphones, please.',
    });
    const insert = query.mock.calls.find(([sql]) => String(sql).trimStart().startsWith('INSERT INTO venue_bookings'));
    expect(String(insert?.[0])).toContain('special_request');
    expect(insert?.[1]).toEqual([
      venueId,
      eventId,
      start,
      end,
      'Microphones, please.',
    ]);
  });
});
