import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../../database/database.service.js';
import { VenuesRepository } from './venues.repository.js';

const venue = {
  id: 'b9c6f700-85b1-4a79-96d8-5f5c3fd616fb',
  name: 'Orchid Hall Test',
  location: 'Test Building Level 3',
  capacity: 120,
  facilities: ['AV System', 'Wi-Fi'],
  accessibility: ['Wheelchair access'],
  layouts: ['Classroom', 'Theatre'],
  operatingInformation: 'Closed on public holidays',
  setupTimeMinutes: 30,
  turnaroundTimeMinutes: 45,
};
const venueInput = {
  name: venue.name,
  location: venue.location,
  capacity: venue.capacity,
  facilities: venue.facilities,
  accessibility: venue.accessibility,
  layouts: venue.layouts,
  operatingInformation: venue.operatingInformation,
  setupTimeMinutes: venue.setupTimeMinutes,
  turnaroundTimeMinutes: venue.turnaroundTimeMinutes,
};
const ownerUserId = '8ff4073d-8baa-4d32-984e-b93a46cbe49d';
const assignedEventTime = {
  start_date_time: new Date('2030-01-12T04:00:00.000Z'),
  end_date_time: new Date('2030-01-12T05:00:00.000Z'),
};

function createScheduleConflictRepository(
  reason: string | null,
  now = new Date('2030-01-01T00:00:00.000Z'),
) {
  const query = vi
    .fn()
    .mockResolvedValueOnce({
      rows: [
        {
          id: venue.id,
          capacity: venue.capacity,
          facilities: venue.facilities,
          accessibility: venue.accessibility,
          layouts: venue.layouts,
          setup_time_minutes: 30,
          turnaround_time_minutes: 45,
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          id: 'event-1',
          status: 'Planning',
          expected_attendance: 20,
          required_facilities: [],
          accessibility_needs: [],
          preferred_room_layout: '',
          ...assignedEventTime,
        },
      ],
    })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: reason ? [{ reason }] : [] });
  const repository = new VenuesRepository(
    {
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService,
    { now: () => now },
  );
  return { repository, query, now };
}

describe('VenuesRepository', () => {
  /** VEN-BKG-02-B: suitability mismatches are advisory; schedule conflicts remain blockers. */
  it.each([
    {
      requirement: 'facility',
      venueFields: {
        facilities: ['AV System'],
        accessibility: ['Wheelchair access'],
      },
      eventFields: {
        required_facilities: ['AV System', 'Microphones'],
        accessibility_needs: [],
      },
      reason: 'facility',
    },
    {
      requirement: 'accessibility',
      venueFields: { facilities: ['AV System'], accessibility: [] },
      eventFields: {
        required_facilities: [],
        accessibility_needs: ['Wheelchair access'],
      },
      reason: 'accessibility',
    },
    {
      requirement: 'room layout',
      venueFields: {
        facilities: ['AV System'],
        accessibility: ['Wheelchair access'],
        layouts: ['Classroom'],
      },
      eventFields: {
        required_facilities: [],
        accessibility_needs: [],
        preferred_room_layout: 'Theatre',
      },
      reason: 'room layout',
    },
  ])(
    'VEN-BKG-02-B SPM-54 allows a request with a persisted $requirement mismatch',
    async ({ venueFields, eventFields, reason }) => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: venue.id,
              capacity: 120,
              layouts: ['Classroom'],
              setup_time_minutes: 0,
              turnaround_time_minutes: 0,
              ...venueFields,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'event-1',
              status: 'Planning',
              ...assignedEventTime,
              expected_attendance: 20,
              preferred_room_layout: '',
              ...eventFields,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'booking-1',
              start_at: assignedEventTime.start_date_time,
              end_at: assignedEventTime.end_date_time,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });
      const repository = new VenuesRepository({
        transaction: (work: (client: unknown) => Promise<unknown>) =>
          work({ query }),
      } as unknown as DatabaseService);

      await expect(
        repository.submitBookingRequest(venue.id, ownerUserId, {
          eventId: '00000000-0000-4000-8000-000000000001',
          start: '2030-01-12T04:00:00Z',
          end: '2030-01-12T05:00:00Z',
        }),
      ).resolves.toMatchObject({ kind: 'created', id: 'booking-1' });
      expect(
        query.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO venue_bookings'),
        ),
      ).toBe(true);
      expect(reason).toBeTruthy();
    },
  );

  /** VEN-BKG-02-B: a venue below expected attendance remains requestable. */
  it('VEN-BKG-02-B SPM-54 allows a request when attendance exceeds venue capacity', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: venue.id,
            capacity: 19,
            facilities: [],
            accessibility: [],
            layouts: [],
            setup_time_minutes: 0,
            turnaround_time_minutes: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'event-1',
            status: 'Planning',
            ...assignedEventTime,
            expected_attendance: 20,
            required_facilities: [],
            accessibility_needs: [],
            preferred_room_layout: '',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'booking-1',
            start_at: assignedEventTime.start_date_time,
            end_at: assignedEventTime.end_date_time,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);
    const result = await repository.submitBookingRequest(
      venue.id,
      ownerUserId,
      {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00Z',
        end: '2030-01-12T05:00:00Z',
      },
    );
    expect(result).toMatchObject({ kind: 'created', id: 'booking-1' });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO venue_bookings'),
      ),
    ).toBe(true);
  });

  /** VEN-BKG-02-C: occupied setup/turnaround time blocks an otherwise non-overlapping event request. */
  it('VEN-BKG-02-C SPM-54 blocks a request when setup or turnaround overlaps another booking', async () => {
    const { repository, query } = createScheduleConflictRepository('Workshop');
    const result = await repository.submitBookingRequest(
      venue.id,
      ownerUserId,
      {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      },
    );

    expect(result).toEqual({ kind: 'conflict', reason: 'Workshop' });
    expect(String(query.mock.calls[3][0])).toContain(
      'make_interval(mins => $4::int)',
    );
    expect(String(query.mock.calls[3][0])).toContain(
      'make_interval(mins => $5::int)',
    );
    expect(query.mock.calls[3][1]).toEqual([
      venue.id,
      assignedEventTime.start_date_time,
      assignedEventTime.end_date_time,
      30,
      45,
      new Date('2030-01-01T00:00:00.000Z'),
    ]);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO venue_bookings'),
      ),
    ).toBe(false);
  });

  /** VEN-BKG-02-D: operational unavailability blocks the requested event period and is explained without a write. */
  it('VEN-BKG-02-D SPM-54 reports an operational unavailability blocker', async () => {
    const { repository, query } =
      createScheduleConflictRepository('Maintenance');
    await expect(
      repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      }),
    ).resolves.toEqual({ kind: 'conflict', reason: 'Maintenance' });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO venue_bookings'),
      ),
    ).toBe(false);
  });

  /** VEN-BKG-02-BND-1: a one-minute setup overlap is a conflict, not an adjacent free interval. */
  it('VEN-BKG-02-BND-1 SPM-54 refuses a one-minute overlap at setup start', async () => {
    const { repository, query } =
      createScheduleConflictRepository('Setup overlap');
    await expect(
      repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      }),
    ).resolves.toMatchObject({ kind: 'conflict', reason: 'Setup overlap' });
    expect(String(query.mock.calls[3][0])).toContain(
      'start_at < $3::timestamptz + make_interval',
    );
    expect(String(query.mock.calls[3][0])).toContain(
      'end_at > $2::timestamptz - make_interval',
    );
  });

  /** VEN-BKG-02-BND-2: a one-minute overlap at the end of turnaround remains blocked. */
  it('VEN-BKG-02-BND-2 SPM-54 refuses a one-minute overlap at turnaround end', async () => {
    const { repository, query } =
      createScheduleConflictRepository('Turnaround overlap');
    await expect(
      repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      kind: 'conflict',
      reason: 'Turnaround overlap',
    });
    expect(String(query.mock.calls[3][0])).toContain(
      'b.end_at + make_interval(mins => $5::int)',
    );
    expect(query.mock.calls[3][1][4]).toBe(45);
  });

  /** VEN-BKG-02-VAR-1: active holds block, while holds expired at the injected clock stop blocking. */
  it('VEN-BKG-02-VAR-1 SPM-54 uses the current time to distinguish active and expired holds', async () => {
    const { repository, query, now } =
      createScheduleConflictRepository('Tentative hold');
    await expect(
      repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      }),
    ).resolves.toMatchObject({ kind: 'conflict', reason: 'Tentative hold' });
    expect(String(query.mock.calls[3][0])).toContain(
      'hold_expires_at > $6::timestamptz',
    );
    expect(query.mock.calls[3][1][5]).toBe(now);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO venue_bookings'),
      ),
    ).toBe(false);
  });
  /** VEN-BKG-08-A: My Bookings records retain separate event/venue identity, lifecycle status, and optional request text. */
  it('SPM-54 lists coordinator venue bookings as independent records', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'booking-1',
          event_id: 'event-1',
          event_name: 'Gala',
          venue_id: 'venue-1',
          venue_name: 'Main Hall',
          start_at: new Date('2030-01-12T04:00:00Z'),
          end_at: new Date('2030-01-12T05:00:00Z'),
          status: 'pending',
          special_request: 'Microphones',
          created_at: new Date('2030-01-01T00:00:00Z'),
          affected: false,
          booking_reference: 'VB-BOOKING1',
        },
        {
          id: 'booking-2',
          event_id: 'event-2',
          event_name: 'Evening Concert',
          venue_id: 'venue-2',
          venue_name: 'Garden Hall',
          start_at: new Date('2030-01-13T04:00:00Z'),
          end_at: new Date('2030-01-13T05:00:00Z'),
          status: 'cancelled',
          special_request: null,
          created_at: new Date('2030-01-02T00:00:00Z'),
          affected: false,
          booking_reference: 'VB-BOOKING2',
        },
      ],
    });
    const repository = new VenuesRepository({
      query,
    } as unknown as DatabaseService);
    await expect(
      repository.listCoordinatorBookings(ownerUserId),
    ).resolves.toMatchObject([
      {
        id: 'booking-1',
        eventId: 'event-1',
        venueId: 'venue-1',
        status: 'pending',
        specialRequest: 'Microphones',
      },
      {
        id: 'booking-2',
        eventId: 'event-2',
        venueId: 'venue-2',
        status: 'cancelled',
        specialRequest: undefined,
      },
    ]);
    expect(query.mock.calls[0][0]).toContain('e.coordinator_id = $1::text');
  });

  /** VEN-BKG-10-A: cancelling the final active booking returns a confirmation requirement without writing a status change. */
  it('SPM-54 does not cancel the last active venue booking without confirmation', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'booking-1', event_id: 'event-1', status: 'pending' }],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const database = {
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    };
    const repository = new VenuesRepository(
      database as unknown as DatabaseService,
    );
    await expect(
      repository.cancelCoordinatorBooking(ownerUserId, 'booking-1', false),
    ).resolves.toEqual({ kind: 'last-active' });
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toContain(
      "status IN ('pending', 'approved')",
    );
  });

  /** VEN-BKG-10-A/SEC-1: after the explicit confirmation boolean is true, cancelling the sole active booking updates only that row. */
  it('VEN-BKG-10-A VEN-BKG-10-SEC-1 SPM-54 cancels the sole active booking after explicit confirmation', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'booking-1', event_id: 'event-1', status: 'pending' }],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.cancelCoordinatorBooking(ownerUserId, 'booking-1', true),
    ).resolves.toEqual({ kind: 'cancelled' });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toContain("status = 'cancelled'");
    expect(query.mock.calls[2][1]).toEqual(['booking-1']);
  });

  /** VEN-BKG-09-A: explicit cancellation changes only the owned active booking row and preserves its history. */
  it('SPM-54 cancels one owned active venue booking after confirmation', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'booking-1', event_id: 'event-1', status: 'approved' }],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const database = {
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    };
    const repository = new VenuesRepository(
      database as unknown as DatabaseService,
    );
    await expect(
      repository.cancelCoordinatorBooking(ownerUserId, 'booking-1', true),
    ).resolves.toEqual({ kind: 'cancelled' });
    expect(query.mock.calls[2][0]).toContain("status = 'cancelled'");
    expect(query.mock.calls[2][1]).toEqual(['booking-1']);
  });

  /** VEN-BKG-09-A: only pending or approved rows can be cancelled; a retained cancelled row is unchanged. */
  it('SPM-54 returns not-active for an already cancelled booking without querying or changing other rows', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ id: 'booking-1', event_id: 'event-1', status: 'cancelled' }],
    });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.cancelCoordinatorBooking(ownerUserId, 'booking-1', true),
    ).resolves.toEqual({ kind: 'not-active' });
    expect(query).toHaveBeenCalledOnce();
  });

  /** VEN-BKG-09-SEC-1: an unowned or missing identifier cannot cancel any booking. */
  it('SPM-54 returns not-found for an unknown booking and does not query further', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.cancelCoordinatorBooking(ownerUserId, 'booking-missing', true),
    ).resolves.toEqual({ kind: 'not-found' });
    expect(query).toHaveBeenCalledOnce();
  });

  /** VEN-BKG-10-VAR-1: another active booking suppresses the final-booking warning and remains unchanged. */
  it('VEN-BKG-10-VAR-1 SPM-54 cancels one booking while another pending venue booking remains', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'booking-1', event_id: 'event-1', status: 'pending' }],
      })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.cancelCoordinatorBooking(ownerUserId, 'booking-1', false),
    ).resolves.toEqual({ kind: 'cancelled' });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][1]).toEqual(['booking-1']);
  });

  /** VEN-BKG-10-VAR-2: inactive retained booking history does not suppress the final-active-booking warning. */
  it('VEN-BKG-10-VAR-2 SPM-54 warns when all other booking history is inactive', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: 'booking-1', event_id: 'event-1', status: 'pending' }],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.cancelCoordinatorBooking(ownerUserId, 'booking-1', false),
    ).resolves.toEqual({ kind: 'last-active' });
    expect(String(query.mock.calls[1][0])).toContain(
      "status IN ('pending', 'approved')",
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  /** SPM-51 AC6: submission stops before event lookup when the venue no longer exists. */
  it('returns venue-not-found before looking up the coordinator event', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      }),
    ).resolves.toEqual({ kind: 'venue-not-found' });
    expect(query).toHaveBeenCalledOnce();
  });

  /** SPM-51 AC6: submission cannot continue when the event is not assigned to this coordinator. */
  it('returns event-not-assigned without running conflict queries or inserting', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: venue.id,
            setup_time_minutes: 15,
            turnaround_time_minutes: 20,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      }),
    ).resolves.toEqual({ kind: 'event-not-assigned' });
    expect(query).toHaveBeenCalledTimes(2);
  });

  /** VEN-BKG-07-B: a distinct second venue is independently requestable despite suitability warnings. */
  it('VEN-BKG-07-B SPM-54 permits a second distinct venue with advisory mismatches', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: venue.id,
            capacity: 19,
            facilities: [],
            accessibility: [],
            layouts: [],
            setup_time_minutes: 0,
            turnaround_time_minutes: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'event-1',
            status: 'Planning',
            expected_attendance: 20,
            required_facilities: [],
            accessibility_needs: [],
            preferred_room_layout: '',
            ...assignedEventTime,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'booking-2',
            start_at: assignedEventTime.start_date_time,
            end_at: assignedEventTime.end_date_time,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      }),
    ).resolves.toMatchObject({ kind: 'created', id: 'booking-2' });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO venue_bookings'),
      ),
    ).toBe(true);
  });

  /** VEN-BKG-07-A: one active event/venue pair is independently retained and blocks only its own duplicate. */
  it('VEN-BKG-07-A SPM-54 returns the existing active request without inserting another booking', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: venue.id,
            capacity: venue.capacity,
            facilities: venue.facilities,
            accessibility: venue.accessibility,
            layouts: venue.layouts,
            setup_time_minutes: 0,
            turnaround_time_minutes: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '00000000-0000-4000-8000-000000000099',
            status: 'Planning',
            ...assignedEventTime,
            expected_attendance: 20,
            required_facilities: [],
            accessibility_needs: [],
            preferred_room_layout: '',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'booking-1', status: 'pending' }],
      });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: '00000000-0000-4000-8000-000000000099',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      }),
    ).resolves.toEqual({
      kind: 'already-requested',
      id: 'booking-1',
      status: 'pending',
    });
    expect(query.mock.calls[2][0]).toContain("status = 'pending' OR (status = 'approved' AND");
    expect(query.mock.calls[2][0]).toContain("request_kind <> 'tentative_hold' OR hold_expires_at IS NULL OR hold_expires_at > $3::timestamptz");
    expect(query.mock.calls[2][1]).toEqual([
      '00000000-0000-4000-8000-000000000099',
      venue.id,
      expect.any(Date),
    ]);
    expect(query).toHaveBeenCalledTimes(3);
  });

  /** VEN-BKG-07-A: cancelled and rejected history is retained but does not block a new request for that venue. */
  it.each(['cancelled', 'rejected'] as const)(
    'VEN-BKG-07-A allows a new request when the only prior row is %s',
    async (previousStatus) => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('FROM venues v WHERE v.id'))
          return {
            rows: [
              {
                id: venue.id,
                capacity: venue.capacity,
                facilities: venue.facilities,
                accessibility: venue.accessibility,
                layouts: venue.layouts,
                setup_time_minutes: 0,
                turnaround_time_minutes: 0,
              },
            ],
          };
        if (sql.includes('FROM events WHERE id'))
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000099',
                status: 'Planning',
                ...assignedEventTime,
                expected_attendance: 20,
                required_facilities: [],
                accessibility_needs: [],
                preferred_room_layout: '',
              },
            ],
          };
        if (sql.includes('SELECT id, status FROM venue_bookings'))
          return {
            rows: ['pending', 'approved'].includes(previousStatus)
              ? [{ id: 'prior', status: previousStatus }]
              : [],
          };
        if (sql.includes('SELECT reason FROM')) return { rows: [] };
        if (sql.includes('INSERT INTO venue_bookings'))
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000100',
                start_at: new Date('2030-01-12T04:00:00.000Z'),
                end_at: new Date('2030-01-12T05:00:00.000Z'),
              },
            ],
          };
        return { rows: [] };
      });
      const repository = new VenuesRepository({
        transaction: (work: (client: unknown) => Promise<unknown>) =>
          work({ query }),
      } as unknown as DatabaseService);

      const result = await repository.submitBookingRequest(
        venue.id,
        ownerUserId,
        {
          eventId: '00000000-0000-4000-8000-000000000099',
          start: '2030-01-12T04:00:00.000Z',
          end: '2030-01-12T05:00:00.000Z',
        },
      );

      expect(result).toMatchObject({
        kind: 'created',
        id: '00000000-0000-4000-8000-000000000100',
      });
      expect(String(query.mock.calls[2][0])).toContain("status = 'pending' OR (status = 'approved' AND");
      expect(String(query.mock.calls[2][0])).toContain("request_kind <> 'tentative_hold' OR hold_expires_at IS NULL OR hold_expires_at > $3::timestamptz");
      expect((query.mock.calls[2] as unknown[])[1]).toEqual([
        '00000000-0000-4000-8000-000000000099',
        venue.id,
        expect.any(Date),
      ]);
    },
  );

  /** VEN-AVL-07-SEC-1: submission rechecks conflicts under the venue lock and does not insert on conflict. */
  it('does not record a request when a fresh booking conflict appears after the availability read', async () => {
    const queries: string[] = [];
    const parameters: unknown[][] = [];
    const now = new Date('2030-01-01T00:00:00.000Z');
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        queries.push(sql);
        parameters.push(values);
        if (sql.includes('FROM venues v WHERE v.id'))
          return {
            rows: [
              {
                id: venue.id,
                capacity: 120,
                facilities: ['AV System', 'Wi-Fi'],
                accessibility: ['Wheelchair access'],
                layouts: ['Classroom', 'Theatre'],
                setup_time_minutes: 15,
                turnaround_time_minutes: 20,
              },
            ],
          };
        if (sql.includes('FROM events WHERE id'))
          return {
            rows: [
              {
                id: 'event-1',
                status: 'Planning',
                ...assignedEventTime,
                expected_attendance: 20,
                required_facilities: [],
                accessibility_needs: [],
                preferred_room_layout: '',
              },
            ],
          };
        if (sql.includes('SELECT reason FROM'))
          return { rows: [{ reason: 'Workshop' }] };
        return { rows: [] };
      }),
    };
    const database = {
      transaction: (work: (queryable: unknown) => Promise<unknown>) =>
        work(client),
    };
    const repository = new VenuesRepository(
      database as unknown as DatabaseService,
      { now: () => now },
    );

    const result = await repository.submitBookingRequest(
      venue.id,
      ownerUserId,
      {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
      },
    );

    expect(result).toEqual({ kind: 'conflict', reason: 'Workshop' });
    expect(queries[0]).toContain('FOR UPDATE');
    expect(queries[1]).toContain('coordinator_id = $2::text');
    expect(queries[2]).toContain("status = 'pending' OR (status = 'approved' AND");
    expect(queries[2]).toContain("request_kind <> 'tentative_hold' OR hold_expires_at IS NULL OR hold_expires_at > $3::timestamptz");
    expect(parameters[2]).toEqual(['00000000-0000-4000-8000-000000000001', venue.id, now]);
    expect(queries[3]).toContain('b.hold_expires_at > $6::timestamptz');
    expect(queries[3]).toContain('FROM venue_booking_requests r');
    expect(queries[3]).toContain("b.status = 'approved'");
    expect(queries[3]).toContain("b.request_kind <> 'tentative_hold' AND EXISTS (");
    expect(parameters[3][5]).toBe(now);
    expect(
      queries.some((sql) => sql.includes('INSERT INTO venue_bookings')),
    ).toBe(false);
  });

  /** VEN-BKG-02-A and VEN-BKG-03-A: a clear request is persisted using the selected event and optional request data. */
  it('VEN-BKG-02-A VEN-BKG-03-A SPM-54 records a request after a clear fresh schedule check', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: venue.id,
              capacity: 120,
              facilities: ['AV System', 'Wi-Fi'],
              accessibility: ['Wheelchair access'],
              layouts: ['Classroom', 'Theatre'],
              setup_time_minutes: 15,
              turnaround_time_minutes: 20,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'event-1',
              status: 'Planning',
              ...assignedEventTime,
              expected_attendance: 20,
              required_facilities: [],
              accessibility_needs: [],
              preferred_room_layout: '',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000099',
              start_at: new Date('2030-01-12T04:00:00.000Z'),
              end_at: new Date('2030-01-12T05:00:00.000Z'),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const database = {
      transaction: (work: (queryable: unknown) => Promise<unknown>) =>
        work(client),
    };
    const repository = new VenuesRepository(
      database as unknown as DatabaseService,
    );

    const result = await repository.submitBookingRequest(
      venue.id,
      ownerUserId,
      {
        eventId: '00000000-0000-4000-8000-000000000001',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
        specialRequest: 'Microphones, please.',
      },
    );

    expect(result).toMatchObject({
      kind: 'created',
      id: '00000000-0000-4000-8000-000000000099',
    });
    expect(client.query).toHaveBeenCalledTimes(6);
    expect(String(client.query.mock.calls[0][0])).toContain(
      'array_agg(a.label ORDER BY a.label)',
    );
    expect(String(client.query.mock.calls[0][0])).not.toContain('a.name');
    expect(String(client.query.mock.calls[4][0])).toContain("'pending'");
    expect(String(client.query.mock.calls[5][0])).toContain(
      'INSERT INTO venue_booking_requests',
    );
    expect(client.query.mock.calls[5][1]).toEqual([
      '00000000-0000-4000-8000-000000000001',
      venue.id,
      'Microphones, please.',
    ]);
  });

  /** VEN-BKG-03-SEC-1: client-tampered start and end values do not change the persisted event's authoritative period. */
  it('VEN-BKG-03-SEC-1 SPM-54 derives the booking period from the assigned event', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: venue.id,
            capacity: venue.capacity,
            facilities: venue.facilities,
            accessibility: venue.accessibility,
            layouts: venue.layouts,
            setup_time_minutes: 0,
            turnaround_time_minutes: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'event-1',
            status: 'Planning',
            expected_attendance: 20,
            required_facilities: [],
            accessibility_needs: [],
            preferred_room_layout: '',
            ...assignedEventTime,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'booking-1',
            start_at: assignedEventTime.start_date_time,
            end_at: assignedEventTime.end_date_time,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: 'event-1',
        start: '2030-01-13T12:00:00.000Z',
        end: '2030-01-13T13:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      kind: 'created',
      start: assignedEventTime.start_date_time.toISOString(),
      end: assignedEventTime.end_date_time.toISOString(),
    });
    expect(query.mock.calls[3][1]).toEqual([
      venue.id,
      assignedEventTime.start_date_time,
      assignedEventTime.end_date_time,
      0,
      0,
      expect.any(Date),
    ]);
    expect(query.mock.calls[4][1]).toEqual([
      venue.id,
      'event-1',
      assignedEventTime.start_date_time,
      assignedEventTime.end_date_time,
      null,
    ]);
  });

  // SPM-50 / VEN-CRE-05-A, VEN-CRE-05-B: the venue and all normalized selections are stored together.
  it('inserts a venue and its relationships in one transaction', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...venue,
            operating_information: venue.operatingInformation,
            // PostgreSQL's `time` type returns seconds even when the API received HH:MM.
            setup_time_minutes: venue.setupTimeMinutes,
            turnaround_time_minutes: venue.turnaroundTimeMinutes,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const transaction = vi.fn(async (work) => work({ query }));
    const repository = new VenuesRepository({
      transaction,
    } as unknown as DatabaseService);

    await expect(repository.create(ownerUserId, venueInput)).resolves.toEqual(
      { ...venue, ownerId: ownerUserId },
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining('INSERT INTO venues (owner_user_id,'),
      [
        ownerUserId,
        venue.name,
        venue.location,
        venue.capacity,
        venue.operatingInformation,
        venue.setupTimeMinutes,
        venue.turnaroundTimeMinutes,
      ],
    ]);
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('INSERT INTO venue_accessibility'),
      [venue.id, ['wheelchair-access']],
    ]);
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining('INSERT INTO venue_facilities'),
      [venue.id, venue.facilities],
    ]);
    expect(query.mock.calls[3]).toEqual([
      expect.stringContaining('INSERT INTO venue_layouts'),
      [venue.id, venue.layouts],
    ]);
  });

  // SPM-50 business rule: no accessibility selection creates no accessibility relationship without affecting other venue writes.
  it('persists an empty accessibility relationship set', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...venue,
            accessibility: [],
            operating_information: venue.operatingInformation,
            setup_time_minutes: venue.setupTimeMinutes,
            turnaround_time_minutes: venue.turnaroundTimeMinutes,
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const transaction = vi.fn(async (work) => work({ query }));
    const repository = new VenuesRepository({
      transaction,
    } as unknown as DatabaseService);

    await expect(
      repository.create(ownerUserId, { ...venueInput, accessibility: [] }),
    ).resolves.toEqual({ ...venue, ownerId: ownerUserId, accessibility: [] });
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('INSERT INTO venue_accessibility'),
      [venue.id, []],
    ]);
    expect(query.mock.calls[2][0]).toContain('INSERT INTO venue_facilities');
    expect(query.mock.calls[3][0]).toContain('INSERT INTO venue_layouts');
  });

  // SPM-50 image follow-up: optional venue media participates in the same atomic creation transaction.
  it('inserts an optional venue image with the venue relationships', async () => {
    const image = {
      name: 'orchid-hall.png',
      type: 'image/png',
      size: 4,
      dataUrl: 'data:image/png;base64,dGVzdA==',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...venue,
            operating_information: venue.operatingInformation,
            setup_time_minutes: venue.setupTimeMinutes,
            turnaround_time_minutes: venue.turnaroundTimeMinutes,
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const transaction = vi.fn(async (work) => work({ query }));
    const repository = new VenuesRepository({
      transaction,
    } as unknown as DatabaseService);

    await expect(
      repository.create(ownerUserId, { ...venueInput, image }),
    ).resolves.toEqual({
      ...venue,
      ownerId: ownerUserId,
      image,
    });

    expect(query.mock.calls[4]).toEqual([
      expect.stringContaining('INSERT INTO venue_images'),
      [venue.id, image.name, image.type, image.size, image.dataUrl],
    ]);
  });

  // SPM-50 / AC5 regression: storage failures remain visible to standard error handling.
  it('propagates a database failure', async () => {
    const failure = new Error('database unavailable');
    const transaction = vi.fn().mockRejectedValue(failure);
    const repository = new VenuesRepository({
      transaction,
    } as unknown as DatabaseService);

    await expect(repository.create(ownerUserId, venueInput)).rejects.toBe(
      failure,
    );
  });
});

