import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../../database/database.service.js';
import { TURNAROUND_MINUTES } from './helpers/event-impact.js';
import {
  EventPlanningRepository,
  type ChangeResolution,
  type NewFlaggedChange,
} from './event-planning.repository.js';

/**
 * SPM-97 / SPM-49 / SPM-85: the TypeScript around the planning repository's
 * SQL — which connection a query uses, when rows are locked, which columns an
 * update may write, how database errors are reported and how rows are mapped
 * to the service's shapes. The database is a stub, so these tests do not prove
 * the SQL itself; that is proved against PostgreSQL in
 * test/event-planning.e2e-spec.ts.
 * Confluence IDs: EVENT-VIEW-02-F/G, EVENT-UPDATE-04-SEC-2, EVENT-FLAG-01-G,
 * EVENT-FLAG-04-C, EVENT-FLAG-04-SEC-4/5, EVENT-FLAG-05-D, EVENT-FLAG-07-B.
 */

const EVENT_ID = '00000000-0000-4000-8000-000000000049';
const CHANGE_ID = '00000000-0000-4000-8000-000000000085';

type Query = ReturnType<typeof vi.fn>;

// A stub DatabaseService: `query` is the pool, `transaction` hands `work` a
// separate client so tests can tell which connection each query used.
function makeDatabase(rows: unknown[] = []) {
  const poolQuery: Query = vi.fn().mockResolvedValue({ rows });
  const clientQuery: Query = vi.fn().mockResolvedValue({ rows });
  const transaction = vi.fn(
    async <T>(work: (client: { query: Query }) => Promise<T>) =>
      work({ query: clientQuery }),
  );
  const database = {
    query: poolQuery,
    transaction,
  } as unknown as DatabaseService;
  return {
    repository: new EventPlanningRepository(database),
    poolQuery,
    clientQuery,
    transaction,
  };
}

// An `events` row as PostgreSQL returns it (timestamps as Date objects).
function eventDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    organiser_id: 'organiser-1',
    organiser_name: 'Demo Organiser',
    coordinator_id: 'coord-9',
    coordinator_name: 'Coord Nine',
    status: 'Planning',
    event_name: 'Welcome Evening',
    purpose: 'Community building',
    description: 'A welcome event for new members.',
    start_date_time: new Date('2026-11-10T10:00:00.000Z'),
    end_date_time: new Date('2026-11-10T13:00:00.000Z'),
    expected_attendance: 80,
    preferred_room_layout: 'Banquet',
    required_facilities: ['Catering'],
    accessibility_needs: ['Wheelchair ramps'],
    equipment_needs: 'Two microphones',
    registration_enabled: true,
    created_at: new Date('2026-10-01T09:00:00.000Z'),
    updated_at: new Date('2026-10-04T09:00:00.000Z'),
    ...overrides,
  };
}

// An `event_flagged_changes` row as PostgreSQL returns it.
function changeDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANGE_ID,
    event_id: EVENT_ID,
    kind: 'booking_conflict',
    field: 'expectedAttendance',
    original_value: 80,
    proposed_value: 150,
    status: 'Needs Review',
    impacts: [{ bookingId: 'bk-1', impacted: true, conflicts: [] }],
    equipment_impacts: [],
    proposed_by: 'Coord Nine',
    created_at: new Date('2026-10-05T08:00:00.000Z'),
    resolved_by: null,
    resolved_at: null,
    ...overrides,
  };
}

const NEW_CHANGE: NewFlaggedChange = {
  kind: 'booking_conflict',
  field: 'expectedAttendance',
  originalValue: 80,
  proposedValue: 150,
  impacts: [],
  equipmentImpacts: [],
  proposedBy: 'Coord Nine',
  proposedById: 'coord-9',
};

