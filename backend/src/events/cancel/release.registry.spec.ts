/*
 * SPM-136 AC4, AC5, AC8: the three releasers that run inside the cancellation transaction.
 * Each releaser's SQL is recorded through a fake client; the expected statuses and parameters are the
 * spec literals (venue bookings and holds, equipment reservations, registrations). Withdrawn rows and
 * other events' rows must never be touched; the instant comes from the caller (injected clock).
 */
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RELEASERS } from './release.registry.js';
import { venueBookingReleaser } from '../../venues/release/venue-booking.releaser.js';
import { equipmentReservationReleaser } from '../../equipment/release/equipment-reservation.releaser.js';
import { registrationReleaser } from '../../registrations/release/registration.releaser.js';

const EVENT = '11111111-1111-4111-8111-111111111301';
const NOW = new Date('2026-10-12T04:00:00.000Z');

function recordingClient(rows: unknown[][] = []) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: rows.shift() ?? [], rowCount: 0 };
    }),
  };
  return { client, queries };
}

describe('SPM-136 release registry', () => {
  it('registers the venue, registration and equipment releasers in that order (equipment last, for 04-C)', () => {
    expect(DEFAULT_RELEASERS.map((releaser) => releaser.name)).toEqual([
      'venue_bookings',
      'event_registrations',
      'equipment_reservations',
    ]);
  });
});

describe('CANCEL-EVENT-04-A: venue bookings and holds', () => {
  it('CANCEL-EVENT-04-A: releases approved bookings and pending holds of this event only, stamped with the instant', async () => {
    // Arrange
    const { client, queries } = recordingClient();

    // Act
    await venueBookingReleaser.release(EVENT, client as never, NOW);

    // Assert: one statement, scoped to the event, statuses pending and approved, released_at = NOW
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/UPDATE venue_bookings/);
    expect(queries[0].sql).toMatch(/status = 'released'/);
    expect(queries[0].sql).toMatch(/event_id = \$1/);
    expect(queries[0].sql).toMatch(/status IN \('pending', 'approved'\)/);
    expect(queries[0].params).toEqual([EVENT, NOW]);
  });
});

describe('CANCEL-EVENT-05-A: equipment reservations', () => {
  it('CANCEL-EVENT-05-A: releases Requested, Reserved and Unavailable lines of this event, stamped with the instant', async () => {
    const { client, queries } = recordingClient();

    await equipmentReservationReleaser.release(EVENT, client as never, NOW);

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/UPDATE equipment_reservations/);
    expect(queries[0].sql).toMatch(/status = 'Released'/);
    expect(queries[0].sql).toMatch(/event_id = \$1/);
    expect(queries[0].sql).toMatch(/status IN \('Requested', 'Reserved', 'Unavailable'\)/);
    expect(queries[0].params).toEqual([EVENT, NOW]);
  });
});

describe('CANCEL-EVENT-08-A: registrations', () => {
  it('CANCEL-EVENT-08-A: collects the Registered attendees as recipients before any row changes', async () => {
    const attendees = ['22222222-2222-4222-8222-222222222201', '22222222-2222-4222-8222-222222222202'];
    const { client, queries } = recordingClient([attendees.map((attendee_id) => ({ attendee_id }))]);

    const recipients = await registrationReleaser.collectRecipients?.(EVENT, client as never);

    expect(recipients).toEqual(attendees);
    expect(queries[0].sql).toMatch(/status = 'Registered'/);
    expect(queries[0].params).toEqual([EVENT]);
  });

  it('CANCEL-EVENT-08-A: sets Registered rows to Cancelled with the reason and leaves Withdrawn rows alone', async () => {
    const { client, queries } = recordingClient();

    await registrationReleaser.release(EVENT, client as never, NOW);

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/UPDATE event_registrations/);
    expect(queries[0].sql).toMatch(/status = 'Cancelled'/);
    expect(queries[0].sql).toMatch(/cancellation_reason = 'Event cancelled'/);
    expect(queries[0].sql).toMatch(/status = 'Registered'/);
    expect(queries[0].sql).not.toMatch(/Withdrawn/);
    expect(queries[0].params).toEqual([EVENT, NOW]);
  });
});
