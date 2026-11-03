/*
 * SPM-153 AC6 (COMPLETE-EVENT-06-C): a venue booking of a Completed event cannot be approved, rejected or cancelled.
 * The repository reports event-completed under the booking lock; the service answers 409 EVENT_COMPLETED (MSG-CP-06).
 */
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/types/auth.models.js';
import { DatabaseService } from '../database/database.service.js';
import { VenuesRepository } from './repository/venues.repository.js';
import { VenuesService } from './venues.service.js';

const STAFF_ID = 'staff-1';
const BOOKING = '00000000-0000-4000-8000-000000000301';
const VENUE = '00000000-0000-4000-8000-000000000302';
const EVENT = '00000000-0000-4000-8000-000000000303';
const STAFF: AuthenticatedUser = { uid: STAFF_ID, roles: ['VENUE_STAFF'] };
const COORDINATOR: AuthenticatedUser = { uid: 'coord-1', roles: ['COORDINATOR'] };

/** The owned booking under lock, on a Completed event. */
function completedRepository() {
  const answer = (sql: string) => {
    if (sql.includes('SELECT b.venue_id FROM venue_bookings b')) return { rows: [{ venue_id: VENUE }], rowCount: 1 };
    if (sql.includes('SELECT setup_time_minutes, turnaround_time_minutes FROM venues')) return { rows: [{ setup_time_minutes: 0, turnaround_time_minutes: 0 }], rowCount: 1 };
    if (sql.includes('SELECT b.id, b.event_id, b.venue_id, b.status, b.start_at')) {
      return {
        rows: [{ id: BOOKING, event_id: EVENT, venue_id: VENUE, status: 'pending', start_at: new Date('2030-01-12T04:00:00.000Z'), end_at: new Date('2030-01-12T05:00:00.000Z'), event_status: 'Completed' }],
        rowCount: 1,
      };
    }
    if (sql.includes('SELECT b.id, b.event_id, b.status, e.status AS event_status')) {
      return { rows: [{ id: BOOKING, event_id: EVENT, status: 'approved', event_status: 'Completed' }], rowCount: 1 };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  };
  const client = { query: vi.fn(async (sql: string) => answer(sql)) };
  const database = { transaction: vi.fn(async (work: (c: unknown) => unknown) => work(client)), query: vi.fn(async (sql: string) => answer(sql)) };
  return new VenuesRepository(database as unknown as DatabaseService, { now: () => new Date('2026-10-12T04:00:00Z') });
}

describe('COMPLETE-EVENT-06-C: the venue repository refuses a booking of a Completed event', () => {
  it('COMPLETE-EVENT-06-C: approve reports event-completed and does not decide the booking', async () => {
    await expect(completedRepository().approveVenueBooking(STAFF_ID, BOOKING)).resolves.toEqual({ kind: 'event-completed' });
  });

  it('COMPLETE-EVENT-06-C: reject reports event-completed and does not decide the booking', async () => {
    await expect(completedRepository().rejectVenueBooking(STAFF_ID, BOOKING, 'Venue clash')).resolves.toEqual({ kind: 'event-completed' });
  });

  it('COMPLETE-EVENT-06-C: the coordinator cancel reports event-completed', async () => {
    await expect(completedRepository().cancelCoordinatorBooking(COORDINATOR.uid, BOOKING, true)).resolves.toEqual({ kind: 'event-completed' });
  });
});

describe('COMPLETE-EVENT-06-C: the venue service answers 409 EVENT_COMPLETED', () => {
  const rbac = { hasPermission: vi.fn(async () => true) };

  it('COMPLETE-EVENT-06-C: approve is refused with 409 EVENT_COMPLETED', async () => {
    const repository = { approveVenueBooking: vi.fn(async () => ({ kind: 'event-completed' })) };
    const service = new VenuesService(repository as never, rbac as never);

    const error = await service.approveVenueBooking(STAFF, BOOKING).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'EVENT_COMPLETED',
      message: 'The date, time, venue and equipment of a Completed event cannot be changed.',
    });
  });

  it('COMPLETE-EVENT-06-C: reject is refused with 409 EVENT_COMPLETED', async () => {
    const repository = { rejectVenueBooking: vi.fn(async () => ({ kind: 'event-completed' })) };
    const service = new VenuesService(repository as never, rbac as never);

    await expect(service.rejectVenueBooking(STAFF, BOOKING, { reason: 'Venue clash' })).rejects.toMatchObject({ response: { code: 'EVENT_COMPLETED' } });
  });

  it('COMPLETE-EVENT-06-C: the coordinator cancel is refused with 409 EVENT_COMPLETED', async () => {
    const repository = { cancelCoordinatorBooking: vi.fn(async () => ({ kind: 'event-completed' })) };
    const service = new VenuesService(repository as never, rbac as never);

    await expect(service.cancelCoordinatorBooking(COORDINATOR, BOOKING, true)).rejects.toMatchObject({ response: { code: 'EVENT_COMPLETED' } });
  });
});