describe('EventPlanningRepository transactions and locking', () => {
  /**
   * EVENT-FLAG-04-SEC-4: every query made inside runInTransaction uses the
   * transaction's connection, a nested runInTransaction reuses it instead of
   * opening a second one, and queries outside it use the pool.
   */
  it('EVENT-FLAG-04-SEC-4 runs nested work on one transaction connection', async () => {
    const { repository, poolQuery, clientQuery, transaction } = makeDatabase([
      eventDbRow(),
    ]);

    const result = await repository.runInTransaction(async () => {
      await repository.findEvent(EVENT_ID);
      return repository.runInTransaction(async () => {
        await repository.listPendingChanges(EVENT_ID);
        return 'done';
      });
    });

    expect(result).toBe('done');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(poolQuery).not.toHaveBeenCalled();

    // Outside the transaction the pool is used again.
    await repository.listPendingChanges(EVENT_ID);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  /**
   * EVENT-FLAG-04-SEC-4: the event row and the flagged-change row are locked
   * (FOR UPDATE) only when read inside a transaction, which is what serialises
   * concurrent updates and decisions; plain reads take no lock.
   */
  it('EVENT-FLAG-04-SEC-4 locks the event and change rows only inside a transaction', async () => {
    const { repository, poolQuery, clientQuery } = makeDatabase([]);

    await repository.findEvent(EVENT_ID);
    await repository.findChange(EVENT_ID, CHANGE_ID);
    for (const [sql] of poolQuery.mock.calls)
      expect(sql).not.toContain('FOR UPDATE');

    await repository.runInTransaction(async () => {
      await repository.findEvent(EVENT_ID);
      await repository.findChange(EVENT_ID, CHANGE_ID);
    });
    expect(clientQuery).toHaveBeenCalledTimes(2);
    for (const [sql] of clientQuery.mock.calls)
      expect(sql).toContain('FOR UPDATE');
  });

  /**
   * EVENT-FLAG-04-SEC-5: a change id that is not a UUID is reported as not
   * found without querying, so a malformed id never causes a database error.
   */
  it('EVENT-FLAG-04-SEC-5 treats a malformed change id as not found without querying', async () => {
    const { repository, poolQuery } = makeDatabase([changeDbRow()]);
    await expect(
      repository.findChange(EVENT_ID, 'not-a-uuid'),
    ).resolves.toBeUndefined();
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

describe('EventPlanningRepository writes', () => {
  /**
   * EVENT-UPDATE-04-SEC-2: an update writes only the whitelisted event columns
   * for the fields it is given, ignores any other key, binds every value as a
   * parameter and always stamps updated_at.
   */
  it('EVENT-UPDATE-04-SEC-2 writes only whitelisted columns as parameters', async () => {
    const { repository, poolQuery } = makeDatabase([
      eventDbRow({ event_name: 'Renamed' }),
    ]);
    const now = new Date('2026-10-05T08:00:00.000Z');

    const row = await repository.applyFields(
      EVENT_ID,
      {
        name: 'Renamed',
        expectedAttendance: 120,
        status: 'Confirmed',
      } as unknown as Parameters<typeof repository.applyFields>[1],
      now,
    );

    const [sql, params] = poolQuery.mock.calls[0];
    expect(params).toEqual([EVENT_ID, 'Renamed', 120, now]);
    expect(sql).toContain('event_name = $2');
    expect(sql).toContain('expected_attendance = $3');
    expect(sql).toContain('updated_at = $4');
    expect(sql).not.toContain('status');
    expect(sql).not.toContain('Confirmed');
    expect(row.name).toBe('Renamed');
  });

  /**
   * EVENT-FLAG-01-G: when another request has already flagged the same field
   * (unique-violation 23505), the coordinator gets a clear conflict naming the
   * field; any other database error is passed on unchanged.
   */
  it('EVENT-FLAG-01-G reports a concurrent pending change as a conflict and passes other errors on', async () => {
    const { repository, poolQuery } = makeDatabase();

    poolQuery.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );
    await expect(
      repository.createFlaggedChange(EVENT_ID, NEW_CHANGE),
    ).rejects.toEqual(
      new ConflictException(
        'A change to expectedAttendance is already awaiting review.',
      ),
    );

    const outage = new Error('connection lost');
    poolQuery.mockRejectedValueOnce(outage);
    await expect(
      repository.createFlaggedChange(EVENT_ID, NEW_CHANGE),
    ).rejects.toBe(outage);
  });

  /**
   * EVENT-FLAG-01-G: a new flagged change stores its values and impacts as
   * JSON and returns the stored row in the service's shape.
   */
  it('EVENT-FLAG-01-G stores a flagged change and returns the saved row', async () => {
    const { repository, poolQuery } = makeDatabase([changeDbRow()]);

    const saved = await repository.createFlaggedChange(EVENT_ID, NEW_CHANGE);

    const [, params] = poolQuery.mock.calls[0];
    expect(params.slice(1)).toEqual([
      EVENT_ID,
      'booking_conflict',
      'expectedAttendance',
      '80',
      '150',
      '[]',
      '[]',
      'Coord Nine',
      'coord-9',
    ]);
    expect(saved).toMatchObject({
      id: CHANGE_ID,
      status: 'Needs Review',
      proposedBy: 'Coord Nine',
    });
  });

  /**
   * EVENT-FLAG-07-B: a decision for one booking is recorded on that booking
   * only (the change stays open), while a decision without a booking closes
   * the whole change and records who resolved it.
   */
  it('EVENT-FLAG-07-B records a per-booking decision separately from closing the change', async () => {
    const { repository, poolQuery } = makeDatabase([changeDbRow()]);
    const resolvedAt = new Date('2026-10-05T09:00:00.000Z');
    const base: ChangeResolution = {
      status: 'Rejected',
      resolvedBy: 'Coord Nine',
      resolvedAt,
      clearImpacts: true,
    };

    await repository.resolveChange(EVENT_ID, CHANGE_ID, {
      ...base,
      bookingId: 'bk-1',
    });
    const [bookingSql, bookingParams] = poolQuery.mock.calls[0];
    expect(bookingSql).toContain('SET impacts =');
    expect(bookingSql).not.toContain('SET status');
    expect(bookingParams).toEqual([
      CHANGE_ID,
      EVENT_ID,
      'bk-1',
      'Rejected',
      'Coord Nine',
      resolvedAt,
      true,
    ]);

    await repository.resolveChange(EVENT_ID, CHANGE_ID, {
      status: 'Applied',
      resolvedBy: 'Coord Nine',
      resolvedAt,
    });
    const [closeSql, closeParams] = poolQuery.mock.calls[1];
    expect(closeSql).toContain('SET status = $3');
    // No resolver id and no clear flag are sent as null and false.
    expect(closeParams).toEqual([
      CHANGE_ID,
      EVENT_ID,
      'Applied',
      'Coord Nine',
      null,
      resolvedAt,
      false,
    ]);

    await repository.resolveChange(EVENT_ID, CHANGE_ID, {
      ...base,
      resolvedById: 'coord-9',
    });
    expect(poolQuery.mock.calls[2][1][4]).toBe('coord-9');
  });

  /**
   * EVENT-FLAG-04-C: deciding a change that is no longer awaiting review
   * (no row updated) is refused as already resolved.
   */
  it('EVENT-FLAG-04-C refuses to resolve a change that is no longer pending', async () => {
    const { repository } = makeDatabase([]);
    await expect(
      repository.resolveChange(EVENT_ID, CHANGE_ID, {
        status: 'Applied',
        resolvedBy: 'Coord Nine',
        resolvedAt: new Date(),
      }),
    ).rejects.toEqual(
      new ConflictException('This change has already been resolved.'),
    );
  });
});

describe('EventPlanningRepository row mapping', () => {
  /**
   * EVENT-VIEW-02-F: an event row is returned with camel-cased fields and
   * ISO-8601 UTC timestamps, whether the driver gives Date objects or text.
   */
  it('EVENT-VIEW-02-F maps an event row with ISO timestamps', async () => {
    const { repository, poolQuery } = makeDatabase([eventDbRow()]);

    await expect(repository.findEvent(EVENT_ID)).resolves.toEqual({
      id: EVENT_ID,
      organiserId: 'organiser-1',
      organiserName: 'Demo Organiser',
      coordinatorId: 'coord-9',
      coordinatorName: 'Coord Nine',
      status: 'Planning',
      name: 'Welcome Evening',
      purpose: 'Community building',
      description: 'A welcome event for new members.',
      startDateTime: '2026-11-10T10:00:00.000Z',
      endDateTime: '2026-11-10T13:00:00.000Z',
      expectedAttendance: 80,
      layout: 'Banquet',
      facilities: ['Catering'],
      accessibility: ['Wheelchair ramps'],
      equipmentNeeds: 'Two microphones',
      registrationEnabled: true,
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: '2026-10-04T09:00:00.000Z',
    });

    // Text timestamps (another driver setting) give the same instants.
    poolQuery.mockResolvedValueOnce({
      rows: [eventDbRow({ start_date_time: '2026-11-10 18:00:00+08' })],
    });
    expect((await repository.findEvent(EVENT_ID))?.startDateTime).toBe(
      '2026-11-10T10:00:00.000Z',
    );
  });

  /**
   * EVENT-VIEW-02-F: an unassigned event has no coordinator, registration is
   * off unless stored, and a missing event is reported as undefined.
   */
  it('EVENT-VIEW-02-F maps missing coordinator and registration values and a missing event', async () => {
    const { repository, poolQuery } = makeDatabase([
      eventDbRow({
        coordinator_id: undefined,
        coordinator_name: undefined,
        registration_enabled: null,
      }),
    ]);
    await expect(repository.findEvent(EVENT_ID)).resolves.toMatchObject({
      coordinatorId: null,
      coordinatorName: null,
      registrationEnabled: false,
    });

    poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repository.findEvent(EVENT_ID)).resolves.toBeUndefined();
  });

  /**
   * EVENT-VIEW-02-G: venue bookings come back with venue name, capacity,
   * planning status and ISO times for the booking and each neighbouring
   * booking; with no proposed window the search window is sent as null and the
   * turnaround buffer is always sent.
   */
  it('EVENT-VIEW-02-G maps venue bookings and their neighbours', async () => {
    const { repository, poolQuery } = makeDatabase([
      {
        id: 'bk-1',
        venue_id: 'venue-a',
        venue_name: 'Hall A',
        venue_capacity: 200,
        start_at: new Date('2026-11-10T10:00:00.000Z'),
        end_at: new Date('2026-11-10T13:00:00.000Z'),
        planning_status: 'Booked',
        neighbours: [
          {
            id: 'bk-9',
            eventName: 'Other event',
            start: '2026-11-10T13:10:00+00:00',
            end: '2026-11-10T15:00:00+00:00',
          },
        ],
      },
    ]);

    await expect(repository.listVenueBookings(EVENT_ID)).resolves.toEqual([
      {
        id: 'bk-1',
        venueId: 'venue-a',
        venueName: 'Hall A',
        capacity: 200,
        start: '2026-11-10T10:00:00.000Z',
        end: '2026-11-10T13:00:00.000Z',
        status: 'Booked',
        neighbours: [
          {
            id: 'bk-9',
            eventName: 'Other event',
            start: '2026-11-10T13:10:00.000Z',
            end: '2026-11-10T15:00:00.000Z',
          },
        ],
      },
    ]);
    expect(poolQuery.mock.calls[0][1]).toEqual([
      EVENT_ID,
      null,
      null,
      TURNAROUND_MINUTES,
    ]);

    await repository.listVenueBookings(EVENT_ID, {
      start: '2026-11-11T10:00:00.000Z',
      end: '2026-11-11T12:00:00.000Z',
    });
    expect(poolQuery.mock.calls[1][1]).toEqual([
      EVENT_ID,
      '2026-11-11T10:00:00.000Z',
      '2026-11-11T12:00:00.000Z',
      TURNAROUND_MINUTES,
    ]);
  });

  /**
   * EVENT-VIEW-02-G: equipment arrangements come back with name, quantity and
   * status.
   */
  it('EVENT-VIEW-02-G maps equipment arrangements', async () => {
    const { repository } = makeDatabase([
      {
        id: 'eq-1',
        equipment_name: 'Projector',
        quantity: 2,
        status: 'Reserved',
      },
    ]);
    await expect(
      repository.listEquipmentArrangements(EVENT_ID),
    ).resolves.toEqual([
      { id: 'eq-1', name: 'Projector', quantity: 2, status: 'Reserved' },
    ]);
  });

  /**
   * EVENT-FLAG-05-D: a resolved change is returned with who resolved it and
   * when; an unresolved one has no resolver or time, and missing impact lists
   * are returned as empty lists.
   */
  it('EVENT-FLAG-05-D maps flagged changes with and without resolution details', async () => {
    const { repository } = makeDatabase([
      changeDbRow({
        status: 'Applied',
        resolved_by: 'Coord Nine',
        resolved_at: new Date('2026-10-05T09:00:00.000Z'),
      }),
      changeDbRow({ impacts: null, equipment_impacts: null }),
    ]);

    const [resolved, pending] = await repository.listHistory(EVENT_ID);
    expect(resolved).toEqual({
      id: CHANGE_ID,
      eventId: EVENT_ID,
      kind: 'booking_conflict',
      field: 'expectedAttendance',
      originalValue: 80,
      proposedValue: 150,
      status: 'Applied',
      impacts: [{ bookingId: 'bk-1', impacted: true, conflicts: [] }],
      equipmentImpacts: [],
      proposedBy: 'Coord Nine',
      createdAt: '2026-10-05T08:00:00.000Z',
      resolvedBy: 'Coord Nine',
      resolvedAt: '2026-10-05T09:00:00.000Z',
    });
    expect(pending).toMatchObject({
      impacts: [],
      equipmentImpacts: [],
      resolvedBy: undefined,
      resolvedAt: undefined,
    });
  });

  /**
   * EVENT-FLAG-05-D: looking up a change by its id and event returns it, and
   * a change that does not belong to the event returns undefined.
   */
  it('EVENT-FLAG-05-D returns a change that is found and undefined for one that is not', async () => {
    const { repository, poolQuery } = makeDatabase([changeDbRow()]);
    await expect(
      repository.findChange(EVENT_ID, CHANGE_ID),
    ).resolves.toMatchObject({ id: CHANGE_ID, status: 'Needs Review' });
    expect(poolQuery.mock.calls[0][1]).toEqual([CHANGE_ID, EVENT_ID]);

    poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(
      repository.findChange(EVENT_ID, CHANGE_ID),
    ).resolves.toBeUndefined();
  });
});