describe('SPM-124 venue reads', () => {
  const readQuery = vi.fn();
  const id = '00000000-0000-4000-8000-000000000124';
  const owner = '00000000-0000-4000-8000-000000000001';
  const row = {
    ...venue,
    owner_user_id: owner,
    operating_information: venue.operatingInformation,
    setup_time_minutes: venue.setupTimeMinutes,
    turnaround_time_minutes: venue.turnaroundTimeMinutes,
    image_name: null,
    image_type: null,
    image_size: null,
    image_data_url: null,
  };

  beforeEach(() => vi.resetAllMocks());

  /** SPM-51 AC2: no venues return an empty schedule without issuing child schedule queries. */
  it('returns an empty catalogue without reading schedule tables', async () => {
    readQuery.mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      query: readQuery,
    } as unknown as DatabaseService);

    await expect(repository.list()).resolves.toEqual([]);
    expect(readQuery).toHaveBeenCalledOnce();
  });

  /** SPM-51 AC10: only explicit future-expiry holds appear as tentative; expired and unbounded pending requests are excluded. */
  it('skips stale, orphaned and unbounded pending rows while retaining an active hold', async () => {
    const now = new Date('2030-10-08T00:30:00.000Z');
    readQuery
      .mockResolvedValueOnce({ rows: [{ ...row, id }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'orphan-period',
            venue_id: 'other-venue',
            start_at: now,
            end_at: new Date(now.getTime() + 60_000),
            reason: 'Other venue',
            current: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'orphan-booking',
            venue_id: 'other-venue',
            event_name: 'Other venue',
            start_at: now,
            end_at: new Date(now.getTime() + 60_000),
            status: 'approved',
            current: true,
            affected: false,
          },
          {
            id: 'expired-row',
            venue_id: id,
            event_name: 'Expired row',
            start_at: now,
            end_at: new Date(now.getTime() + 60_000),
            status: 'pending',
            hold_expires_at: now,
            current: true,
            affected: false,
          },
          {
            id: 'unbounded-pending-row',
            venue_id: id,
            event_name: 'Pending request without hold expiry',
            start_at: now,
            end_at: new Date(now.getTime() + 60_000),
            status: 'pending',
            hold_expires_at: null,
            current: false,
            affected: false,
          },
          {
            id: 'active-row',
            venue_id: id,
            event_name: 'Active hold',
            start_at: now,
            end_at: new Date(now.getTime() + 60_000),
            status: 'pending',
            hold_expires_at: new Date(now.getTime() + 60_000),
            current: false,
            affected: false,
          },
        ],
      });
    const repository = new VenuesRepository(
      { query: readQuery } as unknown as DatabaseService,
      { now: () => now },
    );

    const [record] = await repository.list();

    expect(record.availabilityStatus).toBe('available');
    expect(record.unavailablePeriods).toEqual([]);
    expect(record.reservations).toEqual([
      {
        id: 'active-row',
        eventName: 'Active hold',
        start: now.toISOString(),
        end: new Date(now.getTime() + 60_000).toISOString(),
        status: 'tentative',
        holdExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
        affectedByUnavailablePeriod: false,
      },
    ]);
    expect(readQuery.mock.calls[2][0]).toContain(
      "b.status = 'pending' AND b.hold_expires_at > $2::timestamptz",
    );
  });

  /** SPM-159: a current Pending row with an unexpired hold expiry (legacy data) still makes the venue unavailable. */
  it('VEN-HOLD-04-SUP-BLOCKOUT marks the venue unavailable while a current pending row carries an unexpired hold', async () => {
    const now = new Date('2030-10-08T00:30:00.000Z');
    readQuery
      .mockResolvedValueOnce({ rows: [{ ...row, id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'current-pending-hold',
            venue_id: id,
            event_name: 'Current pending hold',
            start_at: now,
            end_at: new Date(now.getTime() + 60_000),
            status: 'pending',
            request_kind: 'tentative_hold',
            hold_expires_at: new Date(now.getTime() + 60_000),
            current: true,
            affected: false,
          },
        ],
      });
    const repository = new VenuesRepository(
      { query: readQuery } as unknown as DatabaseService,
      { now: () => now },
    );

    const [record] = await repository.list();

    expect(record.availabilityStatus).toBe('unavailable');
    expect(record.reservations).toHaveLength(1);
    expect(record.reservations[0].status).toBe('tentative');
  });

  // SPM-124: My venues queries are owner-scoped and include schedule data.
  it('scopes an explicit My venues query by owner and maps schedule information', async () => {
    readQuery
      .mockResolvedValueOnce({ rows: [{ ...row, id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      query: readQuery,
    } as unknown as DatabaseService);

    const [record] = await repository.list(owner);

    expect(readQuery.mock.calls[0][0]).toContain('v.owner_user_id = $1::uuid');
    expect(readQuery.mock.calls[0][1]).toEqual([owner]);
    expect(record).toEqual({
      ...venue,
      ownerId: owner,
      id,
      availabilityStatus: 'available',
      unavailablePeriods: [],
      reservations: [],
    });
  });

  // SPM-124: a current blockout is reflected in the catalogue response.
  it('maps current blockouts and active holds', async () => {
    readQuery
      .mockResolvedValueOnce({ rows: [{ ...row, id }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'future-blockout',
            venue_id: id,
            start_at: new Date('2030-10-09T00:00:00Z'),
            end_at: new Date('2030-10-10T00:00:00Z'),
            reason: 'Future maintenance',
            current: false,
          },
          {
            id: 'blockout',
            venue_id: id,
            start_at: new Date('2026-10-05T00:00:00Z'),
            end_at: new Date('2026-10-07T00:00:00Z'),
            reason: 'Maintenance',
            current: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'confirmed',
            venue_id: id,
            event_name: 'Current event',
            start_at: new Date('2026-10-06T00:00:00Z'),
            end_at: new Date('2026-10-06T02:00:00Z'),
            status: 'approved',
            hold_expires_at: null,
            current: true,
            affected: true,
          },
          {
            id: 'hold',
            venue_id: id,
            event_name: 'Workshop',
            start_at: new Date('2026-10-08T00:00:00Z'),
            end_at: new Date('2026-10-08T02:00:00Z'),
            status: 'pending',
            hold_expires_at: new Date('2030-10-08T00:30:00Z'),
            current: false,
            affected: false,
          },
        ],
      });
    const repository = new VenuesRepository({
      query: readQuery,
    } as unknown as DatabaseService);

    const [record] = await repository.list();

    expect(record).toEqual({
      ...venue,
      ownerId: owner,
      id,
      availabilityStatus: 'unavailable',
      unavailablePeriods: [
        {
          id: 'future-blockout',
          start: '2030-10-09T00:00:00.000Z',
          end: '2030-10-10T00:00:00.000Z',
          reason: 'Future maintenance',
          current: false,
        },
        {
          id: 'blockout',
          start: '2026-10-05T00:00:00.000Z',
          end: '2026-10-07T00:00:00.000Z',
          reason: 'Maintenance',
          current: true,
        },
      ],
      reservations: [
        {
          id: 'confirmed',
          eventName: 'Current event',
          start: '2026-10-06T00:00:00.000Z',
          end: '2026-10-06T02:00:00.000Z',
          status: 'booked',
          affectedByUnavailablePeriod: true,
        },
        {
          id: 'hold',
          eventName: 'Workshop',
          start: '2026-10-08T00:00:00.000Z',
          end: '2026-10-08T02:00:00.000Z',
          status: 'tentative',
          holdExpiresAt: '2030-10-08T00:30:00.000Z',
          affectedByUnavailablePeriod: false,
        },
      ],
    });
    expect(readQuery.mock.calls[2][0]).toContain(
      'b.start_at - make_interval(mins => v.setup_time_minutes) <= $2::timestamptz',
    );
    expect(readQuery.mock.calls[2][0]).toContain(
      'b.end_at + make_interval(mins => v.turnaround_time_minutes) > $2::timestamptz',
    );
    expect(readQuery.mock.calls[2][0]).toContain('b.hold_expires_at');
    expect(readQuery.mock.calls[2][0]).toContain(
      'b.hold_expires_at > $2::timestamptz',
    );
  });

  /** VEN-AVL-10-A: expired and exact-expiry pending holds are excluded at the injected current time. The exact-expiry instant is the boundary case of the same rule. */
  it('keeps only pending holds that expire after now', async () => {
    const now = new Date('2030-10-08T00:30:00.000Z');
    readQuery
      .mockResolvedValueOnce({ rows: [{ ...row, id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'expired',
            venue_id: id,
            event_name: 'Expired hold',
            start_at: new Date('2030-10-08T01:00:00Z'),
            end_at: new Date('2030-10-08T02:00:00Z'),
            status: 'pending',
            hold_expires_at: new Date(now.getTime() - 1),
            current: false,
            affected: false,
          },
          {
            id: 'active',
            venue_id: id,
            event_name: 'Active hold',
            start_at: new Date('2030-10-08T01:00:00Z'),
            end_at: new Date('2030-10-08T02:00:00Z'),
            status: 'pending',
            hold_expires_at: new Date(now.getTime() + 1),
            current: false,
            affected: false,
          },
          {
            id: 'exact',
            venue_id: id,
            event_name: 'Exact expiry hold',
            start_at: new Date('2030-10-08T01:00:00Z'),
            end_at: new Date('2030-10-08T02:00:00Z'),
            status: 'pending',
            hold_expires_at: now,
            current: false,
            affected: false,
          },
        ],
      });
    const repository = new VenuesRepository(
      { query: readQuery } as unknown as DatabaseService,
      { now: () => now },
    );

    const [record] = await repository.list();

    expect(record.reservations.map((item) => item.eventName)).toEqual([
      'Active hold',
    ]);
    expect(record.reservations[0].holdExpiresAt).toBe(
      '2030-10-08T00:30:00.001Z',
    );
    expect(readQuery.mock.calls[2][1]).toEqual([[id], now]);
    expect(readQuery.mock.calls[2][0]).toContain(
      'b.hold_expires_at > $2::timestamptz',
    );
  });

  /** VEN-HOLD-04-A: approved tentative holds stay tentative while their approval-time expiry is future; expired holds disappear. */
  it('maps an approved active hold as tentative and filters expired approved holds', async () => {
    const now = new Date('2030-10-08T00:30:00.000Z');
    readQuery
      .mockResolvedValueOnce({ rows: [{ ...row, id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'approved-booking',
            venue_id: id,
            event_name: 'Ordinary approved booking',
            start_at: new Date('2030-10-08T01:00:00Z'),
            end_at: new Date('2030-10-08T02:00:00Z'),
            status: 'approved',
            request_kind: 'booking',
            hold_expires_at: null,
            current: false,
            affected: false,
          },
          {
            id: 'approved-active-hold',
            venue_id: id,
            event_name: 'Approved active hold',
            start_at: new Date('2030-10-08T03:00:00Z'),
            end_at: new Date('2030-10-08T04:00:00Z'),
            status: 'approved',
            request_kind: 'tentative_hold',
            hold_expires_at: new Date('2030-10-22T00:30:00Z'),
            current: true,
            affected: false,
          },
          {
            id: 'approved-null-expiry-hold',
            venue_id: id,
            event_name: 'Approved hold missing expiry',
            start_at: new Date('2030-10-08T05:00:00Z'),
            end_at: new Date('2030-10-08T06:00:00Z'),
            status: 'approved',
            request_kind: 'tentative_hold',
            hold_expires_at: null,
            current: false,
            affected: false,
          },
        ],
      });
    const repository = new VenuesRepository(
      { query: readQuery } as unknown as DatabaseService,
      { now: () => now },
    );

    const [record] = await repository.list();

    expect(record.availabilityStatus).toBe('unavailable');
    expect(record.reservations).toEqual([
      {
        id: 'approved-booking',
        eventName: 'Ordinary approved booking',
        start: '2030-10-08T01:00:00.000Z',
        end: '2030-10-08T02:00:00.000Z',
        status: 'booked',
        affectedByUnavailablePeriod: false,
      },
      {
        id: 'approved-active-hold',
        eventName: 'Approved active hold',
        start: '2030-10-08T03:00:00.000Z',
        end: '2030-10-08T04:00:00.000Z',
        status: 'tentative',
        holdExpiresAt: '2030-10-22T00:30:00.000Z',
        affectedByUnavailablePeriod: false,
      },
      {
        id: 'approved-null-expiry-hold',
        eventName: 'Approved hold missing expiry',
        start: '2030-10-08T05:00:00.000Z',
        end: '2030-10-08T06:00:00.000Z',
        status: 'tentative',
        affectedByUnavailablePeriod: false,
      },
    ]);
    const scheduleSql = String(readQuery.mock.calls[2][0]).replace(/\s+/g, ' ');
    expect(scheduleSql).toContain(
      "(b.status = 'approved' AND (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > $2::timestamptz))",
    );
    expect(readQuery.mock.calls[2][1]).toEqual([[id], now]);
  });

  // SPM-124: a readable venue detail is not restricted merely because the reader also owns venues.
  it('gets one shared-catalogue record or undefined when SQL finds none', async () => {
    readQuery
      .mockResolvedValueOnce({ rows: [{ ...row, id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({
      query: readQuery,
    } as unknown as DatabaseService);

    const record = await repository.get(id);
    const missing = await repository.get(
      '00000000-0000-4000-8000-000000000999',
    );

    expect(record).toEqual({
      ...venue,
      ownerId: owner,
      id,
      availabilityStatus: 'available',
      unavailablePeriods: [],
      reservations: [],
    });
    expect(missing).toBeUndefined();
    expect(readQuery.mock.calls[0][0]).toContain('v.id = $1::uuid');
    expect(readQuery.mock.calls[0][0]).toContain('v.owner_user_id');
    expect(readQuery.mock.calls[0][1]).toEqual([id]);
  });



  /** SPM-122: an unavailable period cannot be recorded for a venue that disappeared. */
  it('returns undefined when the venue lock finds no venue', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new VenuesRepository({
      transaction: (work: (client: unknown) => Promise<unknown>) =>
        work({ query }),
    } as unknown as DatabaseService);

    await expect(
      repository.markUnavailable(venue.id, {
        start: new Date('2030-01-12T04:00:00Z'),
        end: new Date('2030-01-12T05:00:00Z'),
        reason: 'Maintenance',
      }, '00000000-0000-4000-8000-0000000000aa'),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
  });

  /** VEN-AVL-09-A: blockouts persist while affected confirmed bookings and active holds remain visible. The venue-staff fixture authority that creates the blockout is the second AC9 case. */
  it('returns each affected booking without changing its stored booking status', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: venue.id }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'blockout-1',
            start_at: new Date('2030-01-12T04:00:00Z'),
            end_at: new Date('2030-01-12T05:00:00Z'),
            reason: 'Maintenance',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'booking-1',
            event_id: 'event-1',
            venue_id: venue.id,
            event_name: 'Confirmed event',
            start_at: new Date('2030-01-12T04:10:00Z'),
            end_at: new Date('2030-01-12T04:50:00Z'),
            status: 'approved',
          },
          {
            id: 'hold-1',
            event_id: 'event-2',
            venue_id: venue.id,
            event_name: 'Active hold',
            start_at: new Date('2030-01-12T04:15:00Z'),
            end_at: new Date('2030-01-12T04:45:00Z'),
            status: 'pending',
            hold_expires_at: new Date('2030-01-13T00:00:00Z'),
          },
          {
            id: 'hold-null-expiry',
            event_id: 'event-4',
            venue_id: venue.id,
            event_name: 'Approved hold missing expiry',
            start_at: new Date('2030-01-12T04:15:00Z'),
            end_at: new Date('2030-01-12T04:45:00Z'),
            status: 'approved',
            request_kind: 'tentative_hold',
            hold_expires_at: null,
          },
          {
            id: 'request-1',
            event_id: 'event-3',
            venue_id: venue.id,
            event_name: 'Pending request without hold expiry',
            start_at: new Date('2030-01-12T04:15:00Z'),
            end_at: new Date('2030-01-12T04:45:00Z'),
            status: 'pending',
            hold_expires_at: null,
          },
        ],
      });
    const transaction = (work: (client: unknown) => Promise<unknown>) =>
      work({ query });
    const now = new Date('2030-01-01T00:00:00Z');
    const repository = new VenuesRepository(
      { transaction } as unknown as DatabaseService,
      { now: () => now },
    );

    const result = await repository.markUnavailable(venue.id, {
      start: new Date('2030-01-12T04:00:00Z'),
      end: new Date('2030-01-12T05:00:00Z'),
      reason: 'Maintenance',
    }, '00000000-0000-4000-8000-0000000000aa');

    expect(result).toMatchObject({
      period: { id: 'blockout-1', reason: 'Maintenance' },
      affectedBookings: [
        {
          id: 'booking-1',
          status: 'booked',
          affectedByUnavailablePeriod: true,
        },
        {
          id: 'hold-1',
          status: 'tentative',
          holdExpiresAt: '2030-01-13T00:00:00.000Z',
          affectedByUnavailablePeriod: true,
        },
        {
          id: 'hold-null-expiry',
          status: 'tentative',
          affectedByUnavailablePeriod: true,
        },
      ],
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0].replace(/\s+/g, ' ')).toContain(
      "((b.status = 'approved' AND b.request_kind <> 'tentative_hold') OR (b.status = 'approved' AND b.request_kind = 'tentative_hold' AND (b.hold_expires_at IS NULL OR b.hold_expires_at > $3::timestamptz)) OR (b.status = 'pending' AND b.hold_expires_at > $3::timestamptz))",
    );
    expect(result?.affectedBookings).toContainEqual(
      expect.objectContaining({ id: 'hold-null-expiry', status: 'tentative' }),
    );
    expect(query.mock.calls[2][1]).toEqual([
      venue.id,
      new Date('2030-01-12T05:00:00Z'),
      now,
      new Date('2030-01-12T04:00:00Z'),
    ]);
  });

  /**
   * SPM-159: an approved tentative hold is not a confirmed booking. Active it is reported tentative with its expiry;
   * expired (or at the exact expiry instant) it is not affected; an ordinary approved booking stays booked.
   */
  it('VEN-HOLD-04-SUP-BLOCKOUT reports an active approved hold as tentative and omits expired approved holds from affected bookings', async () => {
    const now = new Date('2030-01-01T00:00:00Z');
    const base = {
      event_id: 'event-1',
      venue_id: venue.id,
      start_at: new Date('2030-01-12T04:10:00Z'),
      end_at: new Date('2030-01-12T04:50:00Z'),
      status: 'approved',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: venue.id }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'blockout-1', start_at: new Date('2030-01-12T04:00:00Z'), end_at: new Date('2030-01-12T05:00:00Z'), reason: 'Maintenance' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { ...base, id: 'standard', event_name: 'Standard', request_kind: 'booking', hold_expires_at: null },
          { ...base, id: 'active-hold', event_name: 'Active hold', request_kind: 'tentative_hold', hold_expires_at: new Date('2030-01-02T00:00:00Z') },
          { ...base, id: 'expired-hold', event_name: 'Expired hold', request_kind: 'tentative_hold', hold_expires_at: new Date('2029-12-31T00:00:00Z') },
          { ...base, id: 'exact-expiry', event_name: 'Exact expiry', request_kind: 'tentative_hold', hold_expires_at: now },
        ],
      });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => now },
    );

    const result = await repository.markUnavailable(venue.id, {
      start: new Date('2030-01-12T04:00:00Z'),
      end: new Date('2030-01-12T05:00:00Z'),
      reason: 'Maintenance',
    }, '00000000-0000-4000-8000-0000000000aa');

    expect(result?.affectedBookings.map((b) => [b.id, b.status])).toEqual([
      ['standard', 'booked'],
      ['active-hold', 'tentative'],
    ]);
    expect(result?.affectedBookings[1]).toMatchObject({ holdExpiresAt: '2030-01-02T00:00:00.000Z' });
  });

  /** SPM-122: ending a blockout shortens only that active period at server time. */
  it('ends one active period and returns undefined when no active period matches', async () => {
    const now = new Date('2030-01-12T04:30:00Z');
    const row = {
      id: 'period-1',
      start_at: new Date('2030-01-12T04:00:00Z'),
      end_at: now,
      reason: 'Maintenance',
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository(
      { query } as unknown as DatabaseService,
      { now: () => now },
    );

    await expect(repository.endUnavailable(venue.id, row.id, ownerUserId)).resolves.toEqual({
      id: row.id,
      start: row.start_at.toISOString(),
      end: now.toISOString(),
      reason: 'Maintenance',
    });
    await expect(
      repository.endUnavailable(venue.id, 'missing', ownerUserId),
    ).resolves.toBeUndefined();
    // Changed by SPM-125 AC1: the same statement records the early end with the Venue Staff member.
    expect(query.mock.calls[0][1]).toEqual([venue.id, row.id, now, ownerUserId]);
    expect(query.mock.calls[1][1]).toEqual([venue.id, 'missing', now, ownerUserId]);
  });

  // SPM-148 R1/R4 (PLAN-STATUS-01-A/B, 02-A). Unit-level evidence for the transition: the
  // status UPDATE and the history row are written only for an Approved event whose
  // compare-and-set moves a row. Routed by SQL text, like the tests above.
  describe('SPM-148 booking transition', () => {
    const eventId = '00000000-0000-4000-8000-000000000148';
    const now = new Date('2026-10-15T04:00:00.000Z');
    const input = {
      eventId,
      start: '2026-11-04T10:00:00.000Z',
      end: '2026-11-04T11:00:00.000Z',
    };

    /** A client whose event row has `eventStatus`; the compare-and-set UPDATE moves `casRows` rows. */
    function clientFor(eventStatus: string, casRows: number) {
      const queries: string[] = [];
      const parameters: unknown[][] = [];
      const query = vi.fn(async (sql: string, values: unknown[] = []) => {
        queries.push(sql);
        parameters.push(values);
        if (sql.includes('FROM venues v WHERE v.id'))
          return {
            rows: [
              {
                id: venue.id,
                capacity: 120,
                facilities: ['AV System', 'Wi-Fi'],
                accessibility: ['Wheelchair access'],
                layouts: ['Classroom', 'Theatre'],
                setup_time_minutes: 0,
                turnaround_time_minutes: 0,
              },
            ],
          };
        if (sql.includes('FROM events WHERE id'))
          return {
            rows: [
              {
                id: eventId,
                status: eventStatus,
                expected_attendance: 20,
                required_facilities: [],
                accessibility_needs: [],
                preferred_room_layout: '',
              },
            ],
          };
        if (sql.includes('SELECT reason FROM')) return { rows: [] };
        if (sql.includes('INSERT INTO venue_bookings'))
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000999',
                start_at: new Date(input.start),
                end_at: new Date(input.end),
              },
            ],
          };
        if (sql.includes('UPDATE events SET status'))
          return { rows: [], rowCount: casRows };
        return { rows: [], rowCount: 0 };
      });
      const repository = new VenuesRepository(
        {
          transaction: (work: (c: unknown) => Promise<unknown>) =>
            work({ query }),
        } as unknown as DatabaseService,
        { now: () => now },
      );
      const find = (fragment: string) =>
        queries.findIndex((sql) => sql.includes(fragment));
      return { repository, parameters, queries, find };
    }

    // Kills: M1 (no status guard), M7 (history written on every request), M10 (DB clock instead of injected clock).
    it('PLAN-STATUS-01-A: an Approved event moves to Planning and gets one history row stamped with the injected clock', async () => {
      const { repository, parameters, find } = clientFor('Approved', 1);

      const result = await repository.submitBookingRequest(
        venue.id,
        ownerUserId,
        input,
      );

      expect(result).toMatchObject({
        kind: 'created',
        eventStatus: 'Planning',
        statusChanged: true,
      });
      expect(find('UPDATE events SET status')).toBeGreaterThan(-1);
      const history = parameters[find('INSERT INTO event_status_history')];
      expect(history).toEqual([expect.any(String), eventId, ownerUserId, now]);
    });

    // Kills: M2 (transition also fires from Confirmed).
    it('PLAN-STATUS-01-B: a Confirmed event keeps its status, with no UPDATE and no history row', async () => {
      const { repository, find } = clientFor('Confirmed', 0);

      const result = await repository.submitBookingRequest(
        venue.id,
        ownerUserId,
        input,
      );

      expect(result).toMatchObject({
        kind: 'created',
        eventStatus: 'Confirmed',
        statusChanged: false,
      });
      expect(find('UPDATE events SET status')).toBe(-1);
      expect(find('INSERT INTO event_status_history')).toBe(-1);
    });

    // Kills: M6 (no compare-and-set: a lost race still writes history).
    it('PLAN-STATUS-02-E: a lost compare-and-set reports no transition and writes no history row', async () => {
      const { repository, find } = clientFor('Approved', 0);

      const result = await repository.submitBookingRequest(
        venue.id,
        ownerUserId,
        input,
      );

      expect(result).toMatchObject({
        kind: 'created',
        eventStatus: 'Approved',
        statusChanged: false,
      });
      expect(find('INSERT INTO event_status_history')).toBe(-1);
    });

    // Kills: M22/M1 variants that let a Submitted event book or transition.
    it('PLAN-STATUS-01-B: a Submitted event is refused with no booking, UPDATE or history row', async () => {
      const { repository, find } = clientFor('Submitted', 0);

      const result = await repository.submitBookingRequest(
        venue.id,
        ownerUserId,
        input,
      );

      expect(result).toEqual({ kind: 'event-not-open', status: 'Submitted' });
      expect(find('INSERT INTO venue_bookings')).toBe(-1);
      expect(find('UPDATE events SET status')).toBe(-1);
      expect(find('INSERT INTO event_status_history')).toBe(-1);
    });
  });
});

