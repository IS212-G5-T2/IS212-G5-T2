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

describe('VenuesRepository', () => {
  /** VEN-BKG-02: the backend rejects facility and capacity mismatches without inserting a request. */
  it('refuses an unsuitable venue before schedule or insert queries', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: venue.id, capacity: 25, setup_time_minutes: 0, turnaround_time_minutes: 0, facilities: [], accessibility: [], layouts: [] }] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1', status: 'Approved', expected_attendance: 30, required_facilities: ['Projector'], accessibility_needs: ['Ramp'], preferred_room_layout: 'Classroom' }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new VenuesRepository({ transaction: (work) => work({ query }) } as unknown as DatabaseService);
    await expect(repository.submitBookingRequest(venue.id, ownerUserId, {
      eventId: '00000000-0000-4000-8000-000000000001',
    })).resolves.toEqual({ kind: 'unsuitable', reasons: ['Capacity 25 is below required attendance 30.', 'Missing facility: Projector.', 'Missing accessibility feature: Ramp.', 'Required layout unavailable: Classroom.'] });
    expect(query).toHaveBeenCalledTimes(3);
  });

  /** VEN-BKG-01-BND-1: capacity equal to attendance is suitable (equality is not a mismatch). */
  it('allows a venue whose capacity exactly matches event attendance', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: venue.id, capacity: 30, setup_time_minutes: 0, turnaround_time_minutes: 0, facilities: [], accessibility: [], layouts: [] }] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1', status: 'Planning', expected_attendance: 30, required_facilities: [], accessibility_needs: [], preferred_room_layout: '', start_date_time: new Date('2030-01-12T04:00:00Z'), end_date_time: new Date('2030-01-12T05:00:00Z') }] })
      .mockResolvedValueOnce({ rows: [] }) // no permanent event/venue request
      .mockResolvedValueOnce({ rows: [] }) // no schedule conflict
      .mockResolvedValueOnce({ rows: [] }) // request association insert
      .mockResolvedValueOnce({ rows: [{ id: 'booking-1', start_at: new Date('2030-01-12T04:00:00Z'), end_at: new Date('2030-01-12T05:00:00Z') }] });
    const repository = new VenuesRepository({ transaction: (work) => work({ query }) } as unknown as DatabaseService);

    await expect(repository.submitBookingRequest(venue.id, ownerUserId, {
      eventId: '00000000-0000-4000-8000-000000000001',
    })).resolves.toMatchObject({ kind: 'created' });
    expect(query).toHaveBeenCalledTimes(6);
  });

  /** Only Approved and Planning events may reach availability checks and the venue-booking insert. */
  it.each(['Submitted', 'Draft', 'Rejected', 'Completed', 'Cancelled', 'Unexpected'])(
    'rejects a %s event before schedule checks or booking insertion',
    async (status) => {
      const query = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: venue.id, capacity: 120, setup_time_minutes: 0, turnaround_time_minutes: 0, facilities: [], accessibility: [], layouts: [] }] })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1', status, expected_attendance: 20, required_facilities: [], accessibility_needs: [], preferred_room_layout: '', start_date_time: new Date('2030-01-12T04:00:00Z'), end_date_time: new Date('2030-01-12T05:00:00Z') }] })
        .mockResolvedValueOnce({ rows: [] });
      const repository = new VenuesRepository({ transaction: (work) => work({ query }) } as unknown as DatabaseService);

      await expect(repository.submitBookingRequest(venue.id, ownerUserId, {
        eventId: '00000000-0000-4000-8000-000000000001',
      })).resolves.toEqual({ kind: 'event-not-open', status });
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO venue_bookings'))).toBe(false);
    },
  );

  /** VEN-BKG-10: the last active venue booking needs an explicit confirmation before cancellation. */
  it('requires confirmation before cancelling the last active event booking', async () => {
    const eventId = '00000000-0000-4000-8000-000000000001';
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ event_id: eventId }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ event_id: eventId }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'booking-1', event_id: eventId }] });
    const repository = new VenuesRepository({ transaction: (work) => work({ query }) } as unknown as DatabaseService);
    await expect(repository.cancelCoordinatorBooking(ownerUserId, 'booking-1')).resolves.toEqual({ kind: 'confirmation-required' });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'cancelled'"))).toBe(false);
    await expect(repository.cancelCoordinatorBooking(ownerUserId, 'booking-1', true)).resolves.toEqual({ id: 'booking-1', eventId, hasOtherActiveBookings: false });
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("SET status = 'cancelled'")).length).toBe(1);
    expect(String(query.mock.calls[0][0])).toContain('b.id = $1::uuid');
    expect(String(query.mock.calls[0][0])).toContain('e.coordinator_id = $2::text');
  });

  /** VEN-BKG-08: the session coordinator's list contains independent venue statuses and affected-booking detail. */
  it('maps every coordinator venue booking with its event, venue, status, and unavailable indicator', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: '00000000-0000-4000-8000-000000000099', event_id: 'event-1', event_name: 'Forum',
      venue_id: 'venue-1', venue_name: 'East Hall', start_at: new Date('2030-01-12T04:00:00Z'),
      end_at: new Date('2030-01-12T05:00:00Z'), status: 'pending', special_request: 'Ramp',
      created_at: new Date('2030-01-01T00:00:00Z'), affected: true,
    }] });
    const repository = new VenuesRepository({ query } as unknown as DatabaseService);
    await expect(repository.listCoordinatorBookings(ownerUserId)).resolves.toEqual([{
      id: '00000000-0000-4000-8000-000000000099', eventId: 'event-1', eventName: 'Forum',
      venueId: 'venue-1', venueName: 'East Hall', start: '2030-01-12T04:00:00.000Z',
      end: '2030-01-12T05:00:00.000Z', status: 'pending', specialRequests: 'Ramp',
      createdAt: '2030-01-01T00:00:00.000Z', affectedByUnavailablePeriod: true,
      bookingReference: 'VB-00000000',
    }]);
    expect(String(query.mock.calls[0][0])).toContain('WHERE e.coordinator_id = $1::text');
    expect(String(query.mock.calls[0][0])).toContain("b.status <> 'blocked'");
    expect(String(query.mock.calls[0][0])).toContain("x.status = 'blocked'");
    expect(String(query.mock.calls[0][0])).toContain('AS affected');
    expect(query.mock.calls[0][1]).toEqual([ownerUserId]);
  });

  /** VEN-BKG-08-A/SEC-1: retain each non-blocked status while scoping the list to the signed-in Coordinator. */
  it('returns multiple booking rows with distinct statuses and enforces coordinator ownership in SQL', async () => {
    const statuses = ['pending', 'approved', 'rejected', 'cancelled'] as const;
    const query = vi.fn().mockResolvedValue({ rows: statuses.map((status, index) => ({
      id: `booking-${index}`, event_id: 'event-1', event_name: 'Forum', venue_id: `venue-${index}`, venue_name: `Hall ${index}`,
      start_at: new Date('2030-01-12T04:00:00Z'), end_at: new Date('2030-01-12T05:00:00Z'), status,
      special_request: null, created_at: new Date('2030-01-01T00:00:00Z'), affected: false,
    })) });
    const repository = new VenuesRepository({ query } as unknown as DatabaseService);
    const result = await repository.listCoordinatorBookings(ownerUserId);
    expect(result.map((booking) => booking.status)).toEqual(statuses);
    expect(new Set(result.map((booking) => booking.id)).size).toBe(4);
    expect(String(query.mock.calls[0][0])).toContain('WHERE e.coordinator_id = $1::text AND b.status <> \'blocked\'');
    expect(query.mock.calls[0][1]).toEqual([ownerUserId]);
  });

  /** VEN-BKG-09/10-A/C: only pending and approved rows count as active; update remains scoped to the selected row. */
  it('does not count rejected or cancelled rows as active and updates only the selected booking', async () => {
    const eventId = '00000000-0000-4000-8000-000000000001';
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ event_id: eventId }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'booking-1', event_id: eventId }] });
    const repository = new VenuesRepository({ transaction: (work) => work({ query }) } as unknown as DatabaseService);
    await expect(repository.cancelCoordinatorBooking(ownerUserId, 'booking-1')).resolves.toEqual({ id: 'booking-1', eventId, hasOtherActiveBookings: true });
    const countSql = String(query.mock.calls[1][0]);
    const updateSql = String(query.mock.calls[2][0]);
    expect(countSql).toContain("status IN ('pending','approved')");
    expect(countSql).not.toContain("'rejected'");
    expect(updateSql).toContain('WHERE b.id = $1::uuid');
    expect(updateSql).toContain('e.coordinator_id = $2::text');
    expect(query.mock.calls[2][1]).toEqual(['booking-1', ownerUserId]);
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
      }),
    ).resolves.toEqual({ kind: 'event-not-assigned' });
    expect(query).toHaveBeenCalledTimes(2);
  });

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
                setup_time_minutes: 15,
                turnaround_time_minutes: 20,
                facilities: [], accessibility: [], layouts: [],
              },
            ],
          };
        if (sql.includes('FROM events WHERE id'))
          return { rows: [{ id: 'event-1', status: 'Approved', expected_attendance: 20, required_facilities: [], accessibility_needs: [], preferred_room_layout: '', start_date_time: new Date('2030-01-12T04:00:00Z'), end_date_time: new Date('2030-01-12T05:00:00Z') }] };
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
        specialRequests: 'Step-free access',
      },
    );

    expect(result).toEqual({ kind: 'conflict', reason: 'Workshop' });
    expect(queries[0]).toContain('FOR UPDATE');
    expect(queries[1]).toContain('coordinator_id = $2::text');
    const duplicateSql = queries[2].replace(/\s+/g, ' ');
    expect(duplicateSql).toContain('r.event_id = $1::uuid AND r.venue_id = $2::uuid');
    expect(duplicateSql).not.toContain('status =');
    expect(duplicateSql).not.toContain('start_at');
    expect(duplicateSql).not.toContain('end_at');
    const conflictSql = queries[3].replace(/\s+/g, ' ');
    expect(conflictSql).toContain('hold_expires_at > $6::timestamptz');
    expect(conflictSql).toContain("status = 'blocked'");
    expect(conflictSql).toContain('start_at < $3::timestamptz + make_interval(mins => $5::int)');
    expect(conflictSql).toContain('end_at > $2::timestamptz - make_interval(mins => $4::int)');
    expect(conflictSql).toContain("b.status = 'pending'");
    expect(conflictSql).toContain("b.status = 'approved'");
    expect(conflictSql).toContain('b.start_at - make_interval(mins => $4::int) < $3::timestamptz + make_interval(mins => $5::int)');
    expect(conflictSql).toContain('b.end_at + make_interval(mins => $5::int) > $2::timestamptz - make_interval(mins => $4::int)');
    expect(parameters[3][5]).toBe(now);
    expect(
      queries.some((sql) => sql.includes('INSERT INTO venue_bookings')),
    ).toBe(false);
  });

  /** SPM-54 AC5: a request for an event/venue pair returns its existing row regardless of status or event time. */
  it('returns the existing booking for a prior event and venue request', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: venue.id, capacity: 120, setup_time_minutes: 30, turnaround_time_minutes: 45, facilities: [], accessibility: [], layouts: [] }] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1', status: 'Planning', expected_attendance: 20, required_facilities: [], accessibility_needs: [], preferred_room_layout: '', start_date_time: new Date('2030-01-12T04:00:00Z'), end_date_time: new Date('2030-01-12T05:00:00Z') }] })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-booking-id' }] });
    const repository = new VenuesRepository({ transaction: (work) => work({ query }) } as unknown as DatabaseService);

    await expect(repository.submitBookingRequest(venue.id, ownerUserId, {
      eventId: '00000000-0000-4000-8000-000000000001',
    })).resolves.toEqual({ kind: 'duplicate-request', id: 'existing-booking-id' });
    expect(query).toHaveBeenCalledTimes(3);
    const duplicateSql = String(query.mock.calls[2][0]).replace(/\s+/g, ' ');
    expect(duplicateSql).toContain('WHERE r.event_id = $1::uuid AND r.venue_id = $2::uuid');
    expect(duplicateSql).not.toContain('status =');
    expect(duplicateSql).not.toContain('start_at');
    expect(duplicateSql).not.toContain('end_at');
    expect(query.mock.calls[2][1]).toEqual(['00000000-0000-4000-8000-000000000001', venue.id]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO venue_bookings'))).toBe(false);
  });

  /** VEN-AVL-08-A/B: a clear range is recorded only after the locked fresh schedule check. */
  it('records a pending booking request after a clear fresh schedule check', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: venue.id,
              capacity: 120,
              setup_time_minutes: 15,
              turnaround_time_minutes: 20,
              facilities: [], accessibility: [], layouts: [],
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1', status: 'Approved', expected_attendance: 20, required_facilities: [], accessibility_needs: [], preferred_room_layout: '', start_date_time: new Date('2030-01-12T04:00:00Z'), end_date_time: new Date('2030-01-12T05:00:00Z') }] })
        .mockResolvedValueOnce({ rows: [] }) // no permanent event/venue request
        .mockResolvedValueOnce({ rows: [] }) // no schedule conflict
        .mockResolvedValueOnce({ rows: [] }) // request association insert
        .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-4000-8000-000000000099', start_at: new Date('2030-01-12T04:00:00.000Z'), end_at: new Date('2030-01-12T05:00:00.000Z') }] }),
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
        specialRequests: 'Step-free access',
      },
    );

    expect(result).toMatchObject({
      kind: 'created',
      id: '00000000-0000-4000-8000-000000000099',
    });
    expect(client.query).toHaveBeenCalledTimes(7);
    expect(String(client.query.mock.calls[4][0])).toContain('INSERT INTO venue_booking_requests');
    expect(client.query.mock.calls[4][1]).toEqual(['00000000-0000-4000-8000-000000000001', venue.id, 'Step-free access']);
    expect(String(client.query.mock.calls[5][0])).toContain("'pending'");
    expect(client.query.mock.calls[5][1]).toEqual([venue.id, '00000000-0000-4000-8000-000000000001', new Date('2030-01-12T04:00:00Z'), new Date('2030-01-12T05:00:00Z')]);
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
});
