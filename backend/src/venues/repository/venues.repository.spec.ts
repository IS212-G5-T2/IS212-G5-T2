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
              facilities: ['AV System'],
              accessibility: ['Wheelchair access'],
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
              required_facilities: [],
              accessibility_needs: [],
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
    expect(query.mock.calls[2][0]).toContain(
      "status IN ('pending', 'approved')",
    );
    expect(query.mock.calls[2][1]).toEqual([
      '00000000-0000-4000-8000-000000000099',
      venue.id,
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
      expect(String(query.mock.calls[2][0])).toContain(
        "status IN ('pending', 'approved')",
      );
      expect(query.mock.calls[2][1]).toEqual([
        '00000000-0000-4000-8000-000000000099',
        venue.id,
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
    expect(queries[2]).toContain("status IN ('pending', 'approved')");
    expect(queries[3]).toContain('b.hold_expires_at > $6::timestamptz');
    expect(queries[3]).toContain('FROM venue_booking_requests r');
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
      venue,
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
    ).resolves.toEqual({ ...venue, accessibility: [] });
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

  /** VEN-AVL-10-A/B/BND-1: expired and exact-expiry pending holds are excluded at the injected current time. */
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
      id,
      availabilityStatus: 'available',
      unavailablePeriods: [],
      reservations: [],
    });
    expect(missing).toBeUndefined();
    expect(readQuery.mock.calls[0][0]).toContain('v.id = $1::uuid');
    expect(readQuery.mock.calls[0][0]).not.toContain('v.owner_user_id');
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
      }),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
  });

  /** VEN-AVL-09-A/B: blockouts persist while affected confirmed bookings and active holds remain visible. */
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
    });

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
      ],
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toContain(
      "b.status = 'pending' AND b.hold_expires_at > $3::timestamptz",
    );
    expect(query.mock.calls[2][1]).toEqual([
      venue.id,
      new Date('2030-01-12T05:00:00Z'),
      now,
      new Date('2030-01-12T04:00:00Z'),
    ]);
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

    await expect(repository.endUnavailable(venue.id, row.id)).resolves.toEqual({
      id: row.id,
      start: row.start_at.toISOString(),
      end: now.toISOString(),
      reason: 'Maintenance',
    });
    await expect(
      repository.endUnavailable(venue.id, 'missing'),
    ).resolves.toBeUndefined();
    expect(query.mock.calls[0][1]).toEqual([venue.id, row.id, now]);
    expect(query.mock.calls[1][1]).toEqual([venue.id, 'missing', now]);
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