describe('SPM-55 venue booking review repository', () => {
  const staffId = ownerUserId;
  const bookingId = '6f0d6f3a-2c1e-4b59-9d8a-0c3b7e1f2a44';
  const pendingRow = {
    id: bookingId,
    event_id: 'event-1',
    venue_id: venue.id,
    status: 'pending',
    start_at: new Date('2030-01-12T04:00:00.000Z'),
    end_at: new Date('2030-01-12T05:00:00.000Z'),
    rejection_reason: null,
  };
  const ownedRow = { rows: [{ venue_id: venue.id }] };
  const venueLockRow = { rows: [{ id: venue.id, setup_time_minutes: 30, turnaround_time_minutes: 45 }] };
  const bookingLockRow = { rows: [pendingRow] };
  const noConflict = { rows: [] };
  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ');

  /** Builds a repository whose queries answer from the given sequence, in the order the transaction issues them. */
  function createReviewRepository(...responses: Array<{ rows: unknown[] }>) {
    const query = vi.fn();
    for (const response of responses) query.mockResolvedValueOnce(response);
    query.mockResolvedValue({ rows: [] });
    const database = {
      query,
      transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }),
    };
    return {
      repository: new VenuesRepository(
        database as unknown as DatabaseService,
        { now: () => new Date('2030-01-10T12:00:00.000Z') },
      ),
      query,
    };
  }

  /**
   * Like createReviewRepository, but the transaction client gets its own query spy, separate from the pool's.
   * A test can then tell whether a statement ran inside the transaction (clientQuery) or on the pool (poolQuery).
   */
  function createSplitReviewRepository(...responses: Array<{ rows: unknown[] }>) {
    const clientQuery = vi.fn();
    for (const response of responses) clientQuery.mockResolvedValueOnce(response);
    clientQuery.mockResolvedValue({ rows: [] });
    const poolQuery = vi.fn().mockResolvedValue({ rows: [] });
    const database = {
      query: poolQuery,
      transaction: (work: (client: unknown) => Promise<unknown>) => work({ query: clientQuery }),
    };
    return {
      repository: new VenuesRepository(
        database as unknown as DatabaseService,
        { now: () => new Date('2030-01-10T12:00:00.000Z') },
      ),
      clientQuery,
      poolQuery,
    };
  }

  /**
   * Models DatabaseService.transaction: BEGIN, the work, COMMIT on success, and ROLLBACK then rethrow on failure.
   * A queued Error is thrown by that statement, so a test can make one step of the transaction fail.
   * BEGIN, COMMIT, and ROLLBACK do not consume queued responses.
   */
  function createRollbackReviewRepository(...steps: Array<{ rows: unknown[] } | Error>) {
    const queue = [...steps];
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      const next = queue.shift() ?? { rows: [] };
      if (next instanceof Error) throw next;
      return next;
    });
    const client = { query: clientQuery };
    const poolQuery = vi.fn().mockResolvedValue({ rows: [] });
    const database = {
      query: poolQuery,
      transaction: async (work: (tx: unknown) => Promise<unknown>) => {
        await client.query('BEGIN');
        try {
          const result = await work(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      },
    };
    return {
      repository: new VenuesRepository(database as unknown as DatabaseService),
      clientQuery,
      poolQuery,
    };
  }

  /** VEN-REV-01-A: the staff list covers pending, approved, and rejected requests for owned venues, soonest booking slot first, and maps request kind and expiry. */
  it('SPM-55 AC1 lists pending/approved/rejected requests for owned venues ordered by booking start', async () => {
    const { repository, query } = createReviewRepository({
      rows: [
        {
          id: bookingId,
          event_id: 'event-1',
          event_name: 'Gala',
          event_start: new Date('2030-01-12T03:00:00.000Z'),
          event_end: new Date('2030-01-12T06:00:00.000Z'),
          coordinator_name: 'Coordinator One',
          venue_name: 'Orchid Hall Test',
          booking_reference: 'VB-6F0D6F3A',
          special_request: 'Microphones',
          request_kind: 'tentative_hold' as const,
          hold_expires_at: null,
          start_at: pendingRow.start_at,
          end_at: pendingRow.end_at,
          status: 'pending' as const,
          rejection_reason: null,
        },
        {
          id: 'booking-2',
          event_id: 'event-2',
          event_name: 'Workshop',
          event_start: new Date('2030-01-13T03:00:00.000Z'),
          event_end: new Date('2030-01-13T06:00:00.000Z'),
          coordinator_name: 'Coordinator Two',
          venue_name: 'Orchid Hall Test',
          booking_reference: 'VB-BOOKING2',
          special_request: null,
          request_kind: 'booking' as const,
          hold_expires_at: null,
          start_at: new Date('2030-01-13T04:00:00.000Z'),
          end_at: new Date('2030-01-13T05:00:00.000Z'),
          status: 'rejected' as const,
          rejection_reason: 'Clashes with maintenance',
        },
      ],
    });

    await expect(repository.listPendingVenueBookings(staffId)).resolves.toEqual([
      {
        id: bookingId,
        eventId: 'event-1',
        eventName: 'Gala',
        eventStart: '2030-01-12T03:00:00.000Z',
        eventEnd: '2030-01-12T06:00:00.000Z',
        coordinatorName: 'Coordinator One',
        venueName: 'Orchid Hall Test',
        bookingReference: 'VB-6F0D6F3A',
        specialRequest: 'Microphones',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
        status: 'pending',
        requestKind: 'tentative_hold',
        holdExpiresAt: undefined,
        holdExpired: false,
        rejectionReason: undefined,
      },
      {
        id: 'booking-2',
        eventId: 'event-2',
        eventName: 'Workshop',
        eventStart: '2030-01-13T03:00:00.000Z',
        eventEnd: '2030-01-13T06:00:00.000Z',
        coordinatorName: 'Coordinator Two',
        venueName: 'Orchid Hall Test',
        bookingReference: 'VB-BOOKING2',
        specialRequest: undefined,
        start: '2030-01-13T04:00:00.000Z',
        end: '2030-01-13T05:00:00.000Z',
        status: 'rejected',
        requestKind: 'booking',
        holdExpiresAt: undefined,
        holdExpired: false,
        rejectionReason: 'Clashes with maintenance',
      },
    ]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    // The whole staff-list statement: its FROM/JOIN block, the owner filter with pending/approved/rejected statuses, and the ordering.
    expect(normalizeSql(sql).trim()).toBe(
      "SELECT b.id, b.event_id, e.event_name, e.start_date_time AS event_start, e.end_date_time AS event_end, coordinator_user.display_name AS coordinator_name, v.name AS venue_name, 'VB-' || upper(substr(replace(b.id::text, '-', ''), 1, 8)) AS booking_reference, b.special_request, b.start_at, b.end_at, b.status, b.rejection_reason, b.request_kind, b.hold_expires_at, b.reassessment_required FROM venue_bookings b JOIN venues v ON v.id = b.venue_id JOIN events e ON e.id = b.event_id JOIN users coordinator_user ON coordinator_user.id::text = e.coordinator_id WHERE v.owner_user_id::text = $1::text AND b.status IN ('pending', 'approved', 'rejected', 'expired') ORDER BY b.start_at ASC, b.id",
    );
    expect(params).toEqual([staffId]);
  });

  /** VEN-REV-02-A SPM-55 AC2 AC5: approval confirms a pending booking, checks blockouts and approved overlaps, and records the audit row. */
  it('SPM-55 AC2 AC5 approves a pending request and writes the audit row with the actor', async () => {
    const { repository, clientQuery, poolQuery } = createSplitReviewRepository(
      ownedRow,
      venueLockRow,
      bookingLockRow,
      noConflict,
      { rows: [{ ...pendingRow, status: 'approved', request_kind: 'booking', hold_expires_at: null }] },
      { rows: [] },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toEqual({
      kind: 'decided',
      booking: {
        id: bookingId,
        eventId: 'event-1',
        venueId: venue.id,
        status: 'approved',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
        rejectionReason: undefined,
        bookingReference: 'VB-6F0D6F3A',
        requestKind: 'booking',
        holdExpiresAt: undefined,
      },
    });
    // Every statement of the approval runs on the transaction client; the pool spy must see none of them.
    expect(poolQuery).not.toHaveBeenCalled();
    const calls = clientQuery.mock.calls as Array<[string, unknown[]]>;
    // Six statements of the SPM-55 approval, then the SPM-137 notification lookup (no row in this fixture, so no insert; VENUE-BOOK-NOTIF-01-A has the insert).
    expect(calls).toHaveLength(7);
    // Ownership lookup: the booking id comes first, then the staff id, and the lookup is scoped to the owner.
    expect(calls[0][0]).toContain('v.owner_user_id::text = $2::text');
    // The whole ownership lookup, so its JOIN and WHERE clauses cannot change independently.
    expect(normalizeSql(calls[0][0]).trim()).toBe(
      'SELECT b.venue_id FROM venue_bookings b JOIN venues v ON v.id = b.venue_id WHERE b.id = $1::uuid AND v.owner_user_id::text = $2::text',
    );
    expect(calls[0][1]).toEqual([bookingId, staffId]);
    // Venue row lock, then booking row lock, both FOR UPDATE on the transaction client.
    expect(normalizeSql(calls[1][0])).toBe(
      'SELECT setup_time_minutes, turnaround_time_minutes FROM venues WHERE id = $1::uuid FOR UPDATE',
    );
    expect(calls[1][1]).toEqual([venue.id]);
    expect(normalizeSql(calls[2][0])).toBe(
      'SELECT b.id, b.event_id, b.venue_id, b.status, b.start_at, b.end_at, b.rejection_reason, b.request_kind, b.hold_expires_at, b.reassessment_required, e.start_date_time AS event_start, e.status AS event_status FROM venue_bookings b LEFT JOIN events e ON e.id = b.event_id WHERE b.id = $1::uuid FOR UPDATE OF b',
    );
    expect(calls[2][1]).toEqual([bookingId]);
    expect(calls[3][1]).toEqual([
      venue.id,
      pendingRow.start_at,
      pendingRow.end_at,
      30,
      45,
      bookingId,
      new Date('2030-01-10T12:00:00.000Z'),
    ]);
    // The approval UPDATE targets exactly the one booking id, not a broader set.
    expect(normalizeSql(calls[4][0])).toContain(
      "UPDATE venue_bookings SET status = 'approved', reassessment_required = false, hold_expires_at = CASE WHEN request_kind = 'tentative_hold' THEN $2::timestamptz ELSE hold_expires_at END WHERE id = $1::uuid RETURNING",
    );
    expect(normalizeSql(calls[4][0])).toContain('request_kind, hold_expires_at');
    expect(calls[4][1]).toEqual([
      bookingId,
      new Date('2030-01-24T12:00:00.000Z'),
    ]);
    expect(normalizeSql(calls[5][0])).toContain(
      "INSERT INTO booking_review_log (booking_id, actor_user_id, action) VALUES ($1::uuid, $2::uuid, 'approved')",
    );
    expect(calls[5][1]).toEqual([bookingId, staffId]);
  });

  /** VEN-HOLD-04-A: a tentative hold's expiry is exactly 14 days after the injected approval time. */
  it('VEN-HOLD-04-A computes expiry from the approval clock for a tentative hold', async () => {
    const holdRow = {
      ...pendingRow,
      request_kind: 'tentative_hold' as const,
      event_start: new Date('2030-02-01T00:00:00.000Z'),
    };
    const { repository, clientQuery } = createSplitReviewRepository(
      ownedRow,
      venueLockRow,
      { rows: [holdRow] },
      noConflict,
      { rows: [{ ...holdRow, status: 'approved' }] },
      { rows: [] },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({
      kind: 'decided',
      booking: { status: 'approved' },
    });

    const update = clientQuery.mock.calls[4] as [string, unknown[]];
    expect(normalizeSql(update[0])).toContain(
      "WHEN request_kind = 'tentative_hold' THEN $2::timestamptz ELSE hold_expires_at",
    );
    expect(update[1]).toEqual([
      bookingId,
      new Date('2030-01-24T12:00:00.000Z'),
    ]);
  });

  /** VEN-REV-05-A: an approval writes exactly one audit row that names the approving staff member and the approved action. */
  it('SPM-55 AC5 records one approval audit row naming the actor', async () => {
    const { repository, query } = createReviewRepository(
      ownedRow,
      venueLockRow,
      bookingLockRow,
      noConflict,
      { rows: [{ ...pendingRow, status: 'approved' }] },
      { rows: [] },
    );

    await repository.approveVenueBooking(staffId, bookingId);

    const audits = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO booking_review_log'));
    expect(audits).toHaveLength(1);
    expect(normalizeSql(String(audits[0][0]))).toContain(
      "INSERT INTO booking_review_log (booking_id, actor_user_id, action) VALUES ($1::uuid, $2::uuid, 'approved')",
    );
    expect(audits[0][1]).toEqual([bookingId, staffId]);
  });

  /** VEN-CONF-01-A, VEN-CONF-03-A, VEN-CONF-06-A/C: approval reports every confirmed booking overlap with its complete setup/event/turnaround interval. */
  it('VEN-CONF-01-A VEN-CONF-03-A VEN-CONF-06-A VEN-CONF-06-C SPM-56 returns all overlapping occupied booking intervals', async () => {
    const { repository, query } = createReviewRepository(
      ownedRow,
      venueLockRow,
      bookingLockRow,
      {
        rows: [
          {
            id: 'approved-1', reason: 'Lecture Series', kind: 'booking',
            start_at: new Date('2030-01-12T03:20:00.000Z'),
            end_at: new Date('2030-01-12T04:00:00.000Z'),
            occupied_start: new Date('2030-01-12T02:50:00.000Z'),
            occupied_end: new Date('2030-01-12T04:45:00.000Z'),
            status: 'approved', request_kind: 'booking', hold_expires_at: null,
          },
          {
            id: 'hold-1', reason: 'Tentative Event', kind: 'booking',
            start_at: new Date('2030-01-12T04:45:00.000Z'),
            end_at: new Date('2030-01-12T05:45:00.000Z'),
            occupied_start: new Date('2030-01-12T04:15:00.000Z'),
            occupied_end: new Date('2030-01-12T06:30:00.000Z'),
            status: 'pending', request_kind: 'tentative_hold',
            hold_expires_at: new Date('2030-01-12T03:00:00.000Z'),
          },
        ],
      },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toEqual({
      kind: 'conflict',
      reason: 'Lecture Series',
      conflicts: [
        {
          id: 'approved-1', reason: 'Lecture Series', kind: 'booking',
          start: '2030-01-12T03:20:00.000Z', end: '2030-01-12T04:00:00.000Z',
          occupiedStart: '2030-01-12T02:50:00.000Z', occupiedEnd: '2030-01-12T04:45:00.000Z',
          status: 'approved', requestKind: 'booking',
        },
        {
          id: 'hold-1', reason: 'Tentative Event', kind: 'booking',
          start: '2030-01-12T04:45:00.000Z', end: '2030-01-12T05:45:00.000Z',
          occupiedStart: '2030-01-12T04:15:00.000Z', occupiedEnd: '2030-01-12T06:30:00.000Z',
          status: 'pending', requestKind: 'tentative_hold',
          holdExpiresAt: '2030-01-12T03:00:00.000Z',
        },
      ],
    });
    expect(query).toHaveBeenCalledTimes(4);
    const [sql, params] = query.mock.calls[3] as [string, unknown[]];
    const normalized = normalizeSql(sql);
    // Blockouts: setup pads the requested start and turnaround pads its end; both comparisons are strict.
    expect(normalized).toContain("status = 'blocked'");
    // The whole blockout WHERE clause: a prepended or dropped predicate changes this exact fragment.
    expect(normalized).toContain(
      "FROM venue_bookings WHERE venue_id = $1::uuid AND status = 'blocked' AND start_at < $3::timestamptz + make_interval(mins => $5::int) AND end_at > $2::timestamptz - make_interval(mins => $4::int)",
    );
    expect(normalized).toContain("start_at < $3::timestamptz + make_interval(mins => $5::int)");
    expect(normalized).toContain("end_at > $2::timestamptz - make_interval(mins => $4::int)");
    // Approved bookings: setup pads the existing booking's start and turnaround its end; both comparisons are strict.
    // The approved-booking branch is scoped to the venue being decided, with self-exclusion and active-hold check.
    expect(normalized).toContain("WHERE b.venue_id = $1::uuid AND b.id <> $6::uuid AND ((b.status = 'approved' AND (b.request_kind <> 'tentative_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > $7::timestamptz)) OR (b.status = 'pending' AND (b.hold_expires_at > $7::timestamptz OR (b.request_kind <> 'tentative_hold' AND EXISTS ( SELECT 1 FROM venue_booking_requests r WHERE r.event_id = b.event_id AND r.venue_id = b.venue_id )))))");
    expect(normalized).toContain(
      "b.start_at - make_interval(mins => $4::int) < $3::timestamptz + make_interval(mins => $5::int)",
    );
    expect(normalized).toContain(
      "b.end_at + make_interval(mins => $5::int) > $2::timestamptz - make_interval(mins => $4::int)",
    );
    expect(normalized).toContain('ORDER BY occupied_start, occupied_end, id');
    expect(normalized).not.toMatch(/<=|>=/);
    // The booking being approved is excluded from its own conflict check, and setup/turnaround keep their order.
    // The seventh parameter is the injected clock, so hold expiry is judged at the approval instant, not at SQL now().
    expect(params).toEqual([venue.id, pendingRow.start_at, pendingRow.end_at, 30, 45, bookingId, new Date('2030-01-10T12:00:00.000Z')]);
  });

  /** VEN-HOLD-13-B: a reassessed hold whose setup-adjusted start is inside 336 hours remains Pending. */
  it('VEN-HOLD-13-B refuses approval after setup reassessment makes the 336-hour lead too short', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(ownedRow)
      .mockResolvedValueOnce({ rows: [{ setup_time_minutes: 180, turnaround_time_minutes: 30 }] })
      .mockResolvedValueOnce({ rows: [{
        ...pendingRow,
        request_kind: 'tentative_hold',
        reassessment_required: true,
        event_start: new Date('2030-01-24T14:00:00.000Z'),
      }] });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'conflict' });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'approved'"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('booking_review_log'))).toBe(false);
  });

  /**
   * SPM-159 (Venue Staff recheck eligibility on every hold approval): a hold submitted outside 336 hours that is
   * decided after the clock has moved inside the minimum is refused with the lead-time reason, whether or not a
   * venue setup change flagged it. The approval clock is 2030-01-10T12:00Z and setup is 180 minutes.
   */
  it('VEN-HOLD-03-SUP-RECHECK refuses an unflagged hold approval once the event is inside the 336-hour lead time', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(ownedRow)
      .mockResolvedValueOnce({ rows: [{ setup_time_minutes: 180, turnaround_time_minutes: 30 }] })
      .mockResolvedValueOnce({ rows: [{
        ...pendingRow,
        request_kind: 'tentative_hold',
        reassessment_required: false,
        // Occupied start 2030-01-24T11:59Z is 335h59m after the approval clock.
        event_start: new Date('2030-01-24T14:59:00.000Z'),
      }] });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toEqual({
      kind: 'conflict',
      reason: 'The event is now inside the 336-hour lead-time minimum for a tentative hold.',
      conflicts: [],
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'approved'"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('booking_review_log'))).toBe(false);
  });

  /** SPM-159: a hold with no persisted event start fails the unconditional lead-time recheck closed. */
  it('VEN-HOLD-03-SUP-RECHECK refuses an unflagged hold approval when the event start is missing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(ownedRow)
      .mockResolvedValueOnce({ rows: [{ setup_time_minutes: 180, turnaround_time_minutes: 30 }] })
      .mockResolvedValueOnce({ rows: [{ ...pendingRow, request_kind: 'tentative_hold', reassessment_required: false, event_start: null }] });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'conflict' });
    expect(query).toHaveBeenCalledTimes(3);
  });

  /** SPM-159 positive case: submitted and approved outside 336 hours (exactly at the minimum), the hold is approved. */
  it('VEN-HOLD-03-SUP-RECHECK approves an unflagged hold that is still exactly 336 hours out', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(ownedRow)
      .mockResolvedValueOnce({ rows: [{ setup_time_minutes: 180, turnaround_time_minutes: 30 }] })
      .mockResolvedValueOnce({ rows: [{
        ...pendingRow,
        request_kind: 'tentative_hold',
        reassessment_required: false,
        event_start: new Date('2030-01-24T15:00:00.000Z'),
      }] })
      .mockResolvedValueOnce(noConflict)
      .mockResolvedValueOnce({ rows: [{ ...pendingRow, status: 'approved', request_kind: 'tentative_hold' }] })
      .mockResolvedValueOnce({ rows: [] })
      // SPM-165: the hold approval now also looks up its notification recipient (no row here, so no insert).
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'decided' });
    expect(query).toHaveBeenCalledTimes(7);
  });

  /** SPM-159: the lead-time recheck is for holds only; an ordinary booking close to its event is still approvable. */
  it('VEN-HOLD-03-SUP-RECHECK does not apply the hold lead-time recheck to an ordinary booking approval', async () => {
    const { repository, query } = createReviewRepository(
      ownedRow,
      venueLockRow,
      { rows: [{ ...pendingRow, request_kind: 'booking', event_start: new Date('2030-01-11T00:00:00.000Z') }] },
      noConflict,
      { rows: [{ ...pendingRow, status: 'approved', request_kind: 'booking' }] },
      { rows: [] },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'decided' });
    // The six SPM-55 statements plus the SPM-137 notification lookup (it finds no row here, so no insert follows).
    expect(query).toHaveBeenCalledTimes(7);
  });

  /** VEN-HOLD-13-B: a reassessed hold with no persisted event start fails closed and stays Pending. */
  it('VEN-HOLD-13-B refuses reassessed approval when the event start is missing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(ownedRow)
      .mockResolvedValueOnce({ rows: [{ setup_time_minutes: 180, turnaround_time_minutes: 30 }] })
      .mockResolvedValueOnce({ rows: [{
        ...pendingRow,
        request_kind: 'tentative_hold',
        reassessment_required: true,
        event_start: null,
      }] });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'conflict' });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'approved'"))).toBe(false);
  });

  /** VEN-HOLD-13-B: a reassessed hold still at the 336-hour threshold remains eligible for staff approval. */
  it('VEN-HOLD-13-B permits approval when reassessment preserves the exact minimum lead', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(ownedRow)
      .mockResolvedValueOnce({ rows: [{ setup_time_minutes: 180, turnaround_time_minutes: 30 }] })
      .mockResolvedValueOnce({ rows: [{
        ...pendingRow,
        request_kind: 'tentative_hold',
        reassessment_required: true,
        event_start: new Date('2030-01-24T15:00:00.000Z'),
      }] })
      .mockResolvedValueOnce(noConflict)
      .mockResolvedValueOnce({ rows: [{ ...pendingRow, status: 'approved' }] })
      .mockResolvedValueOnce({ rows: [] })
      // SPM-165: the hold approval now also looks up its notification recipient (no row here, so no insert).
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'decided' });
    expect(query).toHaveBeenCalledTimes(7);
  });

  /** VEN-REV-06-A: a cancelled, approved or rejected request is reported as already decided, with no write. */
  it.each(['cancelled', 'approved', 'rejected', 'released'])('SPM-55 AC6 reports a %s request as already decided without writing', async (status) => {
      const { repository, query } = createReviewRepository(
        ownedRow,
        venueLockRow,
        { rows: [{ ...pendingRow, status }] },
      );

      await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toEqual({
        kind: 'already-decided',
        status,
      });
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  /** VEN-REV-02-C: a booking not owned by the caller, or one whose venue or booking row is missing, is not found. */
  it.each([
    ['not owned or absent', [{ rows: [] }]],
    ['venue row absent', [ownedRow, { rows: [] }]],
    ['booking row absent', [ownedRow, venueLockRow, { rows: [] }]],
  ])('SPM-55 AC2 reports an owned-booking lookup that is %s as not found', async (_label, responses) => {
    const { repository, query } = createReviewRepository(...(responses as Array<{ rows: unknown[] }>));

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toEqual({
      kind: 'not-found',
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO booking_review_log'))).toBe(false);
  });

  /** VEN-REV-03-A: rejection stores the reason on the booking and records the rejection with its reason. */
  it('SPM-55 AC3 AC5 rejects a pending request, storing the reason and an audit row', async () => {
    const rejectedRow = { ...pendingRow, status: 'rejected', rejection_reason: 'Clashes with maintenance' };
    const { repository, clientQuery, poolQuery } = createSplitReviewRepository(
      ownedRow,
      venueLockRow,
      bookingLockRow,
      { rows: [rejectedRow] },
      { rows: [] },
    );

    await expect(
      repository.rejectVenueBooking(staffId, bookingId, 'Clashes with maintenance'),
    ).resolves.toEqual({
      kind: 'decided',
      booking: {
        id: bookingId,
        eventId: 'event-1',
        venueId: venue.id,
        status: 'rejected',
        start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z',
        rejectionReason: 'Clashes with maintenance',
        bookingReference: 'VB-6F0D6F3A',
      },
    });
    // Every statement of the rejection runs on the transaction client; the pool spy must see none of them.
    expect(poolQuery).not.toHaveBeenCalled();
    const calls = clientQuery.mock.calls as Array<[string, unknown[]]>;
    // Five statements of the SPM-55 rejection, then the SPM-137 notification lookup (no row in this fixture, so no insert).
    expect(calls).toHaveLength(6);
    // Ownership lookup: the booking id comes first, then the staff id, and the lookup is scoped to the owner.
    // The whole ownership lookup, so its JOIN and WHERE clauses cannot change independently.
    expect(normalizeSql(calls[0][0]).trim()).toBe(
      'SELECT b.venue_id FROM venue_bookings b JOIN venues v ON v.id = b.venue_id WHERE b.id = $1::uuid AND v.owner_user_id::text = $2::text',
    );
    expect(calls[0][1]).toEqual([bookingId, staffId]);
    // Venue row lock, then booking row lock, both FOR UPDATE on the transaction client.
    expect(normalizeSql(calls[1][0])).toBe(
      'SELECT setup_time_minutes, turnaround_time_minutes FROM venues WHERE id = $1::uuid FOR UPDATE',
    );
    expect(calls[1][1]).toEqual([venue.id]);
    expect(normalizeSql(calls[2][0])).toBe(
      'SELECT b.id, b.event_id, b.venue_id, b.status, b.start_at, b.end_at, b.rejection_reason, b.request_kind, b.hold_expires_at, b.reassessment_required, e.start_date_time AS event_start, e.status AS event_status FROM venue_bookings b LEFT JOIN events e ON e.id = b.event_id WHERE b.id = $1::uuid FOR UPDATE OF b',
    );
    expect(calls[2][1]).toEqual([bookingId]);
    // The rejection UPDATE sets exactly the rejected status and the reason, on exactly the one booking id.
    expect(normalizeSql(calls[3][0])).toContain(
      "UPDATE venue_bookings SET status = 'rejected', rejection_reason = $2 WHERE id = $1::uuid RETURNING",
    );
    expect(calls[3][1]).toEqual([bookingId, 'Clashes with maintenance']);
    expect(normalizeSql(calls[4][0])).toContain(
      "INSERT INTO booking_review_log (booking_id, actor_user_id, action, reason) VALUES ($1::uuid, $2::uuid, 'rejected', $3)",
    );
    expect(calls[4][1]).toEqual([bookingId, staffId, 'Clashes with maintenance']);
  });

  /** VEN-HOLD-DEC-09-A: an active approved hold converts to an ordinary approved booking. */
  it('VEN-HOLD-DEC-09-A converts an active approved tentative hold', async () => {
    const active = { ...pendingRow, status: 'approved', request_kind: 'tentative_hold', hold_expires_at: new Date('2030-01-24T12:00:00.000Z') };
    const { repository, clientQuery, poolQuery } = createSplitReviewRepository(
      ownedRow, venueLockRow, { rows: [active] }, { rows: [{ id: bookingId }] },
    );

    await expect(repository.convertTentativeHold(staffId, bookingId)).resolves.toEqual({
      kind: 'updated', id: bookingId, status: 'approved', requestKind: 'booking',
    });
    expect(normalizeSql(clientQuery.mock.calls[3][0] as string)).toContain("SET request_kind = 'booking', hold_expires_at = NULL");
    expect(poolQuery).not.toHaveBeenCalled();
  });

  /** VEN-HOLD-DEC-09-B: an approved hold at its expiry cannot be converted. */
  it('VEN-HOLD-DEC-09-B refuses conversion at exact expiry without writing', async () => {
    const expired = { ...pendingRow, status: 'approved', request_kind: 'tentative_hold', hold_expires_at: new Date('2030-01-10T12:00:00.000Z') };
    const { repository, clientQuery } = createSplitReviewRepository(ownedRow, venueLockRow, { rows: [expired] });

    await expect(repository.convertTentativeHold(staffId, bookingId)).resolves.toEqual({ kind: 'expired' });
    expect(clientQuery).toHaveBeenCalledTimes(3);
  });

  /** VEN-HOLD-DEC-10-A/13-A: release records the instant and marks only the hold released. */
  it('VEN-HOLD-DEC-10-A releases an active hold and records released_at', async () => {
    const active = { ...pendingRow, status: 'approved', request_kind: 'tentative_hold', hold_expires_at: new Date('2030-01-24T12:00:00.000Z') };
    const { repository, clientQuery } = createSplitReviewRepository(
      ownedRow, venueLockRow, { rows: [active] }, { rows: [{ id: bookingId }] },
    );

    await expect(repository.releaseTentativeHold(staffId, bookingId)).resolves.toEqual({
      kind: 'updated', id: bookingId, status: 'released', requestKind: 'tentative_hold',
    });
    expect(normalizeSql(clientQuery.mock.calls[3][0] as string)).toContain("SET status = 'released', released_at = $2::timestamptz");
    expect(clientQuery.mock.calls[3][1]).toEqual([bookingId, new Date('2030-01-10T12:00:00.000Z')]);
  });

  /** Rows outside an owned, active tentative hold cannot be converted or released. */
  it('VEN-HOLD-DEC-09-A refuses conversion when the booking is not owned', async () => {
    const { repository, clientQuery } = createSplitReviewRepository({ rows: [] });
    await expect(repository.convertTentativeHold(staffId, bookingId)).resolves.toEqual({ kind: 'not-found' });
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  /** VEN-CONF-06-A: a conflicting row that carries no status, request kind or hold expiry reports only its interval fields. */
  it('VEN-CONF-06-A omits status, requestKind and holdExpiresAt from a conflict row that has none', async () => {
    const { repository } = createReviewRepository(
      ownedRow,
      venueLockRow,
      bookingLockRow,
      {
        rows: [{
          id: 'blockout-1', reason: 'Maintenance', kind: 'blockout',
          start_at: new Date('2030-01-12T03:00:00.000Z'), end_at: new Date('2030-01-12T04:00:00.000Z'),
          occupied_start: new Date('2030-01-12T02:30:00.000Z'), occupied_end: new Date('2030-01-12T04:45:00.000Z'),
          status: null, request_kind: null, hold_expires_at: null,
        }],
      },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toEqual({
      kind: 'conflict',
      reason: 'Maintenance',
      conflicts: [{
        id: 'blockout-1', reason: 'Maintenance', kind: 'blockout',
        start: '2030-01-12T03:00:00.000Z', end: '2030-01-12T04:00:00.000Z',
        occupiedStart: '2030-01-12T02:30:00.000Z', occupiedEnd: '2030-01-12T04:45:00.000Z',
      }],
    });
  });

  /** VEN-HOLD-DEC-09-B and 10-B: a hold action is refused, with no write, unless the booking is an active approved hold. */
  it.each([
    ['its event is Completed', { event_status: 'Completed', status: 'approved', request_kind: 'tentative_hold' }, 'event-completed'],
    ['the hold has already been processed as expired', { status: 'expired', request_kind: 'tentative_hold' }, 'expired'],
    ['the request is still pending', { status: 'pending', request_kind: 'tentative_hold' }, 'not-active'],
    ['the booking is an ordinary approved booking', { status: 'approved', request_kind: 'booking' }, 'not-active'],
    ['the hold was already released', { status: 'released', request_kind: 'tentative_hold' }, 'not-active'],
  ])('VEN-HOLD-DEC-09-B refuses convert and release when %s', async (_name, override, kind) => {
    for (const method of ['convertTentativeHold', 'releaseTentativeHold'] as const) {
      const row = { ...pendingRow, hold_expires_at: new Date('2030-01-24T12:00:00.000Z'), ...override };
      const { repository, clientQuery } = createSplitReviewRepository(ownedRow, venueLockRow, { rows: [row] });

      await expect(repository[method](staffId, bookingId)).resolves.toEqual({ kind });
      expect(clientQuery).toHaveBeenCalledTimes(3);
    }
  });

  /** VEN-HOLD-DEC-09-B: an approved hold with no expiry recorded is treated as expired, not as active. */
  it('VEN-HOLD-DEC-09-B treats an approved hold without an expiry as expired', async () => {
    const row = { ...pendingRow, status: 'approved', request_kind: 'tentative_hold', hold_expires_at: null };
    const { repository } = createSplitReviewRepository(ownedRow, venueLockRow, { rows: [row] });

    await expect(repository.releaseTentativeHold(staffId, bookingId)).resolves.toEqual({ kind: 'expired' });
  });

  /**
   * SPM-159: elapsed approved holds are persisted as expired once, using the supplied instant, and their ids are returned.
   * The run is one transaction since SPM-134 (the expired notice is saved with the status change); these rows have no
   * Coordinator, so no notice is written and the UPDATE stays the first query.
   */
  it('SPM-159 processExpiredTentativeHolds expires only elapsed approved holds not yet processed and returns their ids', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'hold-1' }, { id: 'hold-2' }] });
    const transaction = (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query });
    const repository = new VenuesRepository({ query, transaction } as unknown as DatabaseService, { now: () => new Date('2030-01-10T12:00:00.000Z') });
    const instant = new Date('2030-02-01T00:00:00.000Z');

    await expect(repository.processExpiredTentativeHolds(instant)).resolves.toEqual(['hold-1', 'hold-2']);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    const normalized = normalizeSql(sql);
    expect(normalized).toContain("SET status = 'expired', hold_expiry_processed_at = $1::timestamptz");
    expect(normalized).toContain("WHERE request_kind = 'tentative_hold' AND status = 'approved' AND hold_expires_at <= $1::timestamptz AND hold_expiry_processed_at IS NULL");
    expect(params).toEqual([instant]);
  });

  it('SPM-159 processExpiredTentativeHolds defaults to the injected clock and returns an empty list when nothing elapsed', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const transaction = (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query });
    const repository = new VenuesRepository({ query, transaction } as unknown as DatabaseService, { now: () => new Date('2030-01-10T12:00:00.000Z') });

    await expect(repository.processExpiredTentativeHolds()).resolves.toEqual([]);
    expect(query.mock.calls[0][1]).toEqual([new Date('2030-01-10T12:00:00.000Z')]);
  });

  /** VEN-REV-05-A: a rejection writes exactly one audit row that keeps the stored reason and the rejecting staff member. */
  it('SPM-55 AC5 records one rejection audit row carrying the reason', async () => {
    const { repository, query } = createReviewRepository(
      ownedRow,
      venueLockRow,
      bookingLockRow,
      { rows: [{ ...pendingRow, status: 'rejected', rejection_reason: 'Clashes with maintenance' }] },
      { rows: [] },
    );

    await repository.rejectVenueBooking(staffId, bookingId, 'Clashes with maintenance');

    const audits = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO booking_review_log'));
    expect(audits).toHaveLength(1);
    expect(normalizeSql(String(audits[0][0]))).toContain(
      "INSERT INTO booking_review_log (booking_id, actor_user_id, action, reason) VALUES ($1::uuid, $2::uuid, 'rejected', $3)",
    );
    expect(audits[0][1]).toEqual([bookingId, staffId, 'Clashes with maintenance']);
  });

  /** VEN-REV-09-A: when the approval audit insert fails, the status UPDATE is rolled back with it and the approval rejects instead of reporting a decision. */
  it('SPM-55 AC5 rolls back and rejects the approval when the audit insert fails', async () => {
    const { repository, clientQuery, poolQuery } = createRollbackReviewRepository(
      ownedRow,
      venueLockRow,
      bookingLockRow,
      noConflict,
      { rows: [{ ...pendingRow, status: 'approved' }] },
      new Error('audit insert failed'),
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).rejects.toThrow(
      'audit insert failed',
    );
    // Every statement, including the rollback, runs on the transaction client.
    expect(poolQuery).not.toHaveBeenCalled();
    const sqls = clientQuery.mock.calls.map(([sql]) => normalizeSql(String(sql)));
    // The status UPDATE ran inside the transaction, and the audit insert that followed it failed.
    const updateAt = sqls.findIndex((sql) => sql.includes("UPDATE venue_bookings SET status = 'approved'"));
    expect(updateAt).toBeGreaterThan(-1);
    expect(sqls[updateAt + 1]).toContain('INSERT INTO booking_review_log');
    // The failed audit insert rolls the transaction back, so the approval is never committed.
    expect(sqls.slice(updateAt + 2)).toEqual(['ROLLBACK']);
    expect(sqls).not.toContain('COMMIT');
  });

  /** VEN-REV-09-B: when the rejection audit insert fails, the rejection UPDATE is rolled back with it and the rejection rejects instead of reporting a decision. */
  it('SPM-55 AC5 rolls back and rejects the rejection when the audit insert fails', async () => {
    const { repository, clientQuery, poolQuery } = createRollbackReviewRepository(
      ownedRow,
      venueLockRow,
      bookingLockRow,
      { rows: [{ ...pendingRow, status: 'rejected', rejection_reason: 'Clashes with maintenance' }] },
      new Error('audit insert failed'),
    );

    await expect(
      repository.rejectVenueBooking(staffId, bookingId, 'Clashes with maintenance'),
    ).rejects.toThrow('audit insert failed');
    // Every statement, including the rollback, runs on the transaction client.
    expect(poolQuery).not.toHaveBeenCalled();
    const sqls = clientQuery.mock.calls.map(([sql]) => normalizeSql(String(sql)));
    // The rejection UPDATE ran inside the transaction, and the audit insert that followed it failed.
    const updateAt = sqls.findIndex((sql) => sql.includes("UPDATE venue_bookings SET status = 'rejected'"));
    expect(updateAt).toBeGreaterThan(-1);
    expect(sqls[updateAt + 1]).toContain('INSERT INTO booking_review_log');
    // The failed audit insert rolls the transaction back, so the rejection is never committed.
    expect(sqls.slice(updateAt + 2)).toEqual(['ROLLBACK']);
    expect(sqls).not.toContain('COMMIT');
  });

  /** VEN-REV-06-A: rejecting a request in any terminal state is refused with its status, and runs neither the status UPDATE nor the audit insert. */
  it.each(['approved', 'rejected', 'cancelled', 'released'])('SPM-55 AC6 refuses to reject a %s request without updating it or writing an audit row', async (status) => {
      const { repository, query } = createReviewRepository(
        ownedRow,
        venueLockRow,
        { rows: [{ ...pendingRow, status }] },
      );

      await expect(
        repository.rejectVenueBooking(staffId, bookingId, 'Clash'),
      ).resolves.toEqual({ kind: 'already-decided', status });
      expect(query).toHaveBeenCalledTimes(3);
      const sqls = query.mock.calls.map(([sql]) => normalizeSql(String(sql)));
      expect(sqls.some((sql) => sql.includes('UPDATE venue_bookings'))).toBe(false);
      expect(sqls.some((sql) => sql.includes('INSERT INTO booking_review_log'))).toBe(false);
    },
  );

  /** VEN-REV-03-C: rejecting a booking outside the caller's venues is not found. */
  it('SPM-55 AC3 reports a foreign booking as not found on rejection', async () => {
    const { repository } = createReviewRepository({ rows: [] });

    await expect(
      repository.rejectVenueBooking(staffId, bookingId, 'Clash'),
    ).resolves.toEqual({ kind: 'not-found' });
  });

  /**
   * VEN-HOLD-09-SUP-API / VEN-HOLD-09-SUP-COORDINATOR: both booking lists read hold expiry exclusively at the expiry
   * instant. The injected clock is 2030-01-10T12:00Z: an approved hold expiring one millisecond later is not expired,
   * one expiring exactly now or earlier is. Only tentative holds can be expired.
   * Kills: `<=` weakened to `<` in the staff and coordinator list mappers.
   */
  it.each([
    ['one millisecond in the future', new Date('2030-01-10T12:00:00.001Z'), false],
    ['exactly now', new Date('2030-01-10T12:00:00.000Z'), true],
    ['one millisecond in the past', new Date('2030-01-10T11:59:59.999Z'), true],
  ])('VEN-HOLD-09-SUP-API and VEN-HOLD-09-SUP-COORDINATOR mark an approved hold expiring %s as expired=%s', async (_label, expires, expired) => {
    const staffRow = {
      id: bookingId,
      event_id: 'event-1',
      event_name: 'Gala',
      event_start: new Date('2030-02-12T03:00:00.000Z'),
      event_end: new Date('2030-02-12T06:00:00.000Z'),
      coordinator_name: 'Coordinator One',
      venue_name: 'Orchid Hall Test',
      booking_reference: 'VB-6F0D6F3A',
      special_request: null,
      request_kind: 'tentative_hold' as const,
      hold_expires_at: expires,
      start_at: pendingRow.start_at,
      end_at: pendingRow.end_at,
      status: 'approved' as const,
      rejection_reason: null,
    };
    const staff = createReviewRepository({ rows: [staffRow, { ...staffRow, id: 'ordinary', request_kind: 'booking' as const }] });
    const staffList = await staff.repository.listPendingVenueBookings(staffId);
    expect(staffList.map((row) => [row.requestKind, row.holdExpired])).toEqual([['tentative_hold', expired], ['booking', false]]);

    const coordinator = createReviewRepository({
      rows: [
        { ...staffRow, venue_id: venue.id, venue_staff_name: 'Venue Staff', created_at: new Date('2030-01-01T00:00:00.000Z'), affected: false },
        { ...staffRow, id: 'ordinary', request_kind: 'booking' as const, venue_id: venue.id, venue_staff_name: 'Venue Staff', created_at: new Date('2030-01-01T00:00:00.000Z'), affected: false },
      ],
    });
    const coordinatorList = await coordinator.repository.listCoordinatorBookings('coord-1');
    expect(coordinatorList.map((row) => [row.requestKind, row.holdExpired])).toEqual([['tentative_hold', expired], ['booking', false]]);
  });

  /** VEN-REV-04-A: the coordinator list returns the stored rejection reason and omits it when absent. */
  it('SPM-55 AC4 returns the rejection reason for coordinator bookings', async () => {
    const base = {
      event_id: 'event-1',
      event_name: 'Gala',
      venue_id: venue.id,
      venue_name: 'Orchid Hall Test',
      venue_staff_name: 'Venue Staff',
      start_at: pendingRow.start_at,
      end_at: pendingRow.end_at,
      special_request: null,
      created_at: new Date('2030-01-01T00:00:00.000Z'),
      affected: false,
      booking_reference: 'VB-6F0D6F3A',
    };
    const { repository, query } = createReviewRepository({
      rows: [
        { ...base, id: bookingId, status: 'rejected', rejection_reason: 'Clashes with maintenance' },
        { ...base, id: 'booking-2', status: 'pending', rejection_reason: null },
      ],
    });

    const bookings = await repository.listCoordinatorBookings('coord-1');
    // The coordinator projection must select the stored reason and the managing staff name.
    const [listSql] = query.mock.calls[0] as [string, unknown[]];
    expect(normalizeSql(listSql)).toContain('b.rejection_reason');
    expect(normalizeSql(listSql)).toContain('u.display_name AS venue_staff_name');
    // The staff name comes from the venue owner, so the users join must key on the owner id.
    expect(normalizeSql(listSql)).toContain('JOIN users u ON u.id = v.owner_user_id');
    expect(bookings[0]).toMatchObject({
      status: 'rejected',
      venueStaffName: 'Venue Staff',
      rejectionReason: 'Clashes with maintenance',
    });
    expect(bookings[1].rejectionReason).toBeUndefined();
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SPM-137 (venue booking decision notification, Coordinator): VENUE-BOOK-NOTIF-01-A, 01-B, 01-E, 02-A, 02-B, 02-C,
  // 02-BND-1, 05-A, 06-A, 06-D, 07-A, 07-B, 07-C, 07-D. The repository is tested in isolation: the transaction client
  // answers from a fixed sequence of fixture rows, so these cases show which statements run, in what order and with
  // which values. They do not exercise PostgreSQL (the e2e suite does).
  // ---------------------------------------------------------------------------------------------------------------

  // The row the notification context lookup returns: the event's current Coordinator, the event and the venue names.
  const noticeContext = (overrides: Record<string, unknown> = {}) => ({
    rows: [{ coordinator_id: 'coord-assigned', event_id: 'event-1', event_name: 'Gala Night', venue_name: 'Orchid Hall', ...overrides }],
  });
  const decidedAt = new Date('2030-01-10T12:00:00.000Z');
  const isNoticeInsert = (sql: unknown) => String(sql).includes('INSERT INTO notifications');
  const isNoticeLookup = (sql: unknown) => normalizeSql(String(sql)).includes('FROM venue_bookings b JOIN events e ON e.id = b.event_id JOIN venues v ON v.id = b.venue_id');

  /** Fixture sequence of an approval that saves: lookups, no conflict, status UPDATE, audit insert, then the notice rows. */
  const approveSequence = (context = noticeContext(), kind = 'booking') => [
    ownedRow,
    venueLockRow,
    { rows: [{ ...pendingRow, request_kind: kind, event_start: new Date('2031-01-01T00:00:00.000Z') }] },
    noConflict,
    { rows: [{ ...pendingRow, status: 'approved', request_kind: kind }] },
    { rows: [] },
    context,
    { rows: [] },
  ];
  /** Fixture sequence of a rejection that saves. */
  const rejectSequence = (context = noticeContext(), kind = 'booking') => [
    ownedRow,
    venueLockRow,
    { rows: [{ ...pendingRow, request_kind: kind }] },
    { rows: [{ ...pendingRow, status: 'rejected', request_kind: kind, rejection_reason: 'Clash' }] },
    { rows: [] },
    context,
    { rows: [] },
  ];

  /**
   * VENUE-BOOK-NOTIF-01-A (SPM-137 AC1): approving a booking writes exactly one notification, addressed to the
   * Coordinator the event has now, typed venue_booking_approved and linked to the event and to that booking.
   * Kills: no notification, a second notification, wrong recipient column, wrong type, a missing booking link.
   */
  it('VENUE-BOOK-NOTIF-01-A approving a booking writes one approved notification for the assigned Coordinator', async () => {
    // Arrange: an approval that will save, for an event assigned to coord-assigned.
    const { repository, clientQuery } = createSplitReviewRepository(...approveSequence());

    // Act: Venue Staff approve.
    await repository.approveVenueBooking(staffId, bookingId);

    // Assert: one insert, with the recipient, type, event and booking.
    const inserts = (clientQuery.mock.calls as Array<[string, unknown[]]>).filter(([sql]) => isNoticeInsert(sql));
    expect(inserts).toHaveLength(1);
    const [id, recipient, type, , eventId, relatedBooking] = inserts[0][1];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect([recipient, type, eventId, relatedBooking]).toEqual(['coord-assigned', 'venue_booking_approved', 'event-1', bookingId]);
  });

  /**
   * VENUE-BOOK-NOTIF-01-B (SPM-137 AC1): rejecting a booking writes exactly one venue_booking_rejected notification
   * for the event's Coordinator.
   * Kills: the rejection path writing nothing, using the approved type, or notifying someone else.
   */
  it('VENUE-BOOK-NOTIF-01-B rejecting a booking writes one rejected notification for the assigned Coordinator', async () => {
    // Arrange: a rejection that will save.
    const { repository, clientQuery } = createSplitReviewRepository(...rejectSequence());

    // Act: Venue Staff reject with a reason.
    await repository.rejectVenueBooking(staffId, bookingId, 'Clash');

    // Assert: one insert for the Coordinator, rejected type, linked to the booking.
    const inserts = (clientQuery.mock.calls as Array<[string, unknown[]]>).filter(([sql]) => isNoticeInsert(sql));
    expect(inserts).toHaveLength(1);
    const [, recipient, type, , eventId, relatedBooking] = inserts[0][1];
    expect([recipient, type, eventId, relatedBooking]).toEqual(['coord-assigned', 'venue_booking_rejected', 'event-1', bookingId]);
  });

  /**
   * VENUE-BOOK-NOTIF-01-E (SPM-137 AC1, hold decisions now SPM-165 AC1): deciding a tentative hold request writes the
   * hold-specific notification (tentative_hold_approved / tentative_hold_rejected) and never a booking decision one
   * (venue_booking_approved / venue_booking_rejected).
   * Kills: a hold decision using the booking decision types, or a hold decision that is still skipped.
   */
  it.each([
    ['approving', (r: VenuesRepository) => r.approveVenueBooking(staffId, bookingId), approveSequence(noticeContext(), 'tentative_hold'), 'tentative_hold_approved'],
    ['rejecting', (r: VenuesRepository) => r.rejectVenueBooking(staffId, bookingId, 'Clash'), rejectSequence(noticeContext(), 'tentative_hold'), 'tentative_hold_rejected'],
  ])('VENUE-BOOK-NOTIF-01-E %s a tentative hold request writes a hold notification, never a booking decision one', async (_label, decide, sequence, holdType) => {
    // Arrange: a hold request (the approval is far enough from the event start to save).
    const { repository, clientQuery } = createSplitReviewRepository(...sequence);

    // Act + Assert: the decision is saved, and exactly one notice is written, of the hold type.
    await expect(decide(repository)).resolves.toMatchObject({ kind: 'decided' });
    const inserts = (clientQuery.mock.calls as Array<[string, unknown[]]>).filter(([sql]) => isNoticeInsert(sql));
    expect(inserts.map(([, params]) => params[2])).toEqual([holdType]);
    expect(inserts.some(([, params]) => String(params[2]).startsWith('venue_booking_'))).toBe(false);
  });

  /**
   * VENUE-BOOK-NOTIF-02-A (SPM-137 AC2): the approved text is exactly `Your booking of <venue name> for "<event name>"
   * has been approved.`, with no reference and no reason.
   * Kills: any wording change, a swapped venue and event name, the booking reference or a reason added.
   */
  it('VENUE-BOOK-NOTIF-02-A the approved message is exactly the agreed sentence', async () => {
    const { repository, clientQuery } = createSplitReviewRepository(...approveSequence());

    await repository.approveVenueBooking(staffId, bookingId);

    const insert = (clientQuery.mock.calls as Array<[string, unknown[]]>).find(([sql]) => isNoticeInsert(sql))!;
    expect(insert[1][3]).toBe('Your booking of Orchid Hall for "Gala Night" has been approved.');
  });

  /**
   * VENUE-BOOK-NOTIF-02-B (SPM-137 AC2): the rejected text is exactly `... has been rejected.`; the rejection reason
   * the staff member typed and the booking reference are not in it.
   * Kills: the reason appended to the message, the approved wording on a rejection, the reference in the text.
   */
  it('VENUE-BOOK-NOTIF-02-B the rejected message is exactly the agreed sentence and carries no reason or reference', async () => {
    const { repository, clientQuery } = createSplitReviewRepository(...rejectSequence());

    await repository.rejectVenueBooking(staffId, bookingId, 'Clashes with maintenance');

    const insert = (clientQuery.mock.calls as Array<[string, unknown[]]>).find(([sql]) => isNoticeInsert(sql))!;
    expect(insert[1][3]).toBe('Your booking of Orchid Hall for "Gala Night" has been rejected.');
    expect(String(insert[1][3])).not.toMatch(/maintenance|VB-/);
  });

  /**
   * VENUE-BOOK-NOTIF-02-C (SPM-137 AC2): the notification's timestamp is the decision time taken from the injected
   * clock (2030-01-10T12:00Z), not the transaction start or the database default.
   * Kills: omitting created_at (database now()), or using a different time source.
   */
  it('VENUE-BOOK-NOTIF-02-C stamps the notification with the decision time from the clock', async () => {
    const { repository, clientQuery } = createSplitReviewRepository(...rejectSequence());

    await repository.rejectVenueBooking(staffId, bookingId, 'Clash');

    const insert = (clientQuery.mock.calls as Array<[string, unknown[]]>).find(([sql]) => isNoticeInsert(sql))!;
    expect(normalizeSql(insert[0])).toContain('created_at');
    expect(insert[1][6]).toEqual(decidedAt);
  });

  /**
   * VENUE-BOOK-NOTIF-02-BND-1 (SPM-137 AC2, boundary): venue and event names containing quotes and punctuation appear
   * in the message unchanged (no escaping, trimming or truncation).
   * Kills: escaping or stripping quotes, truncating long names.
   */
  it('VENUE-BOOK-NOTIF-02-BND-1 keeps quotes and punctuation in the venue and event names', async () => {
    const venueName = 'Hall "A" & B (Level 2)';
    const eventName = `"Annual" Gala: ${'x'.repeat(200)}`;
    const { repository, clientQuery } = createSplitReviewRepository(...approveSequence(noticeContext({ venue_name: venueName, event_name: eventName })));

    await repository.approveVenueBooking(staffId, bookingId);

    const insert = (clientQuery.mock.calls as Array<[string, unknown[]]>).find(([sql]) => isNoticeInsert(sql))!;
    expect(insert[1][3]).toBe(`Your booking of ${venueName} for "${eventName}" has been approved.`);
  });

  /**
   * VENUE-BOOK-NOTIF-05-A (SPM-137 AC5): each decision writes its own notification linked to its own booking, with a
   * new id every time, so an event with several bookings gets one notice per decision.
   * Kills: a fixed or reused notification id, deduplicating per event, linking every notice to the first booking.
   */
  it('VENUE-BOOK-NOTIF-05-A writes a separate notification, with its own id and booking link, for each decision', async () => {
    // Arrange: two bookings of one event decided one after the other.
    const otherBooking = '0b7d2a5e-1c3f-4e8a-9a6b-2f4c8d1e7a90';
    const first = createSplitReviewRepository(...approveSequence());
    const second = createSplitReviewRepository(...rejectSequence());

    // Act: approve one, reject the other.
    await first.repository.approveVenueBooking(staffId, bookingId);
    await second.repository.rejectVenueBooking(staffId, otherBooking, 'Clash');

    // Assert: two inserts, two distinct ids, each pointing at the booking it was decided for.
    const a = (first.clientQuery.mock.calls as Array<[string, unknown[]]>).find(([sql]) => isNoticeInsert(sql))!;
    const b = (second.clientQuery.mock.calls as Array<[string, unknown[]]>).find(([sql]) => isNoticeInsert(sql))!;
    expect(a[1][0]).not.toBe(b[1][0]);
    expect([a[1][5], b[1][2]]).toEqual([bookingId, 'venue_booking_rejected']);
    // The lookup the second decision ran was for the booking it decided.
    const lookup = (second.clientQuery.mock.calls as Array<[string, unknown[]]>).find(([sql]) => isNoticeLookup(sql))!;
    expect(lookup[1]).toEqual([otherBooking]);
  });

  /**
   * VENUE-BOOK-NOTIF-06-A (SPM-137 AC6): the recipient is the event's Coordinator as read inside the decision's own
   * transaction, after the status change, so a reassignment before the decision sends it to the new Coordinator.
   * Kills: a Coordinator remembered from an earlier read, a lookup outside the transaction, a lookup before the save.
   */
  it('VENUE-BOOK-NOTIF-06-A addresses the Coordinator read inside the decision transaction', async () => {
    // Arrange: the event now belongs to coord-new.
    const { repository, clientQuery, poolQuery } = createSplitReviewRepository(...rejectSequence(noticeContext({ coordinator_id: 'coord-new' })));

    // Act.
    await repository.rejectVenueBooking(staffId, bookingId, 'Clash');

    // Assert: the lookup and the insert ran on the transaction client, after the audit insert, in that order.
    expect(poolQuery).not.toHaveBeenCalled();
    const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => normalizeSql(String(sql)));
    const audit = sqls.findIndex((sql) => sql.includes('INSERT INTO booking_review_log'));
    expect(isNoticeLookup(sqls[audit + 1])).toBe(true);
    expect(isNoticeInsert(sqls[audit + 2])).toBe(true);
    const insert = (clientQuery.mock.calls as Array<[string, unknown[]]>).find(([sql]) => isNoticeInsert(sql))!;
    expect(insert[1][1]).toBe('coord-new');
  });

  /**
   * VENUE-BOOK-NOTIF-06-D (SPM-137 AC6, defensive): if the event has no Coordinator or no event row is found, the
   * decision still saves and no notification is written.
   * Kills: inserting a notification with a null recipient, or failing the decision because there is no recipient.
   */
  it.each([
    ['no row', { rows: [] }],
    ['an unassigned event', noticeContext({ coordinator_id: null })],
  ])('VENUE-BOOK-NOTIF-06-D saves the decision and writes no notification for %s', async (_label, context) => {
    const { repository, clientQuery } = createSplitReviewRepository(...approveSequence(context as ReturnType<typeof noticeContext>));

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'decided' });
    expect((clientQuery.mock.calls as Array<[string]>).some(([sql]) => isNoticeInsert(sql))).toBe(false);
  });

  /**
   * VENUE-BOOK-NOTIF-07-A (SPM-137 AC7): a booking the staff member cannot act on (not theirs or not found) or that is
   * no longer pending is refused with no notification statement at all.
   * Kills: notifying before the ownership and pending checks.
   */
  it.each([
    ['approve a booking that is not theirs', (r: VenuesRepository) => r.approveVenueBooking(staffId, bookingId), [{ rows: [] }], { kind: 'not-found' }],
    ['reject a booking that is not theirs', (r: VenuesRepository) => r.rejectVenueBooking(staffId, bookingId, 'Clash'), [{ rows: [] }], { kind: 'not-found' }],
    ...(['approved', 'rejected', 'cancelled', 'released'] as const).flatMap((status) => [
      [`approve a ${status} booking`, (r: VenuesRepository) => r.approveVenueBooking(staffId, bookingId), [ownedRow, venueLockRow, { rows: [{ ...pendingRow, status }] }], { kind: 'already-decided', status }],
      [`reject a ${status} booking`, (r: VenuesRepository) => r.rejectVenueBooking(staffId, bookingId, 'Clash'), [ownedRow, venueLockRow, { rows: [{ ...pendingRow, status }] }], { kind: 'already-decided', status }],
    ]),
  ] as Array<[string, (r: VenuesRepository) => Promise<unknown>, Array<{ rows: unknown[] }>, object]>)(
    'VENUE-BOOK-NOTIF-07-A refuses to %s without any notification statement',
    async (_label, decide, sequence, expected) => {
      const { repository, clientQuery } = createSplitReviewRepository(...sequence);

      await expect(decide(repository)).resolves.toEqual(expected);
      const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => sql);
      expect(sqls.some(isNoticeInsert) || sqls.some(isNoticeLookup)).toBe(false);
    },
  );

  /**
   * VENUE-BOOK-NOTIF-07-B (SPM-137 AC7): an approval refused for a slot conflict writes no notification and no status
   * change.
   * Kills: notifying after the conflict check returns, or before it.
   */
  it('VENUE-BOOK-NOTIF-07-B writes no notification when the approval conflicts with another booking', async () => {
    const { repository, clientQuery } = createSplitReviewRepository(
      ownedRow,
      venueLockRow,
      { rows: [{ ...pendingRow, request_kind: 'booking' }] },
      {
        rows: [{
          id: 'other', reason: 'Other event', kind: 'booking',
          start_at: pendingRow.start_at, end_at: pendingRow.end_at,
          occupied_start: pendingRow.start_at, occupied_end: pendingRow.end_at,
          status: 'approved', request_kind: 'booking', hold_expires_at: null,
        }],
      },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'conflict' });
    const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => sql);
    expect(sqls.some(isNoticeInsert) || sqls.some(isNoticeLookup)).toBe(false);
    expect(sqls.some((sql) => normalizeSql(sql).includes("SET status = 'approved'"))).toBe(false);
  });

  /**
   * VENUE-BOOK-NOTIF-07-C (SPM-137 AC7): if saving the notification fails, the whole decision rolls back (ROLLBACK, no
   * COMMIT) and the call rejects, so a decision is never saved without its notification.
   * Kills: swallowing the notification error, or writing the notification outside the decision transaction.
   */
  it.each([
    ['approval', (r: VenuesRepository) => r.approveVenueBooking(staffId, bookingId), approveSequence()],
    ['rejection', (r: VenuesRepository) => r.rejectVenueBooking(staffId, bookingId, 'Clash'), rejectSequence()],
  ])('VENUE-BOOK-NOTIF-07-C rolls the %s back when the notification insert fails', async (_label, decide, sequence) => {
    // Arrange: the last fixture (the notification insert) throws.
    const steps = [...sequence.slice(0, -1), new Error('notification insert failed')];
    const { repository, clientQuery, poolQuery } = createRollbackReviewRepository(...steps);

    // Act + Assert: the decision rejects, and the transaction ends with ROLLBACK.
    await expect(decide(repository)).rejects.toThrow('notification insert failed');
    expect(poolQuery).not.toHaveBeenCalled();
    const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => normalizeSql(String(sql)));
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });

  /**
   * VENUE-BOOK-NOTIF-07-D (SPM-137 AC7): when the notification lookup itself fails the decision also rolls back.
   * Kills: a try/catch around the lookup that lets the decision commit without its notification.
   */
  it('VENUE-BOOK-NOTIF-07-D rolls the decision back when the notification lookup fails', async () => {
    const steps = [...approveSequence().slice(0, -2), new Error('lookup failed')];
    const { repository, clientQuery } = createRollbackReviewRepository(...steps);

    await expect(repository.approveVenueBooking(staffId, bookingId)).rejects.toThrow('lookup failed');
    const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => normalizeSql(String(sql)));
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SPM-165 (tentative hold decision notification, Coordinator): VENUE-HOLD-NOTIF-01-A, 01-B, 01-E, 02-A, 02-B, 02-C,
  // 02-BND-1, 05-A, 06-A, 06-D, 07-A, 07-B, 07-C, 07-D. Same isolation as above: the transaction client answers from a
  // fixed sequence of fixture rows; PostgreSQL is exercised by test/tentative-hold-decision-notifications.e2e-spec.ts.
  // ---------------------------------------------------------------------------------------------------------------

  const holdApprove = (context = noticeContext()) => approveSequence(context, 'tentative_hold');
  const holdReject = (context = noticeContext()) => rejectSequence(context, 'tentative_hold');
  const noticeInserts = (clientQuery: { mock: { calls: unknown[][] } }) =>
    (clientQuery.mock.calls as Array<[string, unknown[]]>).filter(([sql]) => isNoticeInsert(sql));

  /**
   * VENUE-HOLD-NOTIF-01-A (SPM-165 AC1): approving a tentative hold writes exactly one notification for the Coordinator
   * the event has now, typed tentative_hold_approved and linked to the event and to that hold.
   * Kills: no notification, a second one, wrong recipient, wrong type, a missing hold link.
   */
  it('VENUE-HOLD-NOTIF-01-A approving a tentative hold writes one approved hold notification for the assigned Coordinator', async () => {
    const { repository, clientQuery } = createSplitReviewRepository(...holdApprove());

    await repository.approveVenueBooking(staffId, bookingId);

    const inserts = noticeInserts(clientQuery);
    expect(inserts).toHaveLength(1);
    const [id, recipient, type, , eventId, relatedBooking] = inserts[0][1];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect([recipient, type, eventId, relatedBooking]).toEqual(['coord-assigned', 'tentative_hold_approved', 'event-1', bookingId]);
  });

  /**
   * VENUE-HOLD-NOTIF-01-B (SPM-165 AC1): rejecting a tentative hold writes exactly one tentative_hold_rejected
   * notification for the event's Coordinator.
   * Kills: the rejection path writing nothing, using the approved type, or notifying someone else.
   */
  it('VENUE-HOLD-NOTIF-01-B rejecting a tentative hold writes one rejected hold notification for the assigned Coordinator', async () => {
    const { repository, clientQuery } = createSplitReviewRepository(...holdReject());

    await repository.rejectVenueBooking(staffId, bookingId, 'Clash');

    const inserts = noticeInserts(clientQuery);
    expect(inserts).toHaveLength(1);
    const [, recipient, type, , eventId, relatedBooking] = inserts[0][1];
    expect([recipient, type, eventId, relatedBooking]).toEqual(['coord-assigned', 'tentative_hold_rejected', 'event-1', bookingId]);
  });

  /**
   * VENUE-HOLD-NOTIF-01-E (SPM-165 AC1, out of scope SPM-137): deciding an ordinary venue booking request still writes
   * only the booking decision type, never a tentative hold one.
   * Kills: choosing the notification type by something other than the request kind.
   */
  it.each([
    ['approving', (r: VenuesRepository) => r.approveVenueBooking(staffId, bookingId), approveSequence(), 'venue_booking_approved'],
    ['rejecting', (r: VenuesRepository) => r.rejectVenueBooking(staffId, bookingId, 'Clash'), rejectSequence(), 'venue_booking_rejected'],
  ])('VENUE-HOLD-NOTIF-01-E %s a booking request writes a booking decision notification, never a hold one', async (_label, decide, sequence, bookingType) => {
    const { repository, clientQuery } = createSplitReviewRepository(...sequence);

    await decide(repository);

    expect(noticeInserts(clientQuery).map(([, params]) => params[2])).toEqual([bookingType]);
  });

  /**
   * VENUE-HOLD-NOTIF-02-A (SPM-165 AC2): the approved text is exactly `Your tentative hold of <venue name> for "<event
   * name>" has been approved.`, with no expiry, reference or reason.
   * Kills: any wording change, a swapped venue and event name, the booking wording ("Your booking of").
   */
  it('VENUE-HOLD-NOTIF-02-A the approved hold message is exactly the agreed sentence', async () => {
    const { repository, clientQuery } = createSplitReviewRepository(...holdApprove());

    await repository.approveVenueBooking(staffId, bookingId);

    expect(noticeInserts(clientQuery)[0][1][3]).toBe('Your tentative hold of Orchid Hall for "Gala Night" has been approved.');
  });

  /**
   * VENUE-HOLD-NOTIF-02-B (SPM-165 AC2): the rejected text is exactly `... has been rejected.`; the typed rejection
   * reason and the booking reference are not in it.
   * Kills: the reason appended, the approved wording on a rejection, the reference in the text.
   */
  it('VENUE-HOLD-NOTIF-02-B the rejected hold message is exactly the agreed sentence and carries no reason or reference', async () => {
    const { repository, clientQuery } = createSplitReviewRepository(...holdReject());

    await repository.rejectVenueBooking(staffId, bookingId, 'Clashes with maintenance');

    const message = String(noticeInserts(clientQuery)[0][1][3]);
    expect(message).toBe('Your tentative hold of Orchid Hall for "Gala Night" has been rejected.');
    expect(message).not.toMatch(/maintenance|VB-/);
  });

  /**
   * VENUE-HOLD-NOTIF-02-C (SPM-165 AC2): the notification's timestamp is the decision time from the injected clock
   * (2030-01-10T12:00Z), not the transaction start or the database default.
   * Kills: omitting created_at, or a different time source.
   */
  it('VENUE-HOLD-NOTIF-02-C stamps the hold notification with the decision time from the clock', async () => {
    const { repository, clientQuery } = createSplitReviewRepository(...holdReject());

    await repository.rejectVenueBooking(staffId, bookingId, 'Clash');

    const [insert] = noticeInserts(clientQuery);
    expect(normalizeSql(insert[0])).toContain('created_at');
    expect(insert[1][6]).toEqual(decidedAt);
  });

  /**
   * VENUE-HOLD-NOTIF-02-BND-1 (SPM-165 AC2, boundary): names containing quotes, punctuation and 200+ characters appear
   * in the message unchanged.
   * Kills: escaping or stripping quotes, truncating long names.
   */
  it('VENUE-HOLD-NOTIF-02-BND-1 keeps quotes and punctuation in the venue and event names of a hold notification', async () => {
    const venueName = 'Hall "A" & B (Level 2)';
    const eventName = `"Annual" Gala: ${'x'.repeat(200)}`;
    const { repository, clientQuery } = createSplitReviewRepository(...holdApprove(noticeContext({ venue_name: venueName, event_name: eventName })));

    await repository.approveVenueBooking(staffId, bookingId);

    expect(noticeInserts(clientQuery)[0][1][3]).toBe(`Your tentative hold of ${venueName} for "${eventName}" has been approved.`);
  });

  /**
   * VENUE-HOLD-NOTIF-05-A (SPM-165 AC5): each hold decision writes its own notification, with its own id, linked to its
   * own hold, and the context lookup is for the hold that was decided.
   * Kills: a reused notification id, deduplicating per event, linking every notice to the first hold.
   */
  it('VENUE-HOLD-NOTIF-05-A writes a separate hold notification, with its own id and link, for each hold decision', async () => {
    const otherHold = '0b7d2a5e-1c3f-4e8a-9a6b-2f4c8d1e7a90';
    const first = createSplitReviewRepository(...holdApprove());
    const second = createSplitReviewRepository(...holdReject());

    await first.repository.approveVenueBooking(staffId, bookingId);
    await second.repository.rejectVenueBooking(staffId, otherHold, 'Clash');

    const a = noticeInserts(first.clientQuery)[0];
    const b = noticeInserts(second.clientQuery)[0];
    expect(a[1][0]).not.toBe(b[1][0]);
    expect([a[1][2], a[1][5], b[1][2]]).toEqual(['tentative_hold_approved', bookingId, 'tentative_hold_rejected']);
    const lookup = (second.clientQuery.mock.calls as Array<[string, unknown[]]>).find(([sql]) => isNoticeLookup(sql))!;
    expect(lookup[1]).toEqual([otherHold]);
  });

  /**
   * VENUE-HOLD-NOTIF-06-A (SPM-165 AC6): the recipient is the event's Coordinator as read inside the decision's own
   * transaction, after the audit insert, so a reassignment before the decision sends the notice to the new Coordinator.
   * Kills: a Coordinator remembered from an earlier read, a lookup outside the transaction or before the save.
   */
  it('VENUE-HOLD-NOTIF-06-A addresses the hold notification to the Coordinator read inside the decision transaction', async () => {
    const { repository, clientQuery, poolQuery } = createSplitReviewRepository(...holdReject(noticeContext({ coordinator_id: 'coord-new' })));

    await repository.rejectVenueBooking(staffId, bookingId, 'Clash');

    expect(poolQuery).not.toHaveBeenCalled();
    const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => normalizeSql(String(sql)));
    const audit = sqls.findIndex((sql) => sql.includes('INSERT INTO booking_review_log'));
    expect(isNoticeLookup(sqls[audit + 1])).toBe(true);
    expect(isNoticeInsert(sqls[audit + 2])).toBe(true);
    expect(noticeInserts(clientQuery)[0][1][1]).toBe('coord-new');
  });

  /**
   * VENUE-HOLD-NOTIF-06-D (SPM-165 AC6, defensive): if the event has no Coordinator or no event row is found, the hold
   * decision still saves and no notification is written.
   * Kills: inserting with a null recipient, or failing the decision because there is no recipient.
   */
  it.each([
    ['no row', { rows: [] }],
    ['an unassigned event', noticeContext({ coordinator_id: null })],
  ])('VENUE-HOLD-NOTIF-06-D saves the hold decision and writes no notification for %s', async (_label, context) => {
    const { repository, clientQuery } = createSplitReviewRepository(...holdApprove(context as ReturnType<typeof noticeContext>));

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'decided' });
    expect(noticeInserts(clientQuery)).toEqual([]);
  });

  /**
   * VENUE-HOLD-NOTIF-07-A (SPM-165 AC7): a hold the staff member cannot act on (not theirs or not found) or that is no
   * longer pending is refused with no notification statement at all.
   * Kills: notifying before the ownership and pending checks.
   */
  it.each([
    ['approve a hold that is not theirs', (r: VenuesRepository) => r.approveVenueBooking(staffId, bookingId), [{ rows: [] }], { kind: 'not-found' }],
    ['reject a hold that is not theirs', (r: VenuesRepository) => r.rejectVenueBooking(staffId, bookingId, 'Clash'), [{ rows: [] }], { kind: 'not-found' }],
    ...(['approved', 'rejected', 'cancelled', 'released'] as const).flatMap((status) => [
      [`approve a ${status} hold`, (r: VenuesRepository) => r.approveVenueBooking(staffId, bookingId), [ownedRow, venueLockRow, { rows: [{ ...pendingRow, request_kind: 'tentative_hold', status }] }], { kind: 'already-decided', status }],
      [`reject a ${status} hold`, (r: VenuesRepository) => r.rejectVenueBooking(staffId, bookingId, 'Clash'), [ownedRow, venueLockRow, { rows: [{ ...pendingRow, request_kind: 'tentative_hold', status }] }], { kind: 'already-decided', status }],
    ]),
  ] as Array<[string, (r: VenuesRepository) => Promise<unknown>, Array<{ rows: unknown[] }>, object]>)(
    'VENUE-HOLD-NOTIF-07-A refuses to %s without any notification statement',
    async (_label, decide, sequence, expected) => {
      const { repository, clientQuery } = createSplitReviewRepository(...sequence);

      await expect(decide(repository)).resolves.toEqual(expected);
      const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => sql);
      expect(sqls.some(isNoticeInsert) || sqls.some(isNoticeLookup)).toBe(false);
    },
  );

  /**
   * VENUE-HOLD-NOTIF-07-B (SPM-165 AC7): a hold approval refused for a slot conflict, or for the 336-hour lead-time
   * rule (SPM-159), writes no notification and no status change.
   * Kills: notifying after either refusal returns.
   */
  it.each([
    [
      'a slot conflict',
      [{ rows: [{ id: 'other', reason: 'Other event', kind: 'booking', start_at: pendingRow.start_at, end_at: pendingRow.end_at, occupied_start: pendingRow.start_at, occupied_end: pendingRow.end_at, status: 'approved', request_kind: 'booking', hold_expires_at: null }] }],
      new Date('2031-01-01T00:00:00.000Z'),
    ],
    ['the 336-hour lead-time rule', [], new Date('2030-01-11T00:00:00.000Z')],
  ] as Array<[string, Array<{ rows: unknown[] }>, Date]>)('VENUE-HOLD-NOTIF-07-B writes no notification when the hold approval is refused for %s', async (_label, conflictRows, eventStart) => {
    const { repository, clientQuery } = createSplitReviewRepository(
      ownedRow,
      venueLockRow,
      { rows: [{ ...pendingRow, request_kind: 'tentative_hold', event_start: eventStart }] },
      ...conflictRows,
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'conflict' });
    const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => sql);
    expect(sqls.some(isNoticeInsert) || sqls.some(isNoticeLookup)).toBe(false);
    expect(sqls.some((sql) => normalizeSql(sql).includes("SET status = 'approved'"))).toBe(false);
  });

  /**
   * VENUE-HOLD-NOTIF-07-C (SPM-165 AC7): if saving the hold notification fails, the whole decision rolls back (ROLLBACK,
   * no COMMIT) and the call rejects.
   * Kills: swallowing the notification error, or writing the notification outside the decision transaction.
   */
  it.each([
    ['approval', (r: VenuesRepository) => r.approveVenueBooking(staffId, bookingId), holdApprove()],
    ['rejection', (r: VenuesRepository) => r.rejectVenueBooking(staffId, bookingId, 'Clash'), holdReject()],
  ])('VENUE-HOLD-NOTIF-07-C rolls the hold %s back when the notification insert fails', async (_label, decide, sequence) => {
    const steps = [...sequence.slice(0, -1), new Error('notification insert failed')];
    const { repository, clientQuery, poolQuery } = createRollbackReviewRepository(...steps);

    await expect(decide(repository)).rejects.toThrow('notification insert failed');
    expect(poolQuery).not.toHaveBeenCalled();
    const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => normalizeSql(String(sql)));
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });

  /**
   * VENUE-HOLD-NOTIF-07-D (SPM-165 AC7, supporting): when the notification lookup itself fails the hold decision also
   * rolls back.
   * Kills: a try/catch around the lookup that lets the decision commit without its notification.
   */
  it('VENUE-HOLD-NOTIF-07-D rolls the hold decision back when the notification lookup fails', async () => {
    const steps = [...holdApprove().slice(0, -2), new Error('lookup failed')];
    const { repository, clientQuery } = createRollbackReviewRepository(...steps);

    await expect(repository.approveVenueBooking(staffId, bookingId)).rejects.toThrow('lookup failed');
    const sqls = (clientQuery.mock.calls as Array<[string]>).map(([sql]) => normalizeSql(String(sql)));
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });
});

