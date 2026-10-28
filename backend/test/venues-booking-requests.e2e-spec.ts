import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

const databaseUrl = process.env.DATABASE_URL;
const fixedNow = new Date('2030-01-10T12:00:00.000Z');
if (!databaseUrl && process.env.CI)
  throw new Error(
    'SPM-51 venue booking PostgreSQL tests must run in CI: set DATABASE_URL.',
  );

describe.skipIf(!databaseUrl)(
  'SPM-51 booking request HTTP and PostgreSQL',
  () => {
    let app: INestApplication;
    let pool: pg.Pool;
    const venueIds: string[] = [];
    const eventIds: string[] = [];
    const userIds: string[] = [];

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: databaseUrl });
      for (const migration of [
        '005_venues.sql',
        '006_venue_operating_information.sql',
        '007_venue_operating_schedule.sql',
        '008_venue_owner_user_id.sql',
        '009_venue_availability.sql',
        '010_remove_venue_operating_schedule.sql',
        '019_spm54_venue_booking_lifecycle.sql',
        '021_spm55_booking_review.sql',
        '022_spm55_booking_special_request.sql',
      ])
        await pool.query(
          await readFile(
            new URL(`../migrations/${migration}`, import.meta.url),
            'utf8',
          ),
        );

      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CLOCK)
        .useValue({ now: () => fixedNow })
        .compile();
      app = module.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      if (!pool) return;
      if (venueIds.length)
        await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [
          venueIds,
        ]);
      if (eventIds.length)
        await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [
          eventIds,
        ]);
      if (userIds.length)
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
          userIds,
        ]);
      await pool.end();
    });

    async function createUser(role: 'COORDINATOR' | 'VENUE_STAFF') {
      const email = `spm51-${randomUUID()}@example.test`;
      const result = await pool.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, 'SPM-51 Integration User', crypt('password123', gen_salt('bf', 4)))
       RETURNING id`,
        [email],
      );
      const id = result.rows[0].id;
      userIds.push(id);
      await pool.query(
        'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
        [id, role],
      );
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'password123' })
        .expect(201);
      const cookie = (login.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) =>
        value.startsWith('connectsphere_session='),
      );
      if (!cookie)
        throw new Error('Expected an authenticated test session cookie');
      return { id, cookie: cookie.split(';', 1)[0] };
    }

    async function createVenue(
      ownerId: string,
      buffers = { setupTimeMinutes: 0, turnaroundTimeMinutes: 0 },
    ) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO venues
       (id, owner_user_id, name, location, capacity, operating_information,
        setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, $3, 'SPM-51 Test Location', 100, 'Integration fixture',
        $4, $5)`,
        [
          id,
          ownerId,
          `SPM-51 ${id}`,
          buffers.setupTimeMinutes,
          buffers.turnaroundTimeMinutes,
        ],
      );
      venueIds.push(id);
      return id;
    }

    async function createAssignedEvent(
      coordinatorId: string,
      name: string,
      start = '2030-01-12T06:00:00.000Z',
      end = '2030-01-12T07:00:00.000Z',
    ) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
        start_date_time, end_date_time, expected_attendance, coordinator_id,
        coordinator_name, submission_key, status)
       VALUES ($1, 'spm51-test', 'SPM-51 Organiser', 'spm51@example.test', $2,
        'Venue availability integration', $3, $4, 10, $5, 'SPM-51 Coordinator', $1, 'Planning')`,
        [id, name, new Date(start), new Date(end), coordinatorId],
      );
      eventIds.push(id);
      return id;
    }

    async function addBooking(
      venueId: string,
      eventId: string,
      options: {
        start: string;
        end: string;
        status?: string;
        expires?: Date | null;
      },
    ) {
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, hold_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          venueId,
          eventId,
          new Date(options.start),
          new Date(options.end),
          options.status ?? 'approved',
          options.expires ?? null,
        ],
      );
    }

    async function addBlockout(
      venueId: string,
      start: string,
      end: string,
      reason: string,
    ) {
      await pool.query(
        `INSERT INTO venue_bookings (venue_id, start_at, end_at, status, reason)
         VALUES ($1, $2, $3, 'blocked', $4)`,
        [venueId, new Date(start), new Date(end), reason],
      );
    }

    async function expectBufferedBlockoutInMyBookings(
      blockout: { start: string; end: string },
      affected = true,
    ) {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const originalVenue = await createVenue(owner.id, {
        setupTimeMinutes: 30,
        turnaroundTimeMinutes: 20,
      });
      const replacementVenue = await createVenue(owner.id);
      const eventName = 'SPM-54 buffered affected booking';
      const eventId = await createAssignedEvent(coordinator.id, eventName);
      await addBooking(originalVenue, eventId, {
        start: '2030-01-12T06:00:00.000Z',
        end: '2030-01-12T07:00:00.000Z',
        status: 'approved',
      });
      const original = await pool.query<{ id: string }>(
        `SELECT id FROM venue_bookings
         WHERE event_id = $1 AND venue_id = $2 AND status = 'approved'`,
        [eventId, originalVenue],
      );
      const originalId = original.rows[0].id;

      const replacement = await request(app.getHttpServer())
        .post(`/api/venues/${replacementVenue}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId,
          start: '2030-01-12T06:00:00.000Z',
          end: '2030-01-12T07:00:00.000Z',
          specialRequest: 'Replacement for affected booking',
        })
        .expect(201);

      const blockoutResponse = await request(app.getHttpServer())
        .post(`/api/venues/${originalVenue}/unavailable-periods`)
        .set('Cookie', owner.cookie)
        .send({ ...blockout, reason: 'Maintenance' })
        .expect(201);
      const originalAffectedBooking = expect.objectContaining({
        id: originalId,
        eventId,
        eventName,
        status: 'booked',
        affectedByUnavailablePeriod: true,
      });
      if (affected)
        expect(blockoutResponse.body.affectedBookings).toEqual(
          expect.arrayContaining([originalAffectedBooking]),
        );
      else
        expect(blockoutResponse.body.affectedBookings).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: originalId })]),
        );

      const myBookings = await request(app.getHttpServer())
        .get('/api/venues/bookings/mine')
        .set('Cookie', coordinator.cookie)
        .expect(200);
      expect(myBookings.body).toHaveLength(2);
      expect(myBookings.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: originalId,
            eventId,
            eventName,
            venueId: originalVenue,
            status: 'approved',
            affected,
          }),
          expect.objectContaining({
            id: replacement.body.id,
            eventId,
            eventName,
            venueId: replacementVenue,
            status: 'pending',
            specialRequest: 'Replacement for affected booking',
            affected: false,
          }),
        ]),
      );

      const history = await pool.query<{
        id: string;
        venue_id: string;
        status: string;
      }>(
        `SELECT id, venue_id, status FROM venue_bookings
         WHERE event_id = $1 AND status <> 'blocked' ORDER BY venue_id`,
        [eventId],
      );
      expect(history.rows).toEqual(
        expect.arrayContaining([
          { id: originalId, venue_id: originalVenue, status: 'approved' },
          {
            id: replacement.body.id,
            venue_id: replacementVenue,
            status: 'pending',
          },
        ]),
      );
      const event = await pool.query<{ event_name: string; status: string }>(
        'SELECT event_name, status FROM events WHERE id = $1',
        [eventId],
      );
      expect(event.rows).toEqual([
        { event_name: eventName, status: 'Planning' },
      ]);
    }

    async function expectConflictWithoutRequest(
      venueId: string,
      coordinatorCookie: string,
      eventId: string,
      start: string,
      end: string,
      reason: string,
    ) {
      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinatorCookie)
        .send({ eventId, start, end })
        .expect(409);
      expect(response.body.message).toContain(reason);
      const candidateRows = await pool.query(
        'SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(candidateRows.rows).toEqual([]);
    }

    /** Waits for every competing HTTP transaction to reach and block on its expected PostgreSQL row lock. */
    async function waitForLockWaiters(queryFragment: string, expected: number) {
      const deadline = Date.now() + 5_000;
      let count = 0;
      while (Date.now() < deadline) {
        const result = await pool.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE datname = current_database() AND state = 'active'
              AND wait_event_type = 'Lock' AND query LIKE $1`,
          [`%${queryFragment}%`],
        );
        count = result.rows[0].count;
        if (count >= expected) return count;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return count;
    }

    /** VEN-BKG-03-A, VEN-BKG-04-A / VEN-BKG-08-A: the trimmed request is confirmed and appears as a persisted Pending row in My Bookings with its venue and event. */
    it('VEN-BKG-04-A SPM-54 creates a pending request with a reference in My Bookings', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        coordinator.id,
        'SPM-51 clear request',
      );

      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId,
          start: '2030-01-12T06:00:00.000Z',
          end: '2030-01-12T07:00:00.000Z',
          specialRequest: '  Please provide microphones.  ',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        eventId,
        venueId,
        status: 'pending',
      });
      expect(response.body.bookingReference).toMatch(/^VB-[A-F0-9]{8}$/);
      const persisted = await pool.query(
        'SELECT status FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(persisted.rows).toEqual([{ status: 'pending' }]);
      const mine = await request(app.getHttpServer())
        .get('/api/venues/bookings/mine')
        .set('Cookie', coordinator.cookie)
        .expect(200);
      expect(mine.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            eventId,
            eventName: 'SPM-51 clear request',
            venueId,
            venueName: expect.any(String),
            status: 'pending',
            specialRequest: 'Please provide microphones.',
          }),
        ]),
      );
    });

    /** VEN-BKG-07-B: two distinct low-capacity venues can be requested independently; their aggregate capacity need not meet attendance. */
    it('VEN-BKG-07-B SPM-54 accepts independent low-capacity venue requests with suitability advisories', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const firstVenue = await createVenue(owner.id);
      const secondVenue = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        coordinator.id,
        'SPM-54 independent capacity request',
      );
      await pool.query('UPDATE venues SET capacity = 10 WHERE id = $1', [
        firstVenue,
      ]);
      await pool.query('UPDATE venues SET capacity = 12 WHERE id = $1', [
        secondVenue,
      ]);
      await pool.query(
        `UPDATE events
            SET expected_attendance = 24,
                required_facilities = ARRAY['Stage'],
                accessibility_needs = ARRAY['wheelchair-access'],
                preferred_room_layout = 'Banquet'
          WHERE id = $1`,
        [eventId],
      );

      for (const venueId of [firstVenue, secondVenue]) {
        const response = await request(app.getHttpServer())
          .post(`/api/venues/${venueId}/booking-requests`)
          .set('Cookie', coordinator.cookie)
          .send({
            eventId,
            start: '2030-01-12T06:00:00.000Z',
            end: '2030-01-12T07:00:00.000Z',
          })
          .expect(201);
        expect(response.body).toMatchObject({
          eventId,
          venueId,
          status: 'pending',
        });
      }

      const persisted = await pool.query(
        `SELECT venue_id, status FROM venue_bookings
          WHERE event_id = $1 AND venue_id = ANY($2::uuid[])
          ORDER BY venue_id`,
        [eventId, [firstVenue, secondVenue]],
      );
      expect(persisted.rows).toEqual(
        [firstVenue, secondVenue]
          .sort()
          .map((venue_id) => ({ venue_id, status: 'pending' })),
      );
      const event = await pool.query(
        'SELECT status FROM events WHERE id = $1',
        [eventId],
      );
      expect(event.rows).toEqual([{ status: 'Planning' }]);
    });

    /** VEN-BKG-01-C / VEN-BKG-02-C: suitability mismatches remain advisory, but a real schedule conflict still refuses the request. */
    it('VEN-BKG-01-C VEN-BKG-02-C SPM-54 rejects a schedule conflict even when suitability is also mismatched', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const existingEvent = await createAssignedEvent(
        coordinator.id,
        'Existing confirmed event',
      );
      const candidateEvent = await createAssignedEvent(
        coordinator.id,
        'Unsuitable conflicting event',
      );
      await pool.query(
        `UPDATE events
            SET expected_attendance = 250,
                required_facilities = ARRAY['Stage']
          WHERE id = $1`,
        [candidateEvent],
      );
      const period = {
        start: '2030-01-12T06:00:00.000Z',
        end: '2030-01-12T07:00:00.000Z',
      };
      await addBooking(venueId, existingEvent, {
        ...period,
        status: 'approved',
      });

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidateEvent,
        period.start,
        period.end,
        'Existing confirmed event',
      );
      const candidate = await pool.query(
        'SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, candidateEvent],
      );
      expect(candidate.rows).toEqual([]);
    });

    /** VEN-BKG-03-SEC-1: server uses persisted event times even if the client sends different times. */
    it('VEN-BKG-03-SEC-1 SPM-54 persists assigned event times despite client tampering', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, {
        setupTimeMinutes: 0,
        turnaroundTimeMinutes: 0,
      });
      const eventId = await createAssignedEvent(
        coordinator.id,
        'Assigned time is authoritative',
        '2030-01-12T08:00:00.000Z',
        '2030-01-12T09:00:00.000Z',
      );

      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId,
          start: '2030-01-13T12:00:00.000Z',
          end: '2030-01-13T13:00:00.000Z',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        eventId,
        venueId,
        start: '2030-01-12T08:00:00.000Z',
        end: '2030-01-12T09:00:00.000Z',
      });
      const persisted = await pool.query<{ start_at: Date; end_at: Date }>(
        'SELECT start_at, end_at FROM venue_bookings WHERE id = $1',
        [response.body.id],
      );
      expect(persisted.rows[0].start_at.toISOString()).toBe(
        '2030-01-12T08:00:00.000Z',
      );
      expect(persisted.rows[0].end_at.toISOString()).toBe(
        '2030-01-12T09:00:00.000Z',
      );
    });

    /** VEN-BKG-02-BND-1: a confirmed event whose raw times are disjoint is refused when the candidate's setup buffer overlaps by one minute; exact adjacency remains available. */
    it('VEN-BKG-02-BND-1 SPM-54 rejects a one-minute setup overlap but accepts exact buffer adjacency', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, {
        setupTimeMinutes: 30,
        turnaroundTimeMinutes: 0,
      });
      const existingEvent = await createAssignedEvent(
        coordinator.id,
        'Approved setup-buffer event',
        '2030-01-12T06:00:00.000Z',
        '2030-01-12T07:00:00.000Z',
      );
      await addBooking(venueId, existingEvent, {
        start: '2030-01-12T06:00:00.000Z',
        end: '2030-01-12T07:00:00.000Z',
        status: 'approved',
      });

      const overlappingEvent = await createAssignedEvent(
        coordinator.id,
        'One-minute setup overlap',
        '2030-01-12T07:29:00.000Z',
        '2030-01-12T08:29:00.000Z',
      );
      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        overlappingEvent,
        '2030-01-12T07:29:00.000Z',
        '2030-01-12T08:29:00.000Z',
        'Approved setup-buffer event',
      );

      const adjacentEvent = await createAssignedEvent(
        coordinator.id,
        'Exactly adjacent setup buffer',
        '2030-01-12T07:30:00.000Z',
        '2030-01-12T08:30:00.000Z',
      );
      const adjacent = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId: adjacentEvent,
          start: '2030-01-12T07:30:00.000Z',
          end: '2030-01-12T08:30:00.000Z',
        })
        .expect(201);
      const persisted = await pool.query<{ status: string }>(
        'SELECT status FROM venue_bookings WHERE id = $1',
        [adjacent.body.id],
      );
      expect(persisted.rows).toEqual([{ status: 'pending' }]);
    });

    /** VEN-BKG-02-BND-2: a confirmed event whose raw times are disjoint is refused when its prior booking's turnaround buffer overlaps by one minute. */
    it('VEN-BKG-02-BND-2 SPM-54 rejects a one-minute turnaround overlap in PostgreSQL', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, {
        setupTimeMinutes: 0,
        turnaroundTimeMinutes: 30,
      });
      const existingEvent = await createAssignedEvent(
        coordinator.id,
        'Approved turnaround-buffer event',
        '2030-01-12T06:00:00.000Z',
        '2030-01-12T07:00:00.000Z',
      );
      await addBooking(venueId, existingEvent, {
        start: '2030-01-12T06:00:00.000Z',
        end: '2030-01-12T07:00:00.000Z',
        status: 'approved',
      });
      const candidate = await createAssignedEvent(
        coordinator.id,
        'One-minute turnaround overlap',
        '2030-01-12T07:29:00.000Z',
        '2030-01-12T08:29:00.000Z',
      );

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidate,
        '2030-01-12T07:29:00.000Z',
        '2030-01-12T08:29:00.000Z',
        'Approved turnaround-buffer event',
      );
    });

    /** VEN-BKG-02-C: distinct assigned events race for a fresh venue; the serialized pending-request conflict permits only one request. */
    it('VEN-BKG-02-C SPM-54 serializes different-event conflict checks on the venue row', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const candidates = await Promise.all([
        createAssignedEvent(
          coordinator.id,
          'Concurrent event request one',
          '2030-01-12T06:00:00.000Z',
          '2030-01-12T07:00:00.000Z',
        ),
        createAssignedEvent(
          coordinator.id,
          'Concurrent event request two',
          '2030-01-12T06:00:00.000Z',
          '2030-01-12T07:00:00.000Z',
        ),
      ]);
      const lockClient = await pool.connect();
      await lockClient.query('BEGIN');
      await lockClient.query(
        'SELECT id FROM venues WHERE id = $1::uuid FOR UPDATE',
        [venueId],
      );
      // Reads remain available, but writes pause after conflict evaluation. If the venue lock is absent,
      // this barrier lets both distinct-event requests reach their inserts before either can commit.
      await lockClient.query('LOCK TABLE venue_bookings IN SHARE MODE');
      const submit = (eventId: string) =>
        request(app.getHttpServer())
          .post(`/api/venues/${venueId}/booking-requests`)
          .set('Cookie', coordinator.cookie)
          .send({
            eventId,
            start: '2030-01-12T06:00:00.000Z',
            end: '2030-01-12T07:00:00.000Z',
          });
      const submissions = Promise.all(candidates.map(submit));
      let waiting = 0;
      let insertsWaiting = 0;
      try {
        waiting = await waitForLockWaiters(
          'FROM venues v WHERE v.id = $1::uuid FOR UPDATE',
          2,
        );
        if (waiting < 2)
          insertsWaiting = await waitForLockWaiters(
            'INSERT INTO venue_bookings',
            2,
          );
      } finally {
        await lockClient.query('COMMIT');
        lockClient.release();
      }
      const responses = await submissions;
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      const active = await pool.query<{ event_id: string; status: string }>(
        `SELECT event_id, status FROM venue_bookings
          WHERE venue_id = $1 AND status IN ('pending', 'approved')`,
        [venueId],
      );
      expect(active.rows).toHaveLength(1);
      expect(candidates).toContain(active.rows[0].event_id);
      expect(active.rows[0].status).toBe('pending');
      const requests = await pool.query<{ event_id: string }>(
        `SELECT event_id FROM venue_booking_requests WHERE venue_id = $1`,
        [venueId],
      );
      expect(requests.rows).toEqual([{ event_id: active.rows[0].event_id }]);
      expect(waiting).toBe(2);
      expect(insertsWaiting).toBe(0);
    });

    /** SPM-54 AC7: parallel duplicate submissions create one active event/venue request; retained cancelled/rejected rows permit retry. */
    it('VEN-BKG-07-A SPM-54 serializes duplicates and allows retries after final history statuses', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        coordinator.id,
        'SPM-54 duplicate event',
      );
      const requestPayload = {
        eventId,
        start: '2030-01-12T06:00:00.000Z',
        end: '2030-01-12T07:00:00.000Z',
      };
      const submit = () =>
        request(app.getHttpServer())
          .post(`/api/venues/${venueId}/booking-requests`)
          .set('Cookie', coordinator.cookie)
          .send(requestPayload);

      const parallel = await Promise.all([submit(), submit()]);
      expect(parallel.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      expect(
        parallel.find((response) => response.status === 409)?.body.code,
      ).toBe('ACTIVE_VENUE_REQUEST_EXISTS');
      let rows = await pool.query<{ status: string }>(
        'SELECT status FROM venue_bookings WHERE venue_id = $1 AND event_id = $2 ORDER BY created_at, id',
        [venueId, eventId],
      );
      expect(rows.rows).toEqual([{ status: 'pending' }]);

      const created = parallel.find((response) => response.status === 201)!;
      await request(app.getHttpServer())
        .post(`/api/venues/bookings/${created.body.id}/cancel`)
        .set('Cookie', coordinator.cookie)
        .send({ confirmed: false })
        .expect(409);
      await request(app.getHttpServer())
        .post(`/api/venues/bookings/${created.body.id}/cancel`)
        .set('Cookie', coordinator.cookie)
        .send({ confirmed: true })
        .expect(201);

      // Add a rejected retained attempt directly; neither final status blocks a fresh API request.
      await addBooking(venueId, eventId, {
        ...requestPayload,
        status: 'rejected',
      });
      const retry = await submit().expect(201);
      expect(retry.body.status).toBe('pending');
      rows = await pool.query<{ status: string }>(
        'SELECT status FROM venue_bookings WHERE venue_id = $1 AND event_id = $2 ORDER BY created_at, id',
        [venueId, eventId],
      );
      expect(rows.rows.map((row) => row.status).sort()).toEqual([
        'cancelled',
        'pending',
        'rejected',
      ]);
    });

    /** VEN-BKG-05-A/B, 06-A/B, 07-A/B: replacing an affected booking adds an independent venue row, leaves the original unchanged, and a failed third request leaves both saved rows intact. */
    it('VEN-BKG-05-A VEN-BKG-05-B VEN-BKG-06-A VEN-BKG-07-A VEN-BKG-07-B SPM-54 supports replacement while preserving independent booking history', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const originalVenue = await createVenue(owner.id);
      const replacementVenue = await createVenue(owner.id);
      const blockedVenue = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        coordinator.id,
        'SPM-54 replacement event',
      );
      const start = '2030-01-12T06:00:00.000Z';
      const end = '2030-01-12T07:00:00.000Z';

      const original = await request(app.getHttpServer())
        .post(`/api/venues/${originalVenue}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId,
          start,
          end,
          specialRequest: '  Please provide microphones.  ',
        })
        .expect(201);
      await addBlockout(
        originalVenue,
        '2030-01-12T05:30:00.000Z',
        '2030-01-12T07:30:00.000Z',
        'Maintenance',
      );
      const replacement = await request(app.getHttpServer())
        .post(`/api/venues/${replacementVenue}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId, start, end })
        .expect(201);
      await addBlockout(
        blockedVenue,
        '2030-01-12T05:30:00.000Z',
        '2030-01-12T07:30:00.000Z',
        'Maintenance',
      );
      await expectConflictWithoutRequest(
        blockedVenue,
        coordinator.cookie,
        eventId,
        start,
        end,
        'Maintenance',
      );

      const persisted = await pool.query<{
        id: string;
        venue_id: string;
        status: string;
      }>(
        'SELECT id, venue_id, status FROM venue_bookings WHERE event_id = $1 ORDER BY venue_id',
        [eventId],
      );
      expect(persisted.rows).toHaveLength(2);
      expect(persisted.rows).toEqual(
        expect.arrayContaining([
          { id: original.body.id, venue_id: originalVenue, status: 'pending' },
          {
            id: replacement.body.id,
            venue_id: replacementVenue,
            status: 'pending',
          },
        ]),
      );
      const requestDetails = await pool.query<{
        special_request: string | null;
      }>(
        'SELECT special_request FROM venue_booking_requests WHERE event_id = $1 AND venue_id = $2',
        [eventId, originalVenue],
      );
      expect(requestDetails.rows).toEqual([
        { special_request: 'Please provide microphones.' },
      ]);
    });

    /** VEN-BKG-05-B: only the coordinator assigned to the event may replace its venue request. */
    it('VEN-BKG-05-B SPM-54 refuses an unassigned coordinator replacing a venue request', async () => {
      const owner = await createUser('VENUE_STAFF');
      const assignedCoordinator = await createUser('COORDINATOR');
      const otherCoordinator = await createUser('COORDINATOR');
      const originalVenue = await createVenue(owner.id);
      const replacementVenue = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        assignedCoordinator.id,
        'Coordinator-owned replacement event',
      );
      const period = {
        start: '2030-01-12T06:00:00.000Z',
        end: '2030-01-12T07:00:00.000Z',
      };
      const original = await request(app.getHttpServer())
        .post(`/api/venues/${originalVenue}/booking-requests`)
        .set('Cookie', assignedCoordinator.cookie)
        .send({ eventId, ...period })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/venues/${replacementVenue}/booking-requests`)
        .set('Cookie', otherCoordinator.cookie)
        .send({ eventId, ...period })
        .expect(404);

      const history = await pool.query<{
        id: string;
        venue_id: string;
        status: string;
      }>(
        'SELECT id, venue_id, status FROM venue_bookings WHERE event_id = $1 ORDER BY venue_id',
        [eventId],
      );
      expect(history.rows).toEqual([
        { id: original.body.id, venue_id: originalVenue, status: 'pending' },
      ]);
    });

    /** VEN-BKG-09-A/SEC-1, VEN-BKG-10-A/B: one booking cancels independently, unowned cancellation is refused, and final cancellation requires explicit confirmation. */
    it('VEN-BKG-09-A VEN-BKG-09-SEC-1 VEN-BKG-10-A VEN-BKG-10-B VEN-BKG-10-SEC-1 SPM-54 cancels independently and requires explicit final-booking confirmation', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const otherCoordinator = await createUser('COORDINATOR');
      const firstVenue = await createVenue(owner.id);
      const secondVenue = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        coordinator.id,
        'SPM-54 cancellation event',
      );
      const start = '2030-01-12T06:00:00.000Z';
      const end = '2030-01-12T07:00:00.000Z';
      const first = await request(app.getHttpServer())
        .post(`/api/venues/${firstVenue}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId, start, end })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/api/venues/${secondVenue}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId, start, end })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/venues/bookings/${first.body.id}/cancel`)
        .set('Cookie', otherCoordinator.cookie)
        .send({ confirmed: true })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/venues/bookings/${first.body.id}/cancel`)
        .set('Cookie', coordinator.cookie)
        .send({ confirmed: false })
        .expect(201);
      const lastAttempt = await request(app.getHttpServer())
        .post(`/api/venues/bookings/${second.body.id}/cancel`)
        .set('Cookie', coordinator.cookie)
        .send({ confirmed: false })
        .expect(409);
      expect(lastAttempt.body).toMatchObject({
        code: 'LAST_ACTIVE_VENUE_BOOKING',
        requiresConfirmation: true,
      });
      const unchanged = await pool.query<{ status: string }>(
        'SELECT status FROM venue_bookings WHERE id = $1',
        [second.body.id],
      );
      expect(unchanged.rows).toEqual([{ status: 'pending' }]);
      await request(app.getHttpServer())
        .post(`/api/venues/bookings/${second.body.id}/cancel`)
        .set('Cookie', coordinator.cookie)
        .send({ confirmed: true })
        .expect(201);
      const history = await pool.query<{ id: string; status: string }>(
        'SELECT id, status FROM venue_bookings WHERE event_id = $1 ORDER BY id',
        [eventId],
      );
      expect(history.rows).toEqual(
        expect.arrayContaining([
          { id: first.body.id, status: 'cancelled' },
          { id: second.body.id, status: 'cancelled' },
        ]),
      );
    });

    /** VEN-BKG-10-A/B: concurrent unconfirmed cancellations serialize on their shared event row, leaving one active booking and refusing the last cancellation. */
    it('VEN-BKG-10-A VEN-BKG-10-B SPM-54 requires confirmation when concurrent cancellations target the final two bookings', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const eventId = await createAssignedEvent(
        coordinator.id,
        'Concurrent final cancellation event',
      );
      const firstVenue = await createVenue(owner.id);
      const secondVenue = await createVenue(owner.id);
      const first = await request(app.getHttpServer())
        .post(`/api/venues/${firstVenue}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId,
          start: '2030-01-12T06:00:00.000Z',
          end: '2030-01-12T07:00:00.000Z',
        })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post(`/api/venues/${secondVenue}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId,
          start: '2030-01-12T06:00:00.000Z',
          end: '2030-01-12T07:00:00.000Z',
        })
        .expect(201);

      const lockClient = await pool.connect();
      await lockClient.query('BEGIN');
      await lockClient.query(
        'SELECT id FROM events WHERE id = $1::uuid FOR UPDATE',
        [eventId],
      );
      const cancel = (bookingId: string) =>
        request(app.getHttpServer())
          .post(`/api/venues/bookings/${bookingId}/cancel`)
          .set('Cookie', coordinator.cookie)
          .send({ confirmed: false });
      const cancellations = Promise.all([
        cancel(first.body.id),
        cancel(second.body.id),
      ]);
      let waiting = 0;
      try {
        waiting = await waitForLockWaiters('FOR UPDATE OF b, e', 2);
      } finally {
        await lockClient.query('COMMIT');
        lockClient.release();
      }
      const responses = await cancellations;
      expect(waiting).toBe(2);
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      const lastCancellation = responses.find(({ status }) => status === 409)!;
      expect(lastCancellation.body).toMatchObject({
        code: 'LAST_ACTIVE_VENUE_BOOKING',
        requiresConfirmation: true,
      });
      const history = await pool.query<{ id: string; status: string }>(
        `SELECT id, status FROM venue_bookings WHERE event_id = $1 ORDER BY id`,
        [eventId],
      );
      expect(history.rows.map(({ id }) => id).sort()).toEqual(
        [first.body.id, second.body.id].sort(),
      );
      expect(history.rows.map(({ status }) => status).sort()).toEqual([
        'cancelled',
        'pending',
      ]);
    });

    /** VEN-BKG-09-A: concurrent cancellation attempts on one of two active requests change only the target and retain its sibling. */
    it('VEN-BKG-09-A SPM-54 serializes cancellation of one booking while preserving another active request', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const eventId = await createAssignedEvent(
        coordinator.id,
        'Concurrent single-booking cancellation event',
      );
      const venueIdsForEvent = [
        await createVenue(owner.id),
        await createVenue(owner.id),
      ];
      const period = {
        start: '2030-01-12T06:00:00.000Z',
        end: '2030-01-12T07:00:00.000Z',
      };
      const requests = await Promise.all(
        venueIdsForEvent.map((venueId) =>
          request(app.getHttpServer())
            .post(`/api/venues/${venueId}/booking-requests`)
            .set('Cookie', coordinator.cookie)
            .send({ eventId, ...period })
            .expect(201),
        ),
      );
      const targetId = requests[0].body.id as string;
      const lockClient = await pool.connect();
      await lockClient.query('BEGIN');
      await lockClient.query(
        'SELECT id FROM events WHERE id = $1::uuid FOR UPDATE',
        [eventId],
      );
      const cancel = () =>
        request(app.getHttpServer())
          .post(`/api/venues/bookings/${targetId}/cancel`)
          .set('Cookie', coordinator.cookie)
          .send({ confirmed: false });
      const cancellations = Promise.all([cancel(), cancel()]);
      let waiting = 0;
      try {
        waiting = await waitForLockWaiters('FOR UPDATE OF b, e', 2);
      } finally {
        await lockClient.query('COMMIT');
        lockClient.release();
      }
      const responses = await cancellations;
      expect(waiting).toBe(2);
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      const repeatedCancellation = responses.find(
        ({ status }) => status === 409,
      )!;
      expect(repeatedCancellation.body.message).toContain(
        'Only pending or approved venue bookings can be cancelled.',
      );
      const history = await pool.query<{
        id: string;
        venue_id: string;
        status: string;
      }>(
        'SELECT id, venue_id, status FROM venue_bookings WHERE event_id = $1 ORDER BY venue_id',
        [eventId],
      );
      expect(history.rows).toEqual(
        [
          {
            id: requests[0].body.id,
            venue_id: venueIdsForEvent[0],
            status: 'cancelled',
          },
          {
            id: requests[1].body.id,
            venue_id: venueIdsForEvent[1],
            status: 'pending',
          },
        ].sort((left, right) => left.venue_id.localeCompare(right.venue_id)),
      );
    });

    /** SPM-51 local seed regression: the sample catalogue and event set stays assigned to the seeded coordinator. */
    it('contains the SPM-51 sample venues and coordinator-assigned events', async () => {
      const seedCoordinator = await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email = 'coordinator1@connectsphere.test'",
      );
      expect(seedCoordinator.rows).toHaveLength(1);
      const seededEvents = await pool.query<{ id: string; event_name: string }>(
        `SELECT id, event_name FROM events
         WHERE id BETWEEN $2::uuid AND $3::uuid AND coordinator_id = $1::text`,
        [
          seedCoordinator.rows[0].id,
          '00000000-0000-4000-8000-000000000201',
          '00000000-0000-4000-8000-000000000205',
        ],
      );
      const seededVenues = await pool.query<{ id: string }>(
        `SELECT id FROM venues WHERE id BETWEEN $1::uuid AND $2::uuid`,
        [
          '00000000-0000-4000-8000-000000000301',
          '00000000-0000-4000-8000-000000000324',
        ],
      );
      const seededVenueImages = await pool.query<{
        id: string;
        file_name: string | null;
        mime_type: string | null;
        byte_size: number | null;
        data_url: string | null;
      }>(
        `SELECT v.id, image.file_name, image.mime_type, image.byte_size, image.data_url
         FROM venues v LEFT JOIN venue_images image ON image.venue_id = v.id
         WHERE v.id BETWEEN $1::uuid AND $2::uuid ORDER BY v.id`,
        [
          '00000000-0000-4000-8000-000000000301',
          '00000000-0000-4000-8000-000000000324',
        ],
      );
      expect(seededEvents.rows).toHaveLength(5);
      expect(
        seededEvents.rows.every(
          ({ event_name }) => !event_name.startsWith('SPM-51 Seed:'),
        ),
      ).toBe(true);
      expect(seededVenues.rows).toHaveLength(24);
      expect(seededVenueImages.rows).toHaveLength(24);
      expect(
        new Set(seededVenueImages.rows.map(({ data_url }) => data_url)).size,
      ).toBe(24);
      expect(
        seededVenueImages.rows.every((image) => {
          if (
            !image.file_name ||
            image.file_name !== `sample-venue-${image.id.slice(-3)}.svg` ||
            image.mime_type !== 'image/svg+xml' ||
            !image.byte_size ||
            image.byte_size > 5 * 1024 * 1024 ||
            !image.data_url
          )
            return false;
          const prefix = 'data:image/svg+xml;base64,';
          return (
            image.data_url.startsWith(prefix) &&
            Buffer.from(image.data_url.slice(prefix.length), 'base64')
              .toString('utf8')
              .startsWith('<svg ')
          );
        }),
      ).toBe(true);
    });

    /** VEN-BKG-03-SEC-2: only the event's assigned coordinator can create its booking request. */
    it('VEN-BKG-03-SEC-2 SPM-54 rejects an unassigned Coordinator without persisting a request', async () => {
      const owner = await createUser('VENUE_STAFF');
      const assigned = await createUser('COORDINATOR');
      const otherCoordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        assigned.id,
        'Assigned elsewhere',
      );

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', otherCoordinator.cookie)
        .send({
          eventId,
          start: '2030-01-12T06:00:00Z',
          end: '2030-01-12T07:00:00Z',
        })
        .expect(404);
      const rows = await pool.query(
        'SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(rows.rows).toEqual([]);
    });

    /** VEN-BKG-02-B / SPM-54 AC2: a pending request without hold expiry blocks an overlapping different event, while schedule visibility still distinguishes requests from time-bounded holds. */
    it('VEN-BKG-02-B SPM-54 blocks overlap on an unbounded pending request without showing it as a schedule hold', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const firstEvent = await createAssignedEvent(
        coordinator.id,
        'Pending request without hold',
      );
      const secondEvent = await createAssignedEvent(
        coordinator.id,
        'Second pending request',
      );
      const period = {
        start: '2030-01-12T06:00:00Z',
        end: '2030-01-12T07:00:00Z',
      };

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId: firstEvent, ...period })
        .expect(201);

      const persisted = await pool.query(
        'SELECT status, hold_expires_at FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, firstEvent],
      );
      expect(persisted.rows).toEqual([
        { status: 'pending', hold_expires_at: null },
      ]);
      const schedule = await request(app.getHttpServer())
        .get(`/api/venues/${venueId}`)
        .set('Cookie', coordinator.cookie)
        .expect(200);
      expect(schedule.body.reservations).toEqual([]);

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId: secondEvent, ...period })
        .expect(409)
        .expect(({ body }) => {
          expect(body.message).toContain('Pending request without hold');
        });
      const secondRequest = await pool.query(
        'SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, secondEvent],
      );
      expect(secondRequest.rows).toEqual([]);
    });

    /** VEN-AVL-10-A: a pending row without hold expiry and without a booking request for its event is not an active hold, so an overlapping submission is accepted. Kills: pending request without a Venue Staff expiry counted as an active hold (B11). */
    it('VEN-AVL-10-A ignores a pending row without hold expiry and without a request record when an overlapping request is submitted', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const unboundedEvent = await createAssignedEvent(
        coordinator.id,
        'Unbounded pending row without request',
      );
      const candidateEvent = await createAssignedEvent(
        coordinator.id,
        'Candidate overlapping unbounded pending row',
      );
      await addBooking(venueId, unboundedEvent, {
        start: '2030-01-12T06:00:00Z',
        end: '2030-01-12T07:00:00Z',
        status: 'pending',
        expires: null,
      });

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId: candidateEvent,
          start: '2030-01-12T06:00:00Z',
          end: '2030-01-12T07:00:00Z',
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body.status).toBe('pending');
          expect(body.eventId).toBe(candidateEvent);
        });
      const candidateRows = await pool.query(
        'SELECT status, hold_expires_at FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, candidateEvent],
      );
      expect(candidateRows.rows).toEqual([
        { status: 'pending', hold_expires_at: null },
      ]);
    });

    /** VEN-AVL-02-C: pending requests are tentative, not confirmed; rejected requests are absent. The schema supports rejected, not cancelled. */
    it('does not expose pending or rejected requests as confirmed venue bookings', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const pendingEvent = await createAssignedEvent(
        coordinator.id,
        'Pending schedule request',
      );
      const rejectedEvent = await createAssignedEvent(
        coordinator.id,
        'Rejected schedule request',
      );
      const period = {
        start: '2030-01-12T06:00:00Z',
        end: '2030-01-12T07:00:00Z',
      };

      await addBooking(venueId, pendingEvent, {
        ...period,
        status: 'pending',
        expires: new Date('2030-01-11T12:00:00.000Z'),
      });
      await addBooking(venueId, rejectedEvent, {
        ...period,
        status: 'rejected',
      });

      const schedule = await request(app.getHttpServer())
        .get(`/api/venues/${venueId}`)
        .set('Cookie', coordinator.cookie)
        .expect(200);

      expect(schedule.body.reservations).toEqual([
        expect.objectContaining({
          eventName: 'Pending schedule request',
          status: 'tentative',
        }),
      ]);
      expect(schedule.body.reservations).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventName: 'Rejected schedule request',
          }),
        ]),
      );
    });

    /** VEN-AVL-07-SEC-1: a fresh confirmed-booking conflict returns 409 and records no request. Kills: conflict result ignored before insert (B09). */
    it('rejects a fresh confirmed-booking conflict without persisting a request', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const candidateEvent = await createAssignedEvent(
        coordinator.id,
        'SPM-51 blocked request',
        '2030-01-12T04:00:00.000Z',
        '2030-01-12T05:00:00.000Z',
      );
      const existingEvent = await createAssignedEvent(
        coordinator.id,
        'Confirmed conflict',
      );
      await addBooking(venueId, existingEvent, {
        start: '2030-01-12T04:00:00Z',
        end: '2030-01-12T05:00:00Z',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId: candidateEvent,
          start: '2030-01-12T04:00:00Z',
          end: '2030-01-12T05:00:00Z',
        })
        .expect(409);

      expect(response.body.message).toContain('Confirmed conflict');
      const rows = await pool.query(
        `SELECT status FROM venue_bookings WHERE venue_id = $1
       AND (event_id = $2 OR event_id = $3) ORDER BY status`,
        [venueId, candidateEvent, existingEvent],
      );
      expect(rows.rows).toEqual([{ status: 'approved' }]);
    });

    /** SPM-51 AC1/AC7: the API rejects equal start and end and writes no request. Kills: equal start and end accepted (B06). */
    it('rejects equal start and end without recording a request', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(
        coordinator.id,
        'Zero duration request',
      );
      const instant = '2030-01-12T04:00:00Z';

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId, start: instant, end: instant })
        .expect(400);

      const rows = await pool.query(
        'SELECT status FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(rows.rows).toEqual([]);
    });

    /** SPM-51 AC10: only holds expiring after server now are returned and conflict with submission. Kills: exact-expiry hold remains active (B10). */
    it('filters expired and exact-expiry holds while active holds remain blockers', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const expiredCandidate = await createAssignedEvent(
        coordinator.id,
        'Expired hold available',
        '2030-01-12T04:00:00.000Z',
        '2030-01-12T05:00:00.000Z',
      );
      const exactCandidate = await createAssignedEvent(
        coordinator.id,
        'Exact expiry available',
      );
      const activeCandidate = await createAssignedEvent(
        coordinator.id,
        'Active hold blocked',
        '2030-01-12T08:00:00.000Z',
        '2030-01-12T09:00:00.000Z',
      );
      const expiredEvent = await createAssignedEvent(
        coordinator.id,
        'Expired hold',
      );
      const exactEvent = await createAssignedEvent(
        coordinator.id,
        'Exact expiry hold',
      );
      const activeEvent = await createAssignedEvent(
        coordinator.id,
        'Active hold',
      );
      await addBooking(venueId, expiredEvent, {
        start: '2030-01-12T04:00:00Z',
        end: '2030-01-12T05:00:00Z',
        status: 'pending',
        expires: new Date(fixedNow.getTime() - 1),
      });
      await addBooking(venueId, exactEvent, {
        start: '2030-01-12T06:00:00Z',
        end: '2030-01-12T07:00:00Z',
        status: 'pending',
        expires: fixedNow,
      });
      await addBooking(venueId, activeEvent, {
        start: '2030-01-12T08:00:00Z',
        end: '2030-01-12T09:00:00Z',
        status: 'pending',
        expires: new Date(fixedNow.getTime() + 1),
      });

      const schedule = await request(app.getHttpServer())
        .get(`/api/venues/${venueId}`)
        .set('Cookie', coordinator.cookie)
        .expect(200);
      expect(
        schedule.body.reservations.map(
          (row: { eventName: string }) => row.eventName,
        ),
      ).toEqual(['Active hold']);
      expect(schedule.body.reservations[0].status).toBe('tentative');

      for (const [eventId, start] of [
        [expiredCandidate, '2030-01-12T04:00:00Z'],
        [exactCandidate, '2030-01-12T06:00:00Z'],
      ])
        await request(app.getHttpServer())
          .post(`/api/venues/${venueId}/booking-requests`)
          .set('Cookie', coordinator.cookie)
          .send({
            eventId,
            start,
            end: new Date(Date.parse(start) + 60 * 60_000).toISOString(),
          })
          .expect(201);

      const activeConflict = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId: activeCandidate,
          start: '2030-01-12T08:00:00Z',
          end: '2030-01-12T09:00:00Z',
        })
        .expect(409);
      expect(activeConflict.body.message).toContain('Active hold');
    });

    /** VEN-AVL-08-A: a candidate after a booking conflicts when only turnaround occupancy overlaps. */
    it('rejects a candidate after a booking when turnaround occupancy overlaps', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, {
        setupTimeMinutes: 0,
        turnaroundTimeMinutes: 45,
      });
      const candidate = await createAssignedEvent(
        coordinator.id,
        'After buffer conflict',
        '2030-01-12T05:20:00.000Z',
        '2030-01-12T06:00:00.000Z',
      );
      const existing = await createAssignedEvent(
        coordinator.id,
        'Existing earlier event',
      );
      await addBooking(venueId, existing, {
        start: '2030-01-12T04:00:00Z',
        end: '2030-01-12T05:00:00Z',
      });

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidate,
        '2030-01-12T05:20:00Z',
        '2030-01-12T06:00:00Z',
        'Existing earlier event',
      );
    });

    /** VEN-AVL-08-B: a candidate before a booking conflicts when only setup occupancy overlaps. Kills: B12-A. */
    it('rejects a candidate before a booking when setup occupancy overlaps', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, {
        setupTimeMinutes: 30,
        turnaroundTimeMinutes: 0,
      });
      const candidate = await createAssignedEvent(
        coordinator.id,
        'Before buffer conflict',
        '2030-01-12T04:00:00.000Z',
        '2030-01-12T05:00:00.000Z',
      );
      const existing = await createAssignedEvent(
        coordinator.id,
        'Existing later event',
      );
      await addBooking(venueId, existing, {
        start: '2030-01-12T05:20:00Z',
        end: '2030-01-12T06:00:00Z',
      });

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidate,
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'Existing later event',
      );
    });

    /** VEN-AVL-07-C: a Maintenance blockout rejects a request, reports its reason, and inserts no booking. */
    it('rejects a request inside a Maintenance blockout without persisting it', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const candidate = await createAssignedEvent(
        coordinator.id,
        'Maintenance blockout candidate',
        '2030-01-12T04:00:00.000Z',
        '2030-01-12T05:00:00.000Z',
      );
      await addBlockout(
        venueId,
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'Maintenance',
      );

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidate,
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'Maintenance',
      );
    });

    /** VEN-AVL-08-A: setup and turnaround blockout intersections both reject without insertion. Kills: setup or turnaround occupancy omitted for blockouts (B12-B, B12-C). */
    it('rejects setup-only and turnaround-only blockout conflicts without insertion', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const setupVenueId = await createVenue(owner.id, {
        setupTimeMinutes: 30,
        turnaroundTimeMinutes: 0,
      });
      const turnaroundVenueId = await createVenue(owner.id, {
        setupTimeMinutes: 0,
        turnaroundTimeMinutes: 45,
      });
      const setupCandidate = await createAssignedEvent(
        coordinator.id,
        'Setup blockout candidate',
        '2030-01-12T04:00:00.000Z',
        '2030-01-12T05:00:00.000Z',
      );
      const turnaroundCandidate = await createAssignedEvent(
        coordinator.id,
        'Turnaround blockout candidate',
        '2030-01-12T06:00:00.000Z',
        '2030-01-12T07:00:00.000Z',
      );
      await addBlockout(
        setupVenueId,
        '2030-01-12T03:45:00Z',
        '2030-01-12T03:55:00Z',
        'Setup cleaning',
      );
      await addBlockout(
        turnaroundVenueId,
        '2030-01-12T07:20:00Z',
        '2030-01-12T07:30:00Z',
        'Turnaround maintenance',
      );

      await expectConflictWithoutRequest(
        setupVenueId,
        coordinator.cookie,
        setupCandidate,
        '2030-01-12T04:00:00Z',
        '2030-01-12T05:00:00Z',
        'Setup cleaning',
      );
      await expectConflictWithoutRequest(
        turnaroundVenueId,
        coordinator.cookie,
        turnaroundCandidate,
        '2030-01-12T06:00:00Z',
        '2030-01-12T07:00:00Z',
        'Turnaround maintenance',
      );
    });

    /** VEN-BKG-06-A: a setup-buffer-only blockout marks the original booking affected while retaining its event and replacement request. */
    it('VEN-BKG-06-A SPM-54 marks a setup-buffer-only blockout as affecting the original booking and preserves replacement context', async () => {
      await expectBufferedBlockoutInMyBookings({
        start: '2030-01-12T05:45:00.000Z',
        end: '2030-01-12T05:55:00.000Z',
      });
    });

    /** VEN-BKG-06-A: a turnaround-buffer-only blockout marks the original booking affected while retaining its event and replacement request. */
    it('VEN-BKG-06-A SPM-54 marks a turnaround-buffer-only blockout as affecting the original booking and preserves replacement context', async () => {
      await expectBufferedBlockoutInMyBookings({
        start: '2030-01-12T07:05:00.000Z',
        end: '2030-01-12T07:15:00.000Z',
      });
    });

    /** VEN-BKG-06-A: a blockout outside the buffered window does not affect the original My Bookings row. Kills: SPM54-BE-MY-BOOKINGS-INTERSECTION. */
    it('VEN-BKG-06-A SPM-54 leaves the original booking unaffected by a blockout outside its buffered window', async () => {
      await expectBufferedBlockoutInMyBookings(
        {
          start: '2030-01-12T07:21:00.000Z',
          end: '2030-01-12T07:30:00.000Z',
        },
        false,
      );
    });

    /** VEN-BKG-06-A: a blockout ending exactly at the setup-buffer boundary does not affect the original My Bookings row. Kills: SPM54-BE-MY-BOOKINGS-SETUP-INCLUSIVE. */
    it('VEN-BKG-06-A SPM-54 leaves the original booking unaffected by a blockout ending at its setup-buffer boundary', async () => {
      await expectBufferedBlockoutInMyBookings(
        {
          start: '2030-01-12T05:25:00.000Z',
          end: '2030-01-12T05:30:00.000Z',
        },
        false,
      );
    });

    /** VEN-BKG-06-A: a blockout starting exactly at the turnaround-buffer end does not affect the original My Bookings row. Kills: SPM54-BE-MY-BOOKINGS-TURNAROUND-INCLUSIVE. */
    it('VEN-BKG-06-A SPM-54 leaves the original booking unaffected by a blockout starting at its turnaround-buffer end', async () => {
      await expectBufferedBlockoutInMyBookings(
        {
          start: '2030-01-12T07:20:00.000Z',
          end: '2030-01-12T07:30:00.000Z',
        },
        false,
      );
    });

    /** VEN-REV-10-A SPM-55 AC2: Venue Staff approve a pending request; the booking moves to approved and an audit row is written. */
    it('VEN-REV-10-A SPM-55 approves a pending booking request and writes an audit log row', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'SPM-55 Approve Event');

      const bookingRow = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1, $2, '2030-01-12T06:00:00.000Z', '2030-01-12T07:00:00.000Z', 'pending')
         RETURNING id`,
        [venueId, eventId],
      );
      await pool.query(
        `INSERT INTO venue_booking_requests (event_id, venue_id) VALUES ($1, $2)`,
        [eventId, venueId],
      );
      const bookingId = bookingRow.rows[0].id;

      const response = await request(app.getHttpServer())
        .post(`/api/venues/bookings/${bookingId}/approve`)
        .set('Cookie', owner.cookie)
        .expect(201);

      expect(response.body).toMatchObject({ id: bookingId, status: 'approved' });

      const db = await pool.query<{ status: string }>(
        'SELECT status FROM venue_bookings WHERE id = $1',
        [bookingId],
      );
      expect(db.rows[0].status).toBe('approved');

      const log = await pool.query<{ action: string }>(
        'SELECT action FROM booking_review_log WHERE booking_id = $1',
        [bookingId],
      );
      expect(log.rows[0].action).toBe('approved');
    });

    /** VEN-REV-10-B SPM-55 AC3: Venue Staff reject a pending request with a reason; the booking moves to rejected, the reason is stored, and an audit row is written. */
    it('VEN-REV-10-B SPM-55 rejects a pending booking request with a reason and writes an audit log row', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'SPM-55 Reject Event');

      const bookingRow = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1, $2, '2030-01-13T06:00:00.000Z', '2030-01-13T07:00:00.000Z', 'pending')
         RETURNING id`,
        [venueId, eventId],
      );
      await pool.query(
        `INSERT INTO venue_booking_requests (event_id, venue_id) VALUES ($1, $2)`,
        [eventId, venueId],
      );
      const bookingId = bookingRow.rows[0].id;

      const response = await request(app.getHttpServer())
        .post(`/api/venues/bookings/${bookingId}/reject`)
        .set('Cookie', owner.cookie)
        .send({ reason: 'Clashes with scheduled maintenance' })
        .expect(201);

      expect(response.body).toMatchObject({
        id: bookingId,
        status: 'rejected',
        rejectionReason: 'Clashes with scheduled maintenance',
      });

      const db = await pool.query<{ status: string; rejection_reason: string }>(
        'SELECT status, rejection_reason FROM venue_bookings WHERE id = $1',
        [bookingId],
      );
      expect(db.rows[0].status).toBe('rejected');
      expect(db.rows[0].rejection_reason).toBe('Clashes with scheduled maintenance');

      const log = await pool.query<{ action: string; reason: string }>(
        'SELECT action, reason FROM booking_review_log WHERE booking_id = $1',
        [bookingId],
      );
      expect(log.rows[0].action).toBe('rejected');
      expect(log.rows[0].reason).toBe('Clashes with scheduled maintenance');
    });

    /** VEN-REV-11-A SPM-55: migration 022 backfill assigns the surviving note only to the most-recent booking attempt. */
    it('VEN-REV-11-A SPM-55 migration backfill does not assign a newer note to an older booking attempt', async () => {
      const coordinator = await createUser('COORDINATOR');
      const owner = await createUser('VENUE_STAFF');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'VEN-REV-11-A backfill event');

      // Insert two historical booking attempts with NULL special_request (pre-migration state).
      const olderRow = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
         VALUES ($1, $2, '2030-01-12T06:00:00.000Z', '2030-01-12T07:00:00.000Z', 'rejected')
         RETURNING id`,
        [venueId, eventId],
      );
      const olderId = olderRow.rows[0].id;

      // Force a slightly later created_at so the newer row wins DISTINCT ON ordering.
      const newerRow = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, created_at)
         VALUES ($1, $2, '2030-01-14T06:00:00.000Z', '2030-01-14T07:00:00.000Z', 'pending',
                 now() + interval '1 second')
         RETURNING id`,
        [venueId, eventId],
      );
      const newerId = newerRow.rows[0].id;

      // Seed the shared venue_booking_requests row — only the latest note survives.
      await pool.query(
        `INSERT INTO venue_booking_requests (event_id, venue_id, special_request)
         VALUES ($1, $2, 'Need a projector')
         ON CONFLICT (event_id, venue_id) DO UPDATE SET special_request = EXCLUDED.special_request`,
        [eventId, venueId],
      );

      // Re-run the backfill portion of migration 022 against the live test DB.
      await pool.query(`
        UPDATE venue_bookings b
           SET special_request = r.special_request
          FROM venue_booking_requests r,
               (
                 SELECT DISTINCT ON (event_id, venue_id) id
                   FROM venue_bookings
                  WHERE event_id IS NOT NULL
                  ORDER BY event_id, venue_id, created_at DESC
               ) latest
         WHERE latest.id = b.id
           AND r.event_id = b.event_id
           AND r.venue_id = b.venue_id
           AND b.special_request IS NULL
           AND r.special_request IS NOT NULL
      `);

      const rows = await pool.query<{ id: string; special_request: string | null }>(
        'SELECT id, special_request FROM venue_bookings WHERE id = ANY($1::uuid[])',
        [[olderId, newerId]],
      );
      const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.special_request]));

      expect(byId[olderId]).toBeNull();
      expect(byId[newerId]).toBe('Need a projector');
    });
  },
);
