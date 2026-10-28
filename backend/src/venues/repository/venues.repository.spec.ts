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
      expect(query.mock.calls[2][1]).toEqual([
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
    expect(result.affectedBookings).toContainEqual(
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
    });

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

  /** VEN-REV-01-A: the staff list covers pending, approved, and rejected requests for owned venues and maps request kind and expiry. */
  it('SPM-55 AC1 lists pending/approved/rejected requests for owned venues ordered by event start', async () => {
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
      "SELECT b.id, b.event_id, e.event_name, e.start_date_time AS event_start, e.end_date_time AS event_end, coordinator_user.display_name AS coordinator_name, v.name AS venue_name, 'VB-' || upper(substr(replace(b.id::text, '-', ''), 1, 8)) AS booking_reference, b.special_request, b.start_at, b.end_at, b.status, b.rejection_reason, b.request_kind, b.hold_expires_at, b.reassessment_required FROM venue_bookings b JOIN venues v ON v.id = b.venue_id JOIN events e ON e.id = b.event_id JOIN users coordinator_user ON coordinator_user.id::text = e.coordinator_id WHERE v.owner_user_id::text = $1::text AND b.status IN ('pending', 'approved', 'rejected') ORDER BY b.start_at ASC, b.id",
    );
    expect(params).toEqual([staffId]);
  });

  /** SPM-55 AC2 AC5: approval confirms a pending booking, checks blockouts and approved overlaps, and records the audit row. */
  it('approves a pending request and writes the audit row with the actor', async () => {
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
    expect(calls).toHaveLength(6);
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
      'SELECT b.id, b.event_id, b.venue_id, b.status, b.start_at, b.end_at, b.rejection_reason, b.request_kind, b.reassessment_required, e.start_date_time AS event_start FROM venue_bookings b LEFT JOIN events e ON e.id = b.event_id WHERE b.id = $1::uuid FOR UPDATE OF b',
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

  /** VEN-REV-02-B: approval refuses a slot that an approved booking or blockout already holds, and does not change the request. */
  it('SPM-55 AC2 refuses approval when an approved booking or blockout overlaps the slot', async () => {
    const { repository, query } = createReviewRepository(
      ownedRow,
      venueLockRow,
      bookingLockRow,
      { rows: [{ reason: 'Lecture Series' }] },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toEqual({
      kind: 'conflict',
      reason: 'Lecture Series',
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
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'decided' });
    expect(query).toHaveBeenCalledTimes(6);
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
    expect(query).toHaveBeenCalledTimes(6);
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
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository(
      { transaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) } as unknown as DatabaseService,
      { now: () => new Date('2030-01-10T12:00:00.000Z') },
    );

    await expect(repository.approveVenueBooking(staffId, bookingId)).resolves.toMatchObject({ kind: 'decided' });
    expect(query).toHaveBeenCalledTimes(6);
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
    expect(calls).toHaveLength(5);
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
      'SELECT b.id, b.event_id, b.venue_id, b.status, b.start_at, b.end_at, b.rejection_reason, b.request_kind, b.reassessment_required, e.start_date_time AS event_start FROM venue_bookings b LEFT JOIN events e ON e.id = b.event_id WHERE b.id = $1::uuid FOR UPDATE OF b',
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
    const updateAt = sqls.findIndex(
      (sql) => sql.includes('UPDATE venue_bookings') && sql.includes("SET status = 'approved'"),
    );
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
});