describe('SPM-121 repository.update', () => {
  const venueId = '00000000-0000-4000-8000-000000000124';
  const ownerUserId = '8ff4073d-8baa-4d32-984e-b93a46cbe49d';
  const otherUserId = 'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa';
  const venueInput = {
    name: 'Updated Hall',
    location: 'Block B Level 1',
    capacity: 80,
    facilities: ['Wi-Fi'],
    accessibility: [],
    layouts: ['Theatre'],
    operatingInformation: 'Open daily',
    setupTimeMinutes: 30,
    turnaroundTimeMinutes: 45,
  };
  const venueRow = {
    id: venueId,
    owner_user_id: ownerUserId,
    name: venueInput.name,
    location: venueInput.location,
    capacity: venueInput.capacity,
    facilities: venueInput.facilities,
    accessibility: venueInput.accessibility,
    layouts: venueInput.layouts,
    operating_information: venueInput.operatingInformation,
    setup_time_minutes: venueInput.setupTimeMinutes,
    turnaround_time_minutes: venueInput.turnaroundTimeMinutes,
    image_name: null,
    image_type: null,
    image_size: null,
    image_data_url: null,
  };

  /** Builds a repository mock for update(); txQuery is the client inside the transaction, poolQuery is for withSchedules. */
  function createUpdateRepository(
    lockRow: { id: string; owner_user_id: string; capacity: number; setup_time_minutes?: number; turnaround_time_minutes?: number } | undefined,
    options: { updatedRow?: typeof venueRow; affectedRows?: unknown[]; capacityRows?: unknown[]; input?: typeof venueInput } = {},
  ) {
    const { updatedRow = venueRow, affectedRows = [], capacityRows = [], input = venueInput } = options;
    const txQuery = vi.fn();
    // 1. Lock query (now includes setup/turnaround)
    const fullLock = lockRow ? {
      ...lockRow,
      setup_time_minutes: lockRow.setup_time_minutes ?? input.setupTimeMinutes,
      turnaround_time_minutes: lockRow.turnaround_time_minutes ?? input.turnaroundTimeMinutes,
    } : undefined;
    txQuery.mockResolvedValueOnce({ rows: fullLock ? [fullLock] : [] });
    if (fullLock && fullLock.owner_user_id === ownerUserId) {
      // 2. UPDATE venues
      txQuery.mockResolvedValueOnce({ rows: [] });
      // 3–8. DELETE facilities, INSERT facilities, DELETE layouts, INSERT layouts, DELETE accessibility, DELETE image
      // (6 calls: accessibility=[] so no INSERT; no new image so only DELETE)
      for (let i = 0; i < 6; i++) txQuery.mockResolvedValueOnce({ rows: [] });
      // AC8 affected query only when timing changed
      const timingChanged = fullLock.setup_time_minutes !== input.setupTimeMinutes
        || fullLock.turnaround_time_minutes !== input.turnaroundTimeMinutes;
      if (timingChanged) {
        txQuery.mockResolvedValueOnce({ rows: affectedRows });
      }
      // AC9 capacity query only when capacity differs from lockRow
      if (fullLock.capacity !== input.capacity) {
        txQuery.mockResolvedValueOnce({ rows: capacityRows });
      }
      // SELECT updated venue
      txQuery.mockResolvedValueOnce({ rows: [updatedRow] });
    }
    // withSchedules uses this.database.query (pool level, outside transaction)
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })   // unavailable periods
      .mockResolvedValueOnce({ rows: [] });  // bookings
    const transaction = vi.fn(async (work: (c: { query: typeof txQuery }) => Promise<unknown>) => work({ query: txQuery }));
    const repository = new VenuesRepository(
      { transaction, query: poolQuery } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );
    return { repository, txQuery, poolQuery, transaction };
  }

  /** VEN-UPD-07-A-REPO: updating a venue owned by another staff member returns forbidden. */
  it('VEN-UPD-07-A-REPO returns forbidden when the caller is not the venue owner', async () => {
    const { repository } = createUpdateRepository({
      id: venueId,
      owner_user_id: otherUserId,
      capacity: 120,
    });
    await expect(
      repository.update(ownerUserId, venueId, venueInput),
    ).resolves.toEqual({ kind: 'forbidden' });
  });

  /** VEN-UPD-07-B-REPO: updating a non-existent venue returns not-found. */
  it('VEN-UPD-07-B-REPO returns not-found when the venue does not exist', async () => {
    const { repository } = createUpdateRepository(undefined);
    await expect(
      repository.update(ownerUserId, venueId, venueInput),
    ).resolves.toEqual({ kind: 'not-found' });
  });

  /** VEN-UPD-05-A-REPO: a successful update returns the updated venue record with empty booking lists when no conflicts or capacity change. */
  it('VEN-UPD-05-A-REPO returns updated venue and empty booking lists when capacity and timing are unchanged', async () => {
    const lockRow = { id: venueId, owner_user_id: ownerUserId, capacity: venueInput.capacity };
    const { repository } = createUpdateRepository(lockRow);
    const result = await repository.update(ownerUserId, venueId, venueInput);
    expect(result.kind).toBe('updated');
    if (result.kind === 'updated') {
      expect(result.venue).toMatchObject({ id: venueId, ownerId: ownerUserId });
      expect(result.affectedBookings).toEqual([]);
      expect(result.capacityBookings).toEqual([]);
    }
  });

  /** VEN-UPD-09-A-REPO: capacity change triggers the AC9 pending/approved booking query. */
  it('VEN-UPD-09-A-REPO runs the capacity booking query when capacity changes', async () => {
    const capacityBookingRow = {
      id: 'bk-1',
      event_name: 'Conference',
      start_at: new Date('2030-03-01T10:00:00.000Z'),
      end_at: new Date('2030-03-02T10:00:00.000Z'),
      status: 'pending' as const,
    };
    const lockRow = {
      id: venueId, owner_user_id: ownerUserId, capacity: 120,
      setup_time_minutes: venueInput.setupTimeMinutes,
      turnaround_time_minutes: venueInput.turnaroundTimeMinutes,
    };
    const { repository } = createUpdateRepository(lockRow, { capacityRows: [capacityBookingRow] });
    const result = await repository.update(ownerUserId, venueId, venueInput);
    expect(result.kind).toBe('updated');
    if (result.kind === 'updated') {
      expect(result.capacityBookings).toEqual([{
        bookingId: 'bk-1',
        eventName: 'Conference',
        start: '2030-03-01T10:00:00.000Z',
        end: '2030-03-02T10:00:00.000Z',
        status: 'pending',
      }]);
    }
  });

  /** VEN-UPD-08-A: timing change populates affectedBookings from the conflict query. */
  it('VEN-UPD-08-A returns affectedBookings when setup/turnaround causes an overlap', async () => {
    const conflictRow = {
      id: 'bk-conflict',
      event_name: 'Workshop',
      start_at: new Date('2030-04-01T09:00:00.000Z'),
      end_at: new Date('2030-04-01T11:00:00.000Z'),
      status: 'approved' as const,
    };
    const lockRow = {
      id: venueId, owner_user_id: ownerUserId, capacity: venueInput.capacity,
      setup_time_minutes: 0, turnaround_time_minutes: 0,
    };
    const { repository } = createUpdateRepository(lockRow, { affectedRows: [conflictRow] });
    const result = await repository.update(ownerUserId, venueId, venueInput);
    expect(result.kind).toBe('updated');
    if (result.kind === 'updated') {
      expect(result.affectedBookings).toEqual([{
        bookingId: 'bk-conflict',
        eventName: 'Workshop',
        start: '2030-04-01T09:00:00.000Z',
        end: '2030-04-01T11:00:00.000Z',
        status: 'approved',
      }]);
      expect(result.capacityBookings).toEqual([]);
    }
  });

  /** VEN-UPD-05-A-SUP: when timing is unchanged, no AC8 query is executed. */
  it('VEN-UPD-05-A-SUP skips the AC8 query when setup and turnaround are unchanged', async () => {
    const lockRow = {
      id: venueId, owner_user_id: ownerUserId, capacity: venueInput.capacity,
      setup_time_minutes: venueInput.setupTimeMinutes,
      turnaround_time_minutes: venueInput.turnaroundTimeMinutes,
    };
    const { repository, txQuery } = createUpdateRepository(lockRow);
    const result = await repository.update(ownerUserId, venueId, venueInput);
    expect(result.kind).toBe('updated');
    if (result.kind === 'updated') {
      expect(result.affectedBookings).toEqual([]);
    }
    const sqlCalls = txQuery.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqlCalls.some((s: string) => s.includes('venue_booking_requests'))).toBe(false);
  });

  /** VEN-UPD-08-C-REPO: when only setup changes, timing is treated as changed. */
  it('VEN-UPD-08-C-REPO runs the AC8 query when only setup time changes', async () => {
    const lockRow = {
      id: venueId, owner_user_id: ownerUserId, capacity: venueInput.capacity,
      setup_time_minutes: 0,
      turnaround_time_minutes: venueInput.turnaroundTimeMinutes,
    };
    const { repository, txQuery } = createUpdateRepository(lockRow, { affectedRows: [] });
    const result = await repository.update(ownerUserId, venueId, venueInput);
    expect(result.kind).toBe('updated');
    const sqlCalls = txQuery.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqlCalls.some((s: string) => s.includes('venue_booking_requests'))).toBe(true);
  });

  /** VEN-UPD-03-D-REPO: empty facilities list skips the INSERT facilities query (covers the if (input.facilities.length) false branch). */
  it('VEN-UPD-03-D-REPO skips INSERT facilities when facilities list is empty', async () => {
    const input = { ...venueInput, facilities: [] as string[] };
    const fullLockRow = { id: venueId, owner_user_id: ownerUserId, capacity: input.capacity, setup_time_minutes: input.setupTimeMinutes, turnaround_time_minutes: input.turnaroundTimeMinutes };
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [fullLockRow] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE venues
      .mockResolvedValueOnce({ rows: [] }) // DELETE facilities (no INSERT)
      .mockResolvedValueOnce({ rows: [] }) // DELETE layouts
      .mockResolvedValueOnce({ rows: [] }) // INSERT layouts
      .mockResolvedValueOnce({ rows: [] }) // DELETE accessibility (no INSERT)
      .mockResolvedValueOnce({ rows: [] }) // DELETE image (no INSERT)
      .mockResolvedValueOnce({ rows: [venueRow] }); // SELECT updated
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository(
      { transaction: vi.fn(async (work: (c: { query: typeof txQuery }) => Promise<unknown>) => work({ query: txQuery })), query: poolQuery } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );
    const result = await repository.update(ownerUserId, venueId, input);
    expect(result.kind).toBe('updated');
    const sqls = txQuery.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some((s: string) => s.includes('INSERT INTO venue_facilities'))).toBe(false);
  });

  /** VEN-UPD-03-E-REPO: empty layouts list skips the INSERT layouts query (covers the if (input.layouts.length) false branch). */
  it('VEN-UPD-03-E-REPO skips INSERT layouts when layouts list is empty', async () => {
    const input = { ...venueInput, layouts: [] as string[] };
    const fullLockRow = { id: venueId, owner_user_id: ownerUserId, capacity: input.capacity, setup_time_minutes: input.setupTimeMinutes, turnaround_time_minutes: input.turnaroundTimeMinutes };
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [fullLockRow] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE venues
      .mockResolvedValueOnce({ rows: [] }) // DELETE facilities
      .mockResolvedValueOnce({ rows: [] }) // INSERT facilities
      .mockResolvedValueOnce({ rows: [] }) // DELETE layouts (no INSERT)
      .mockResolvedValueOnce({ rows: [] }) // DELETE accessibility (no INSERT)
      .mockResolvedValueOnce({ rows: [] }) // DELETE image (no INSERT)
      .mockResolvedValueOnce({ rows: [venueRow] }); // SELECT updated
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository(
      { transaction: vi.fn(async (work: (c: { query: typeof txQuery }) => Promise<unknown>) => work({ query: txQuery })), query: poolQuery } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );
    const result = await repository.update(ownerUserId, venueId, input);
    expect(result.kind).toBe('updated');
    const sqls = txQuery.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some((s: string) => s.includes('INSERT INTO venue_layouts'))).toBe(false);
  });

  /** VEN-UPD-02-A-REPO-SUP: non-empty accessibility list calls insertAccessibility (covers the if (input.accessibility.length) true branch). */
  it('VEN-UPD-02-A-REPO-SUP calls INSERT accessibility when accessibility list is non-empty', async () => {
    const input = { ...venueInput, accessibility: ['Wheelchair access'] };
    const fullLockRow = { id: venueId, owner_user_id: ownerUserId, capacity: input.capacity, setup_time_minutes: input.setupTimeMinutes, turnaround_time_minutes: input.turnaroundTimeMinutes };
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [fullLockRow] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE venues
      .mockResolvedValueOnce({ rows: [] }) // DELETE facilities
      .mockResolvedValueOnce({ rows: [] }) // INSERT facilities
      .mockResolvedValueOnce({ rows: [] }) // DELETE layouts
      .mockResolvedValueOnce({ rows: [] }) // INSERT layouts
      .mockResolvedValueOnce({ rows: [] }) // DELETE accessibility
      .mockResolvedValueOnce({ rows: [] }) // INSERT accessibility
      .mockResolvedValueOnce({ rows: [] }) // DELETE image (no INSERT)
      .mockResolvedValueOnce({ rows: [venueRow] }); // SELECT updated
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository(
      { transaction: vi.fn(async (work: (c: { query: typeof txQuery }) => Promise<unknown>) => work({ query: txQuery })), query: poolQuery } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );
    const result = await repository.update(ownerUserId, venueId, input);
    expect(result.kind).toBe('updated');
    const sqls = txQuery.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some((s: string) => s.includes('INSERT INTO venue_accessibility'))).toBe(true);
  });

  /** VEN-UPD-02-A-REPO-SUP2: image provided calls insertImage (covers the if (input.image) true branch). */
  it('VEN-UPD-02-A-REPO-SUP2 calls INSERT image when an image is provided', async () => {
    const input = { ...venueInput, image: { name: 'hall.png', type: 'image/png', size: 1024, dataUrl: 'data:image/png;base64,abc' } };
    const fullLockRow = { id: venueId, owner_user_id: ownerUserId, capacity: input.capacity, setup_time_minutes: input.setupTimeMinutes, turnaround_time_minutes: input.turnaroundTimeMinutes };
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [fullLockRow] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE venues
      .mockResolvedValueOnce({ rows: [] }) // DELETE facilities
      .mockResolvedValueOnce({ rows: [] }) // INSERT facilities
      .mockResolvedValueOnce({ rows: [] }) // DELETE layouts
      .mockResolvedValueOnce({ rows: [] }) // INSERT layouts
      .mockResolvedValueOnce({ rows: [] }) // DELETE accessibility (no INSERT)
      .mockResolvedValueOnce({ rows: [] }) // DELETE image
      .mockResolvedValueOnce({ rows: [] }) // INSERT image
      .mockResolvedValueOnce({ rows: [venueRow] }); // SELECT updated
    const poolQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository(
      { transaction: vi.fn(async (work: (c: { query: typeof txQuery }) => Promise<unknown>) => work({ query: txQuery })), query: poolQuery } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );
    const result = await repository.update(ownerUserId, venueId, input);
    expect(result.kind).toBe('updated');
    const sqls = txQuery.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some((s: string) => s.includes('INSERT INTO venue_images'))).toBe(true);
  });

  /** VEN-UPD-07-B-REPO-SUP: SELECT after UPDATE returns no row — returns not-found (covers the !updated.rows[0] branch). */
  it('VEN-UPD-07-B-REPO-SUP returns not-found when the SELECT after UPDATE returns no row', async () => {
    const fullLockRow = { id: venueId, owner_user_id: ownerUserId, capacity: venueInput.capacity, setup_time_minutes: venueInput.setupTimeMinutes, turnaround_time_minutes: venueInput.turnaroundTimeMinutes };
    const txQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [fullLockRow] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE venues
      .mockResolvedValueOnce({ rows: [] }) // DELETE facilities
      .mockResolvedValueOnce({ rows: [] }) // INSERT facilities
      .mockResolvedValueOnce({ rows: [] }) // DELETE layouts
      .mockResolvedValueOnce({ rows: [] }) // INSERT layouts
      .mockResolvedValueOnce({ rows: [] }) // DELETE accessibility
      .mockResolvedValueOnce({ rows: [] }) // DELETE image
      .mockResolvedValueOnce({ rows: [] }); // SELECT updated — empty (venue gone)
    const poolQuery = vi.fn();
    const repository = new VenuesRepository(
      { transaction: vi.fn(async (work: (c: { query: typeof txQuery }) => Promise<unknown>) => work({ query: txQuery })), query: poolQuery } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );
    const result = await repository.update(ownerUserId, venueId, venueInput);
    expect(result).toEqual({ kind: 'not-found' });
  });

  describe('submitTentativeHoldRequest', () => {
    const holdVenueId = 'c1d2e3f4-1234-5678-abcd-000000000001';
    const holdCoordinatorId = 'coord000-0000-0000-0000-000000000001';
    const holdInput = { eventId: 'eeeeeeee-0000-0000-0000-000000000001' };
    const holdNow = new Date('2030-01-01T00:00:00.000Z');
    const safeStart = new Date('2030-01-20T00:00:00.000Z');
    const safeEnd = new Date('2030-01-20T01:00:00.000Z');
    const holdVenueRow = { id: holdVenueId, setup_time_minutes: 30, turnaround_time_minutes: 45 };
    const holdEventRow = { id: holdInput.eventId, status: 'Planning', start_date_time: safeStart, end_date_time: safeEnd };

    function makeHoldRepo(queries: { rows: unknown[] }[], now = holdNow) {
      const txQuery = vi.fn();
      queries.forEach((q) => txQuery.mockResolvedValueOnce(q));
      return {
        txQuery,
        repository: new VenuesRepository(
          { transaction: vi.fn(async (work: (c: { query: typeof txQuery }) => Promise<unknown>) => work({ query: txQuery })) } as unknown as DatabaseService,
          { now: () => now },
        ),
      };
    }

    /** VEN-UPD-08-A-REPO-SUP2: venue row absent → venue-not-found (covers line 995 TRUE branch). */
    it('VEN-UPD-08-A-REPO-SUP2 returns venue-not-found when the venue row is absent', async () => {
      const { repository } = makeHoldRepo([{ rows: [] }]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, holdInput);
      expect(result).toEqual({ kind: 'venue-not-found' });
    });

    /** VEN-UPD-08-B-REPO-SUP2: setup_time_minutes is null → configuration-unavailable (covers line 996 TRUE / short-circuit). */
    it('VEN-UPD-08-B-REPO-SUP2 returns configuration-unavailable when setup_time_minutes is null', async () => {
      const { repository } = makeHoldRepo([{ rows: [{ ...holdVenueRow, setup_time_minutes: null }] }]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, holdInput);
      expect(result).toEqual({ kind: 'configuration-unavailable' });
    });

    /** VEN-UPD-08-B-REPO-SUP3: turnaround_time_minutes is null → configuration-unavailable (covers line 997 TRUE branch). */
    it('VEN-UPD-08-B-REPO-SUP3 returns configuration-unavailable when turnaround_time_minutes is null', async () => {
      const { repository } = makeHoldRepo([{ rows: [{ ...holdVenueRow, turnaround_time_minutes: null }] }]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, holdInput);
      expect(result).toEqual({ kind: 'configuration-unavailable' });
    });

    /** VEN-UPD-08-C-REPO-SUP2: event query returns empty → event-not-assigned (covers line 1013 TRUE branch). */
    it('VEN-UPD-08-C-REPO-SUP2 returns event-not-assigned when the event is not assigned to the coordinator', async () => {
      const { repository } = makeHoldRepo([{ rows: [holdVenueRow] }, { rows: [] }]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, holdInput);
      expect(result).toEqual({ kind: 'event-not-assigned' });
    });

    /** VEN-UPD-08-D-REPO-SUP: event status not bookable → event-not-open (covers line 1014 TRUE branch). */
    it('VEN-UPD-08-D-REPO-SUP returns event-not-open when the event status is not in the bookable set', async () => {
      const { repository } = makeHoldRepo([
        { rows: [holdVenueRow] },
        { rows: [{ ...holdEventRow, status: 'Pending' }] },
      ]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, holdInput);
      expect(result).toEqual({ kind: 'event-not-open', status: 'Pending' });
    });

    /** VEN-UPD-08-E-REPO-SUP: event starts within 336 h → lead-time (covers line 1020 TRUE branch). */
    it('VEN-UPD-08-E-REPO-SUP returns lead-time when the event starts within the 336-hour lead window', async () => {
      // now=2030-01-01T00:00Z, start=2030-01-12T04:00Z → occupiedStart=2030-01-12T03:30Z → diff=267.5h < 336h
      const nearStart = new Date('2030-01-12T04:00:00.000Z');
      const { repository } = makeHoldRepo([
        { rows: [holdVenueRow] },
        { rows: [{ ...holdEventRow, start_date_time: nearStart, end_date_time: new Date('2030-01-12T05:00:00.000Z') }] },
      ]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, holdInput);
      expect(result).toEqual({ kind: 'lead-time' });
    });

    /** VEN-UPD-08-F-REPO-SUP: active booking request present → already-requested (covers line 1033 TRUE branch). */
    it('VEN-UPD-08-F-REPO-SUP returns already-requested when an active booking request already exists', async () => {
      const { repository } = makeHoldRepo([
        { rows: [holdVenueRow] },
        { rows: [holdEventRow] },
        { rows: [{ status: 'pending' }] },
      ]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, holdInput);
      expect(result).toEqual({ kind: 'already-requested', status: 'pending' });
    });

    /** VEN-UPD-08-G-REPO-SUP: conflict query returns a row → conflict (covers line 1069 TRUE branch). */
    it('VEN-UPD-08-G-REPO-SUP returns conflict when a scheduling conflict is found', async () => {
      const { repository } = makeHoldRepo([
        { rows: [holdVenueRow] },
        { rows: [holdEventRow] },
        { rows: [] },
        { rows: [{ reason: 'Existing booking' }] },
      ]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, holdInput);
      expect(result).toEqual({ kind: 'conflict', reason: 'Existing booking' });
    });

    /** VEN-UPD-08-H-REPO-SUP: success without specialRequest → created (covers line 1082 undefined ?? null branch). */
    it('VEN-UPD-08-H-REPO-SUP returns created when all checks pass and no special request is given', async () => {
      const bookingId = 'b00k1d00-0000-0000-0000-000000000001';
      const { repository } = makeHoldRepo([
        { rows: [holdVenueRow] },
        { rows: [holdEventRow] },
        { rows: [] },
        { rows: [] },
        { rows: [{ id: bookingId, start_at: safeStart, end_at: safeEnd }] },
        { rows: [] },
      ]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, holdInput);
      expect(result).toEqual({ kind: 'created', id: bookingId, start: safeStart.toISOString(), end: safeEnd.toISOString(), specialRequest: undefined });
    });

    /** VEN-UPD-08-H-REPO-SUP2: success with specialRequest → created (covers line 1082 string ?? null branch). */
    it('VEN-UPD-08-H-REPO-SUP2 returns created and includes the specialRequest when one is provided', async () => {
      const bookingId = 'b00k1d00-0000-0000-0000-000000000002';
      const { repository } = makeHoldRepo([
        { rows: [holdVenueRow] },
        { rows: [holdEventRow] },
        { rows: [] },
        { rows: [] },
        { rows: [{ id: bookingId, start_at: safeStart, end_at: safeEnd }] },
        { rows: [] },
      ]);
      const result = await repository.submitTentativeHoldRequest(holdVenueId, holdCoordinatorId, { ...holdInput, specialRequest: 'Quiet setup please' });
      expect(result).toEqual({ kind: 'created', id: bookingId, start: safeStart.toISOString(), end: safeEnd.toISOString(), specialRequest: 'Quiet setup please' });
    });
  });
});

/*
 * SPM-125 Manage Venue Unavailability Impact, History and Notifications. Unit tests of the repository in isolation:
 * the database is a fixture that records each statement, and the Venue Staff member is a fixture id, not a login.
 */
describe('SPM-125 venue unavailability history and notifications', () => {
  const now = new Date('2030-01-01T00:00:00Z');
  const actorId = '8ff4073d-8baa-4d32-984e-b93a46cbe49d';
  const period = {
    start: new Date('2030-01-12T04:00:00Z'),
    end: new Date('2030-01-12T05:00:00Z'),
    reason: 'Maintenance',
  };
  const affectedRow = (overrides: Record<string, unknown>) => ({
    venue_id: venue.id,
    start_at: new Date('2030-01-12T04:10:00Z'),
    end_at: new Date('2030-01-12T04:50:00Z'),
    status: 'approved',
    request_kind: 'booking',
    hold_expires_at: null,
    ...overrides,
  });

  /** Runs markUnavailable against a recording client returning the given affected rows. */
  async function markWith(rows: unknown[]) {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: venue.id, name: 'Orchid Hall' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'period-1', start_at: period.start, end_at: period.end, reason: period.reason }],
      })
      .mockResolvedValueOnce({ rows })
      .mockResolvedValue({ rows: [] });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => now },
    );
    const result = await repository.markUnavailable(venue.id, period, actorId);
    const notices = query.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT INTO notifications'))
      .map(([, params]) => params as unknown[]);
    return { result, query, notices };
  }

  /**
   * VEN-IMPACT-01-A (AC1): the period and its 'created' history entry, naming the Venue Staff member, are written by
   * one statement, so a saved period always has its history entry.
   */
  it('VEN-IMPACT-01-A records the created period and its history entry with the Venue Staff member in one statement', async () => {
    const { query } = await markWith([]);

    const [sql, params] = query.mock.calls[1];
    expect(String(sql)).toContain('INSERT INTO venue_bookings');
    expect(String(sql)).toContain('INSERT INTO venue_unavailability_history');
    expect(String(sql).replace(/\s+/g, ' ')).toContain("SELECT venue_id, id, 'created', start_at, end_at, reason, $5::uuid FROM saved");
    expect(params).toEqual([venue.id, period.start, period.end, period.reason, actorId]);
  });

  /**
   * VEN-IMPACT-06-B (AC6): the Coordinators of exactly the bookings SPM-122 AC7 lists (a confirmed booking and an
   * active hold) are notified; a pending booking request without a hold is neither listed nor notified; each listed
   * booking says whether its Coordinator was notified; the Venue Staff member gets no notice (SC-SPM125-01).
   */
  it('VEN-IMPACT-06-B notifies the Coordinators of the listed affected bookings only and marks them notified', async () => {
    const { result, notices } = await markWith([
      affectedRow({ id: 'confirmed', event_id: 'event-1', event_name: 'Confirmed event', coordinator_id: 'coordinator-1' }),
      affectedRow({
        id: 'active-hold', event_id: 'event-2', event_name: 'Active hold', coordinator_id: 'coordinator-2',
        request_kind: 'tentative_hold', hold_expires_at: new Date('2030-01-05T00:00:00Z'),
      }),
      affectedRow({
        id: 'pending-request', event_id: 'event-3', event_name: 'Pending request', coordinator_id: 'coordinator-3',
        status: 'pending', hold_expires_at: null,
      }),
      affectedRow({ id: 'no-coordinator', event_id: 'event-4', event_name: 'Unassigned', coordinator_id: null }),
    ]);

    // Each notice links its booking (6th value); none goes to the Venue Staff member who saved the period.
    expect(notices.map((p) => [p[1], p[2], p[5]])).toEqual([
      ['coordinator-1', 'venue_unavailable_impact', 'confirmed'],
      ['coordinator-2', 'venue_unavailable_impact', 'active-hold'],
    ]);
    expect(notices[0][3]).toBe(
      'Orchid Hall is unavailable from 12 Jan 2030, 12:00 pm – 1:00 pm (reason: Maintenance). ' +
        'Alternative arrangements are required for your booking for "Confirmed event" (12 Jan 2030, 12:10 pm – 12:50 pm).',
    );
    expect(result?.affectedBookings.map((b) => [b.id, b.coordinatorNotified])).toEqual([
      ['confirmed', true],
      ['active-hold', true],
      ['no-coordinator', undefined],
    ]);
  });

  /**
   * VEN-IMPACT-01-B (AC1): ending a period early updates it and writes its 'ended_early' entry (new end, the end it
   * replaced and the Venue Staff member) in one statement at the server time.
   */
  it('VEN-IMPACT-01-B records an early end with the previous end and the Venue Staff member in the same statement', async () => {
    const endedAt = new Date('2030-01-12T04:30:00Z');
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ id: 'period-1', start_at: period.start, end_at: endedAt, reason: period.reason }],
    });
    const repository = new VenuesRepository({ query } as unknown as DatabaseService, { now: () => endedAt });

    await expect(repository.endUnavailable(venue.id, 'period-1', actorId)).resolves.toEqual({
      id: 'period-1',
      start: period.start.toISOString(),
      end: endedAt.toISOString(),
      reason: period.reason,
    });
    const sql = String(query.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('end_at AS previous_end_at');
    expect(sql).toContain("SELECT venue_id, id, 'ended_early', start_at, end_at, previous_end_at, reason, $4::uuid, $3::timestamptz FROM ended");
    expect(query.mock.calls[0][1]).toEqual([venue.id, 'period-1', endedAt, actorId]);
  });

  /**
   * VEN-IMPACT-01-C (AC1): the history lists each entry newest first with its period, reason, who made the change
   * and when; an early end also gives the end it replaced; a backfilled entry has no person ("Not recorded").
   */
  it('VEN-IMPACT-01-C lists history entries with the period, reason, person and time, newest first', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: venue.id }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'h-2', period_id: 'period-1', action: 'ended_early', start_at: period.start,
            end_at: new Date('2030-01-12T04:30:00Z'), previous_end_at: period.end, reason: 'Maintenance',
            changed_by: 'Venue Staff 2', created_at: new Date('2030-01-12T04:30:00Z'),
          },
          {
            id: 'h-1', period_id: 'period-1', action: 'created', start_at: period.start, end_at: period.end,
            previous_end_at: null, reason: 'Maintenance', changed_by: null, created_at: new Date('2030-01-01T00:00:00Z'),
          },
        ],
      });
    const repository = new VenuesRepository({ query } as unknown as DatabaseService);

    await expect(repository.listUnavailabilityHistory(venue.id)).resolves.toEqual([
      {
        id: 'h-2', periodId: 'period-1', action: 'ended_early', start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T04:30:00.000Z', previousEnd: '2030-01-12T05:00:00.000Z', reason: 'Maintenance',
        changedBy: 'Venue Staff 2', changedAt: '2030-01-12T04:30:00.000Z',
      },
      {
        id: 'h-1', periodId: 'period-1', action: 'created', start: '2030-01-12T04:00:00.000Z',
        end: '2030-01-12T05:00:00.000Z', reason: 'Maintenance', changedBy: null, changedAt: '2030-01-01T00:00:00.000Z',
      },
    ]);
    const sql = String(query.mock.calls[1][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('ORDER BY h.created_at DESC, h.id');
    expect(sql).toContain('LEFT JOIN users u ON u.id = h.actor_user_id');
    expect(query.mock.calls[1][1]).toEqual([venue.id]);
  });

  /** VEN-IMPACT-01-BND-1, VEN-IMPACT-05-BND-1 (AC1, AC5): an unknown venue has no history and nothing more is read. */
  it('VEN-IMPACT-01-BND-1 VEN-IMPACT-05-BND-1 returns undefined for an unknown venue without reading history', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new VenuesRepository({ query } as unknown as DatabaseService);

    await expect(repository.listUnavailabilityHistory(venue.id)).resolves.toBeUndefined();
    await expect(repository.listBookingHistory(venue.id)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });

  /**
   * VEN-IMPACT-05-A (AC5): the booking history lists every booking and hold at the venue whatever its status or
   * time (only unavailable periods are left out), latest slot first, with its reference, Coordinator, hold expiry and
   * whether it overlaps an unavailable period.
   */
  it('VEN-IMPACT-05-A lists every booking and hold of the venue with its status and unavailable-period overlap', async () => {
    const base = { event_id: 'event-1', event_name: 'Gala', created_at: new Date('2029-12-01T00:00:00Z') };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: venue.id }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...base, id: 'hold', booking_reference: 'VB-HOLD0001', coordinator_name: 'Coordinator 1',
            start_at: period.start, end_at: period.end, status: 'approved', request_kind: 'tentative_hold',
            hold_expires_at: new Date('2030-01-05T00:00:00Z'), affected: true,
          },
          {
            ...base, id: 'past', booking_reference: 'VB-PAST0001', coordinator_name: null,
            start_at: new Date('2029-06-01T00:00:00Z'), end_at: new Date('2029-06-01T02:00:00Z'), status: 'cancelled',
            request_kind: 'booking', hold_expires_at: null, affected: false,
          },
        ],
      });
    const repository = new VenuesRepository({ query } as unknown as DatabaseService);

    await expect(repository.listBookingHistory(venue.id)).resolves.toEqual([
      {
        id: 'hold', bookingReference: 'VB-HOLD0001', eventId: 'event-1', eventName: 'Gala',
        coordinatorName: 'Coordinator 1', start: '2030-01-12T04:00:00.000Z', end: '2030-01-12T05:00:00.000Z',
        status: 'approved', requestKind: 'tentative_hold', holdExpiresAt: '2030-01-05T00:00:00.000Z',
        affectedByUnavailablePeriod: true, requestedAt: '2029-12-01T00:00:00.000Z',
      },
      {
        id: 'past', bookingReference: 'VB-PAST0001', eventId: 'event-1', eventName: 'Gala', coordinatorName: null,
        start: '2029-06-01T00:00:00.000Z', end: '2029-06-01T02:00:00.000Z', status: 'cancelled',
        requestKind: 'booking', affectedByUnavailablePeriod: false, requestedAt: '2029-12-01T00:00:00.000Z',
      },
    ]);
    const sql = String(query.mock.calls[1][0]).replace(/\s+/g, ' ');
    expect(sql).toContain("WHERE b.venue_id = $1::uuid AND b.status <> 'blocked'");
    expect(sql).toContain('ORDER BY b.start_at DESC, b.id');
    expect(sql).not.toMatch(/end_at\s*>\s*\$2/);
  });
});

/*
 * SPM-125 AC8 and AC9: venue edits (SPM-121) notify the Coordinators of the bookings SPM-121 AC8 and AC9 list.
 * Unit tests of repository.update in isolation; the database is a recording fixture.
 */
describe('SPM-125 venue update notifications', () => {
  const venueId = '00000000-0000-4000-8000-000000000125';
  const ownerUserId = '8ff4073d-8baa-4d32-984e-b93a46cbe49d';
  const now = new Date('2030-01-10T12:00:00.000Z');
  const input = {
    name: 'Updated Hall', location: 'Block B', capacity: 80, facilities: [], accessibility: [], layouts: [],
    operatingInformation: 'Open daily', setupTimeMinutes: 60, turnaroundTimeMinutes: 45,
  };
  const upcoming = {
    id: 'upcoming', event_id: 'event-1', event_name: 'Workshop', coordinator_id: 'coordinator-1', status: 'approved',
    start_at: new Date('2030-04-01T09:00:00.000Z'), end_at: new Date('2030-04-01T11:00:00.000Z'),
  };
  const ended = {
    id: 'ended', event_id: 'event-2', event_name: 'Old Workshop', coordinator_id: 'coordinator-2', status: 'approved',
    start_at: new Date('2030-01-09T09:00:00.000Z'), end_at: now,
  };

  /** Runs update() routing each statement by its SQL; returns the notification inserts. */
  async function updateWith(lock: { capacity: number; setup: number; turnaround: number }, rows: { timing?: unknown[]; capacity?: unknown[] }) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FOR UPDATE'))
        return { rows: [{ id: venueId, owner_user_id: ownerUserId, capacity: lock.capacity, setup_time_minutes: lock.setup, turnaround_time_minutes: lock.turnaround }] };
      if (sql.includes("b.status IN ('pending', 'approved')")) return { rows: rows.capacity ?? [] };
      if (sql.includes('venue_booking_requests')) return { rows: rows.timing ?? [] };
      if (sql.includes('FROM venues v LEFT JOIN venue_images'))
        return { rows: [{ id: venueId, owner_user_id: ownerUserId, name: input.name, location: input.location, capacity: input.capacity, facilities: [], accessibility: [], layouts: [], operating_information: input.operatingInformation, setup_time_minutes: input.setupTimeMinutes, turnaround_time_minutes: input.turnaroundTimeMinutes }] };
      return { rows: [] };
    });
    const repository = new VenuesRepository(
      {
        transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
      } as unknown as DatabaseService,
      { now: () => now },
    );
    const result = await repository.update(ownerUserId, venueId, input);
    const notices = query.mock.calls
      .filter(([sql]) => sql.includes('INSERT INTO notifications'))
      .map((call) => (call as unknown as [string, unknown[]])[1]);
    const capacityQuery = query.mock.calls.find(([sql]) => sql.includes("b.status IN ('pending', 'approved')")) as
      | [string, unknown[]]
      | undefined;
    return { result, notices, capacityQuery };
  }

  /**
   * VEN-IMPACT-08-B (AC8): after a setup change, the Coordinator of each booking SPM-121 AC8 lists that has not ended
   * gets a `venue_timing_impact` notice for that booking, and nobody else; the listing marks it notified.
   */
  it('VEN-IMPACT-08-B notifies the Coordinators of upcoming bookings that now conflict after a setup change', async () => {
    const { result, notices } = await updateWith({ capacity: input.capacity, setup: 30, turnaround: 45 }, { timing: [upcoming] });

    expect(notices.map((p) => [p[1], p[2], p[4], p[5]])).toEqual([
      ['coordinator-1', 'venue_timing_impact', 'event-1', 'upcoming'],
    ]);
    expect(result.kind === 'updated' && result.affectedBookings).toEqual([
      expect.objectContaining({ bookingId: 'upcoming', coordinatorNotified: true }),
    ]);
  });

  /**
   * VEN-IMPACT-09-BND-3 (AC9): a listed row that no longer holds the venue (here an approved tentative hold that has
   * expired) is still listed but its Coordinator is not notified; the capacity query decides this with the AC8
   * eligibility rule at the server time.
   * Kills: notifying every pending or approved row, including expired holds.
   */
  it('VEN-IMPACT-09-BND-3 lists but does not notify an expired hold after a capacity change', async () => {
    const expiredHold = { ...upcoming, id: 'expired-hold', event_name: 'Held Fair', coordinator_id: 'coordinator-3', holds_venue: false };
    const { result, notices, capacityQuery } = await updateWith(
      { capacity: 120, setup: input.setupTimeMinutes, turnaround: input.turnaroundTimeMinutes },
      { capacity: [{ ...upcoming, holds_venue: true }, expiredHold] },
    );

    expect(notices.map((p) => [p[1], p[5]])).toEqual([['coordinator-1', 'upcoming']]);
    if (result.kind !== 'updated') throw new Error('expected an update');
    expect(result.capacityBookings.map((b) => [b.bookingId, b.coordinatorNotified ?? false])).toEqual([
      ['upcoming', true],
      ['expired-hold', false],
    ]);
    const sql = capacityQuery![0].replace(/\s+/g, ' ');
    expect(sql).toContain("b.hold_expires_at IS NULL OR b.hold_expires_at > $2::timestamptz");
    expect(sql).toContain('AS holds_venue');
    expect(capacityQuery![1]).toEqual([venueId, now]);
  });

  /**
   * VEN-IMPACT-08-BND-1, VEN-IMPACT-09-BND-1 (AC8, AC9): a listed booking that has already ended (end equals now) is
   * still listed but its Coordinator is not notified.
   */
  it('VEN-IMPACT-08-BND-1 VEN-IMPACT-09-BND-1 lists but does not notify a booking that has ended', async () => {
    const { result, notices } = await updateWith({ capacity: 120, setup: 30, turnaround: 45 }, { timing: [ended], capacity: [ended] });

    expect(notices).toEqual([]);
    if (result.kind !== 'updated') throw new Error('expected an update');
    expect(result.affectedBookings).toEqual([expect.objectContaining({ bookingId: 'ended' })]);
    expect(result.affectedBookings[0]).not.toHaveProperty('coordinatorNotified');
    expect(result.capacityBookings[0]).not.toHaveProperty('coordinatorNotified');
  });

  /**
   * VEN-IMPACT-09-B (AC9): after a capacity change, the Coordinator of each upcoming pending or approved booking gets
   * a `venue_capacity_impact` notice giving the old and new capacity, and nobody else is notified.
   */
  it('VEN-IMPACT-09-B notifies the Coordinators of upcoming bookings of a capacity change with old and new values', async () => {
    const { result, notices } = await updateWith(
      { capacity: 120, setup: input.setupTimeMinutes, turnaround: input.turnaroundTimeMinutes },
      { capacity: [upcoming, ended] },
    );

    expect(notices.map((p) => [p[1], p[2]])).toEqual([
      ['coordinator-1', 'venue_capacity_impact'],
    ]);
    expect(notices[0][3]).toBe(
      'The capacity of Updated Hall changed from 120 to 80. Check that your booking for "Workshop" ' +
        '(1 Apr 2030, 5:00 pm – 7:00 pm) still suits your expected attendance.',
    );
    if (result.kind !== 'updated') throw new Error('expected an update');
    expect(result.capacityBookings.map((b) => [b.bookingId, b.coordinatorNotified])).toEqual([
      ['upcoming', true],
      ['ended', undefined],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// SPM-134 (tentative hold expiry notifications, Coordinator): HOLD-EXP-NOTIF-01-C, 01-D, 01-E, 02-A, 02-B, 02-C, 03-A,
// 03-B, 03-C, 03-D, 11-A, 11-B, 11-C, 11-D. The repository is tested in isolation: the transaction client answers from a fixed sequence of
// fixture rows, so these cases show which statements run, in what order and inside which transaction. PostgreSQL is
// exercised by test/tentative-hold-lifecycle-notifications.e2e-spec.ts.
// ---------------------------------------------------------------------------------------------------------------------
describe('SPM-134 hold lifecycle notifications in the venue repository', () => {
  const staffId = ownerUserId;
  const holdId = '6f0d6f3a-2c1e-4b59-9d8a-0c3b7e1f2a44';
  const now = new Date('2030-01-10T12:00:00.000Z');
  const expiry = new Date('2030-01-12T11:00:00.000Z');
  const norm = (sql: unknown) => String(sql).replace(/\s+/g, ' ');
  const context = (overrides: Record<string, unknown> = {}) => ({
    rows: [{ coordinator_id: 'coord-assigned', event_id: 'event-1', event_name: 'Gala Night', event_status: 'Planning', venue_name: 'Orchid Hall', ...overrides }],
  });
  const activeHold = {
    id: holdId, event_id: 'event-1', venue_id: venue.id, status: 'approved', start_at: new Date('2030-03-01T10:00:00.000Z'),
    end_at: new Date('2030-03-01T11:00:00.000Z'), rejection_reason: null, request_kind: 'tentative_hold',
    hold_expires_at: new Date('2030-01-24T12:00:00.000Z'), reassessment_required: false, event_start: new Date('2030-03-01T10:00:00.000Z'),
    event_status: 'Planning',
  };
  const ownedRow = { rows: [{ venue_id: venue.id }] };
  const venueLockRow = { rows: [{ id: venue.id, setup_time_minutes: 30, turnaround_time_minutes: 45 }] };

  /**
   * Models DatabaseService.transaction: BEGIN, the work, COMMIT on success, ROLLBACK then rethrow on failure. A queued
   * Error is thrown by that statement. BEGIN, COMMIT and ROLLBACK do not consume queued responses.
   */
  function createRepository(...steps: Array<{ rows: unknown[] } | Error>) {
    const queue = [...steps];
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      const next = queue.shift() ?? { rows: [] };
      if (next instanceof Error) throw next;
      return next;
    });
    const poolQuery = vi.fn().mockResolvedValue({ rows: [] });
    const database = {
      query: poolQuery,
      transaction: async (work: (tx: unknown) => Promise<unknown>) => {
        await clientQuery('BEGIN');
        try {
          const result = await work({ query: clientQuery });
          await clientQuery('COMMIT');
          return result;
        } catch (error) {
          await clientQuery('ROLLBACK');
          throw error;
        }
      },
    };
    return { repository: new VenuesRepository(database as unknown as DatabaseService, { now: () => now }), clientQuery, poolQuery };
  }
  const sqlsOf = (clientQuery: { mock: { calls: unknown[][] } }) => (clientQuery.mock.calls as Array<[string]>).map(([sql]) => norm(sql));
  const noticeInserts = (clientQuery: { mock: { calls: unknown[][] } }) =>
    (clientQuery.mock.calls as Array<[string, unknown[]]>).filter(([sql]) => sql.includes('INSERT INTO notifications'));

  /**
   * HOLD-EXP-NOTIF-01-C (SPM-134 AC1, AC5): the reminder run marks, in one conditional UPDATE, only approved tentative
   * holds that are not yet processed, not yet reminded, not yet expired and expire within 48 hours, on a non-cancelled
   * event, and writes one reminder for each hold the UPDATE returns, in the same transaction and stamped with the run time.
   * Kills: a reminder without the marker, any dropped guard, a notice written outside the transaction, a wrong timestamp.
   */
  it('HOLD-EXP-NOTIF-01-C marks the due holds once and writes one reminder per marked hold in the same transaction', async () => {
    const { repository, clientQuery, poolQuery } = createRepository(
      { rows: [{ id: holdId, hold_expires_at: expiry }, { id: 'hold-2', hold_expires_at: expiry }] },
      context(), { rows: [] },
      context({ event_id: 'event-2' }), { rows: [] },
    );

    await expect(repository.processTentativeHoldReminders()).resolves.toEqual([holdId, 'hold-2']);

    const [mark, markParams] = (clientQuery.mock.calls as unknown as Array<[string, unknown[]]>)[1];
    const sql = norm(mark);
    expect(sql).toContain('UPDATE venue_bookings b SET hold_reminder_sent_at = $1::timestamptz');
    for (const guard of [
      "b.request_kind = 'tentative_hold'", "b.status = 'approved'", 'b.hold_expiry_processed_at IS NULL',
      'b.hold_reminder_sent_at IS NULL', 'b.hold_expires_at > $1::timestamptz',
      "b.hold_expires_at <= $1::timestamptz + interval '48 hours'", "e.status <> 'Cancelled'",
    ]) expect(sql).toContain(guard);
    expect(markParams).toEqual([now]);
    expect(poolQuery).not.toHaveBeenCalled();
    const inserts = noticeInserts(clientQuery);
    expect(inserts.map(([, params]) => [params[2], params[5], params[6]])).toEqual([
      ['tentative_hold_expiry_reminder', holdId, now],
      ['tentative_hold_expiry_reminder', 'hold-2', now],
    ]);
    expect(inserts[0][1][3]).toBe('Your tentative hold of Orchid Hall for "Gala Night" expires on 12 Jan 2030, 19:00 SGT.');
    expect(sqlsOf(clientQuery).at(-1)).toBe('COMMIT');
  });

  /**
   * HOLD-EXP-NOTIF-01-D (SPM-134 AC1, AC5): when no hold is due the run writes nothing and returns no ids.
   * Kills: inserting without a marked hold.
   */
  it('HOLD-EXP-NOTIF-01-D writes no notification when no hold is due for a reminder', async () => {
    const { repository, clientQuery } = createRepository({ rows: [] });

    await expect(repository.processTentativeHoldReminders(new Date('2030-01-01T00:00:00.000Z'))).resolves.toEqual([]);

    expect(noticeInserts(clientQuery)).toHaveLength(0);
  });

  /**
   * HOLD-EXP-NOTIF-01-E (SPM-134 AC1): a failed reminder insert rolls the marker back too (ROLLBACK, no COMMIT), so the
   * next run sends the reminder instead of losing it.
   * Kills: marking the hold outside the notice's transaction, swallowing the error.
   */
  it('HOLD-EXP-NOTIF-01-E rolls the reminder marker back when the notification insert fails', async () => {
    const { repository, clientQuery } = createRepository(
      { rows: [{ id: holdId, hold_expires_at: expiry }] }, context(), new Error('insert failed'),
    );

    await expect(repository.processTentativeHoldReminders()).rejects.toThrow('insert failed');

    const sqls = sqlsOf(clientQuery);
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });

  /**
   * HOLD-EXP-NOTIF-02-A (SPM-134 AC2, AC4): the expiry run changes each elapsed approved hold to expired and writes one expired
   * notice for it, all inside one transaction (not on the pool), stamped with the hold's own expiry time (AC4: the notice's
   * timestamp for an expired hold is its expiry, not the run time) and naming it.
   * Kills: the old plain pool UPDATE, a notice written outside the transaction, a missing notice, a reminder wording.
   */
  it('HOLD-EXP-NOTIF-02-A expires the holds and writes one expired notice per hold in the same transaction', async () => {
    const { repository, clientQuery, poolQuery } = createRepository(
      { rows: [{ id: holdId, hold_expires_at: expiry }, { id: 'hold-2', hold_expires_at: expiry }] },
      context(), { rows: [] }, context(), { rows: [] },
    );

    await expect(repository.processExpiredTentativeHolds()).resolves.toEqual([holdId, 'hold-2']);

    const sql = norm((clientQuery.mock.calls as Array<[string]>)[1][0]);
    expect(sql).toContain("SET status = 'expired', hold_expiry_processed_at = $1::timestamptz");
    expect(sql).toContain('hold_expiry_processed_at IS NULL');
    expect(poolQuery).not.toHaveBeenCalled();
    const inserts = noticeInserts(clientQuery);
    expect(inserts.map(([, params]) => [params[2], params[5], params[6]])).toEqual([
      ['tentative_hold_expired', holdId, expiry],
      ['tentative_hold_expired', 'hold-2', expiry],
    ]);
    expect(inserts[0][1][3]).toBe('Your tentative hold of Orchid Hall for "Gala Night" expired on 12 Jan 2030, 19:00 SGT.');
    expect(sqlsOf(clientQuery).at(-1)).toBe('COMMIT');
  });

  /**
   * HOLD-EXP-NOTIF-02-B (SPM-134 AC2): with nothing to expire the run writes no notification.
   * Kills: a notice written without an expired hold.
   */
  it('HOLD-EXP-NOTIF-02-B writes no notification when no hold has expired', async () => {
    const { repository, clientQuery } = createRepository({ rows: [] });

    await expect(repository.processExpiredTentativeHolds()).resolves.toEqual([]);

    expect(noticeInserts(clientQuery)).toHaveLength(0);
  });

  /**
   * HOLD-EXP-NOTIF-02-C (SPM-134 AC2): a failed expired-notice insert rolls the status change back (ROLLBACK, no COMMIT):
   * a hold is never expired without its notice.
   * Kills: swallowing the notification error, committing the status change on its own.
   */
  it('HOLD-EXP-NOTIF-02-C rolls the expiry back when the notification insert fails', async () => {
    const { repository, clientQuery } = createRepository(
      { rows: [{ id: holdId, hold_expires_at: expiry }] }, context(), new Error('insert failed'),
    );

    await expect(repository.processExpiredTentativeHolds()).rejects.toThrow('insert failed');

    const sqls = sqlsOf(clientQuery);
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });

  /**
   * HOLD-EXP-NOTIF-03-A (SPM-134 AC3): releasing an active hold writes one released notice in the release transaction,
   * after the status change, stamped with the release time.
   * Kills: no notice, a notice before the UPDATE, a notice on the pool.
   */
  it('HOLD-EXP-NOTIF-03-A releasing an active hold writes one released notice in the same transaction', async () => {
    const { repository, clientQuery, poolQuery } = createRepository(ownedRow, venueLockRow, { rows: [activeHold] }, { rows: [{ id: holdId }] }, { rows: [] }, context(), { rows: [] });

    await expect(repository.releaseTentativeHold(staffId, holdId)).resolves.toMatchObject({ kind: 'updated', status: 'released' });

    const sqls = sqlsOf(clientQuery);
    expect(sqls.findIndex((s) => s.includes("SET status = 'released'"))).toBeLessThan(sqls.findIndex((s) => s.includes('INSERT INTO notifications')));
    const inserts = noticeInserts(clientQuery);
    expect(inserts).toHaveLength(1);
    expect([inserts[0][1][1], inserts[0][1][2], inserts[0][1][5], inserts[0][1][6]]).toEqual(['coord-assigned', 'tentative_hold_released', holdId, now]);
    expect(inserts[0][1][3]).toBe('Your tentative hold of Orchid Hall for "Gala Night" has been released.');
    expect(poolQuery).not.toHaveBeenCalled();
  });

  /**
   * HOLD-EXP-NOTIF-03-B (SPM-134 AC3): converting an active hold writes one converted notice in the conversion transaction.
   * Kills: no notice, the released type for a conversion.
   */
  it('HOLD-EXP-NOTIF-03-B converting an active hold writes one converted notice in the same transaction', async () => {
    const { repository, clientQuery } = createRepository(ownedRow, venueLockRow, { rows: [activeHold] }, { rows: [{ id: holdId }] }, { rows: [] }, context(), { rows: [] });

    await expect(repository.convertTentativeHold(staffId, holdId)).resolves.toMatchObject({ kind: 'updated', requestKind: 'booking' });

    const inserts = noticeInserts(clientQuery);
    expect(inserts).toHaveLength(1);
    expect([inserts[0][1][1], inserts[0][1][2], inserts[0][1][5], inserts[0][1][6]]).toEqual(['coord-assigned', 'tentative_hold_converted', holdId, now]);
    expect(inserts[0][1][3]).toBe('Your tentative hold of Orchid Hall for "Gala Night" has been confirmed as a booking.');
  });

  /**
   * HOLD-EXP-NOTIF-03-C (SPM-134 AC3): a release or conversion that is refused (not the staff member's hold, an expired
   * hold, a hold that is not active, a completed event) writes no notification.
   * Kills: notifying before the ownership and state checks.
   */
  it.each([
    ['not found', [{ rows: [] }]],
    ['already expired', [ownedRow, venueLockRow, { rows: [{ ...activeHold, status: 'expired' }] }]],
    ['expired by time', [ownedRow, venueLockRow, { rows: [{ ...activeHold, hold_expires_at: now }] }]],
    ['already released', [ownedRow, venueLockRow, { rows: [{ ...activeHold, status: 'released' }] }]],
    ['already converted', [ownedRow, venueLockRow, { rows: [{ ...activeHold, request_kind: 'booking' }] }]],
    ['on a completed event', [ownedRow, venueLockRow, { rows: [{ ...activeHold, event_status: 'Completed' }] }]],
  ] as Array<[string, Array<{ rows: unknown[] }>]>)('HOLD-EXP-NOTIF-03-C writes no notification when the hold is %s', async (_label, steps) => {
    for (const act of [(r: VenuesRepository) => r.releaseTentativeHold(staffId, holdId), (r: VenuesRepository) => r.convertTentativeHold(staffId, holdId)]) {
      const { repository, clientQuery } = createRepository(...steps);
      await act(repository);
      expect(noticeInserts(clientQuery)).toHaveLength(0);
    }
  });

  /**
   * HOLD-EXP-NOTIF-03-D (SPM-134 AC3): if the notice cannot be saved the release or conversion rolls back (ROLLBACK, no
   * COMMIT) and the call rejects, so the change is never saved without its notice.
   * Kills: swallowing the notification error.
   */
  it.each([
    ['release', (r: VenuesRepository) => r.releaseTentativeHold(staffId, holdId)],
    ['conversion', (r: VenuesRepository) => r.convertTentativeHold(staffId, holdId)],
  ])('HOLD-EXP-NOTIF-03-D rolls the %s back when the notification insert fails', async (_label, act) => {
    const { repository, clientQuery } = createRepository(ownedRow, venueLockRow, { rows: [activeHold] }, { rows: [{ id: holdId }] }, { rows: [] }, context(), new Error('insert failed'));

    await expect(act(repository)).rejects.toThrow('insert failed');

    const sqls = sqlsOf(clientQuery);
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });
  // ---- AC11 --------------------------------------------------------------------------------------------------------

  const markReadStatements = (clientQuery: { mock: { calls: unknown[][] } }) =>
    sqlsOf(clientQuery).filter((sql) => sql.startsWith('UPDATE notifications'));

  /**
   * HOLD-EXP-NOTIF-11-A (SPM-134 AC11): converting an active hold marks the Coordinator's unread reminders for that hold
   * read in the conversion transaction, after the status change and before the converted notice. The statement filters on
   * the hold, the reminder type and unread, and only updates (nothing is deleted).
   * Kills: no mark-read, a filter missing the booking, the type or the unread condition, a DELETE, a statement on the pool.
   */
  it('HOLD-EXP-NOTIF-11-A converting an active hold marks only its unread reminders read in the same transaction', async () => {
    const { repository, clientQuery, poolQuery } = createRepository(ownedRow, venueLockRow, { rows: [activeHold] }, { rows: [{ id: holdId }] }, { rows: [] }, context(), { rows: [] });

    await repository.convertTentativeHold(staffId, holdId);

    const sqls = sqlsOf(clientQuery);
    const marks = markReadStatements(clientQuery);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toContain('SET read = true');
    expect(marks[0]).toContain('related_booking_id = $1::uuid');
    expect(marks[0]).toContain('type = $2');
    expect(marks[0]).toContain('read = false');
    expect(sqls.some((sql) => sql.startsWith('DELETE FROM notifications'))).toBe(false);
    const call = (clientQuery.mock.calls as unknown as Array<[string, unknown[]]>).find(([sql]) => norm(sql).startsWith('UPDATE notifications'))!;
    // The reminder type is the exported constant, bound as the second parameter (not a SQL literal).
    expect(call[1]).toEqual([holdId, 'tentative_hold_expiry_reminder']);
    const at = (needle: string) => sqls.findIndex((sql) => sql.includes(needle));
    expect(at("SET request_kind = 'booking'")).toBeLessThan(at('UPDATE notifications'));
    expect(at('UPDATE notifications')).toBeLessThan(at('INSERT INTO notifications'));
    expect(poolQuery).not.toHaveBeenCalled();
  });

  /**
   * HOLD-EXP-NOTIF-11-B (SPM-134 AC11): releasing an active hold marks its unread reminders read in the release
   * transaction, with the same filter.
   * Kills: marking read only on the conversion path.
   */
  it('HOLD-EXP-NOTIF-11-B releasing an active hold marks only its unread reminders read in the same transaction', async () => {
    const { repository, clientQuery, poolQuery } = createRepository(ownedRow, venueLockRow, { rows: [activeHold] }, { rows: [{ id: holdId }] }, { rows: [] }, context(), { rows: [] });

    await repository.releaseTentativeHold(staffId, holdId);

    const marks = markReadStatements(clientQuery);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toContain('type = $2');
    expect(marks[0]).toContain('related_booking_id = $1::uuid');
    expect(marks[0]).toContain('read = false');
    const markCall = (clientQuery.mock.calls as unknown as Array<[string, unknown[]]>).find(([sql]) => norm(sql).startsWith('UPDATE notifications'))!;
    expect(markCall[1]).toEqual([holdId, 'tentative_hold_expiry_reminder']);
    const sqls = sqlsOf(clientQuery);
    expect(sqls.findIndex((sql) => sql.includes("SET status = 'released'"))).toBeLessThan(sqls.findIndex((sql) => sql.startsWith('UPDATE notifications')));
    expect(poolQuery).not.toHaveBeenCalled();
  });

  /**
   * HOLD-EXP-NOTIF-11-C (SPM-134 AC11): a refused release or conversion (not found, expired by status or time, already
   * released, already converted, completed event) marks nothing read.
   * Kills: marking read before the ownership and state checks.
   */
  it.each([
    ['not found', [{ rows: [] }]],
    ['already expired', [ownedRow, venueLockRow, { rows: [{ ...activeHold, status: 'expired' }] }]],
    ['expired by time', [ownedRow, venueLockRow, { rows: [{ ...activeHold, hold_expires_at: now }] }]],
    ['already released', [ownedRow, venueLockRow, { rows: [{ ...activeHold, status: 'released' }] }]],
    ['already converted', [ownedRow, venueLockRow, { rows: [{ ...activeHold, request_kind: 'booking' }] }]],
    ['on a completed event', [ownedRow, venueLockRow, { rows: [{ ...activeHold, event_status: 'Completed' }] }]],
  ] as Array<[string, Array<{ rows: unknown[] }>]>)('HOLD-EXP-NOTIF-11-C marks nothing read when the hold is %s', async (_label, steps) => {
    for (const act of [(r: VenuesRepository) => r.releaseTentativeHold(staffId, holdId), (r: VenuesRepository) => r.convertTentativeHold(staffId, holdId)]) {
      const { repository, clientQuery } = createRepository(...steps);
      await act(repository);
      expect(markReadStatements(clientQuery)).toHaveLength(0);
    }
  });

  /**
   * HOLD-EXP-NOTIF-11-D (SPM-134 AC11): if marking the reminders read fails, the release or conversion rolls back and the
   * call rejects, so a change is never saved with its reminder left unread.
   * Kills: swallowing the mark-read error, marking read outside the transaction.
   */
  it.each([
    ['release', (r: VenuesRepository) => r.releaseTentativeHold(staffId, holdId)],
    ['conversion', (r: VenuesRepository) => r.convertTentativeHold(staffId, holdId)],
  ])('HOLD-EXP-NOTIF-11-D rolls the %s back when marking the reminders read fails', async (_label, act) => {
    const { repository, clientQuery } = createRepository(ownedRow, venueLockRow, { rows: [activeHold] }, { rows: [{ id: holdId }] }, new Error('mark read failed'));

    await expect(act(repository)).rejects.toThrow('mark read failed');

    const sqls = sqlsOf(clientQuery);
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });
});
