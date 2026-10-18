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
let currentNow = fixedNow;
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
        '011_spm54_venue_booking_requests.sql',
        '012_spm54_event_venue_request_key.sql',
      ])
        await pool.query(
          await readFile(
            new URL(`../migrations/${migration}`, import.meta.url),
            'utf8',
          ),
        );

      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CLOCK)
        .useValue({ now: () => currentNow })
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
      const cookie = login.headers['set-cookie']?.find((value) =>
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
      period = { start: '2030-01-12T04:00:00.000Z', end: '2030-01-12T05:00:00.000Z' },
    ) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO events
       (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
        start_date_time, end_date_time, expected_attendance, status, coordinator_id,
        coordinator_name, submission_key)
       VALUES ($1, 'spm51-test', 'SPM-51 Organiser', 'spm51@example.test', $2,
        'Venue availability integration', $3, $4, 10, 'Approved', $5, 'SPM-51 Coordinator', $1)`,
        [
          id,
          name,
          new Date(period.start),
          new Date(period.end),
          coordinatorId,
        ],
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

    async function expectConflictWithoutRequest(
      venueId: string,
      coordinatorCookie: string,
      eventId: string,
      reason: string,
    ) {
      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinatorCookie)
        .send({ eventId })
        .expect(409);
      expect(response.body.message).toContain(reason);
      const candidateRows = await pool.query(
        'SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(candidateRows.rows).toEqual([]);
    }

    /** VEN-AVL-06-A: assigned coordinator requests are persisted by the real HTTP/API path. */
    it('creates a pending request for an assigned coordinator event', async () => {
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
        })
        .expect(201);

      expect(response.body).toMatchObject({
        eventId,
        venueId,
        status: 'pending',
      });
      expect(response.body.bookingReference).toMatch(/^VB-[A-F0-9]{8}$/);
      const persisted = await pool.query(
        `SELECT b.status, b.start_at, b.end_at, e.start_date_time, e.end_date_time
           FROM venue_bookings b JOIN events e ON e.id = b.event_id
          WHERE b.venue_id = $1 AND b.event_id = $2`,
        [venueId, eventId],
      );
      expect(persisted.rows).toEqual([{ status: 'pending', start_at: new Date('2030-01-12T04:00:00.000Z'), end_at: new Date('2030-01-12T05:00:00.000Z'), start_date_time: new Date('2030-01-12T04:00:00.000Z'), end_date_time: new Date('2030-01-12T05:00:00.000Z') }]);
      const requestRow = await pool.query(
        'SELECT event_id, venue_id, special_request FROM venue_booking_requests WHERE event_id = $1 AND venue_id = $2',
        [eventId, venueId],
      );
      expect(requestRow.rows).toEqual([{ event_id: eventId, venue_id: venueId, special_request: null }]);
    });

    /** SPM-54 AC3: callers cannot spoof event times; the booking API stores only the event's persisted period. */
    it('rejects client-supplied booking times without creating a request', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Spoofed event time');

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId,
          start: '2030-01-12T06:00:00Z',
          end: '2030-01-12T07:00:00Z',
        })
        .expect(400);

      expect((await pool.query('SELECT 1 FROM venue_bookings WHERE event_id = $1 AND venue_id = $2', [eventId, venueId])).rows).toEqual([]);
      expect((await pool.query('SELECT 1 FROM venue_booking_requests WHERE event_id = $1 AND venue_id = $2', [eventId, venueId])).rows).toEqual([]);
    });

    /** SPM-54 AC5: concurrent same-pair submissions serialize and leave one durable request. */
    it('allows only one concurrent request for an event/venue pair', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Concurrent request pair');
      const submit = () => request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId });

      const responses = await Promise.all([submit(), submit()]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect((await pool.query('SELECT event_id, venue_id FROM venue_booking_requests WHERE event_id = $1 AND venue_id = $2', [eventId, venueId])).rows).toEqual([{ event_id: eventId, venue_id: venueId }]);
      expect((await pool.query('SELECT id FROM venue_bookings WHERE event_id = $1 AND venue_id = $2', [eventId, venueId])).rows).toHaveLength(1);
    });

    /** SPM-54 data model: request identity is exactly the event/venue composite key with one canonical note. */
    it('stores request identity as a composite primary key without a surrogate id', async () => {
      const columns = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'venue_booking_requests'
          ORDER BY ordinal_position`,
      );
      const primaryKey = await pool.query<{ column_name: string; ordinal_position: number }>(
        `SELECT a.attname AS column_name, u.ordinality AS ordinal_position
           FROM pg_constraint c
           JOIN unnest(c.conkey) WITH ORDINALITY AS u(attnum, ordinality) ON true
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
          WHERE c.conrelid = 'venue_booking_requests'::regclass AND c.contype = 'p'
          ORDER BY u.ordinality`,
      );
      expect(columns.rows.map(({ column_name }) => column_name)).toEqual(['event_id', 'venue_id', 'special_request']);
      expect(primaryKey.rows.map(({ column_name }) => column_name)).toEqual(['event_id', 'venue_id']);
      const legacyColumn = await pool.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'venue_bookings' AND column_name = 'special_requests'`,
      );
      expect(legacyColumn.rows).toEqual([]);
    });

    /** SPM-54 AC1: confirmed events cannot create venue-booking rows even when assigned to the coordinator. */
    it('rejects a confirmed event with HTTP 409 and does not insert a venue booking', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Confirmed event without venue');
      await pool.query("UPDATE events SET status = 'Confirmed' WHERE id = $1", [eventId]);

      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(409);

      expect(response.body.message).toBe('Only approved or planning events can have venue booking requests.');
      const persisted = await pool.query(
        'SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(persisted.rows).toEqual([]);
    });

    /** SPM-54 AC5: the same event cannot create an overlapping request for one venue; its other venue request remains allowed. */
    it('returns the existing booking reference for a repeated same-venue request but allows another venue', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, { setupTimeMinutes: 30, turnaroundTimeMinutes: 45 });
      const secondVenueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Repeated request event');
      const first = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`).set('Cookie', coordinator.cookie)
        .send({ eventId }).expect(201);

      const duplicate = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`).set('Cookie', coordinator.cookie)
        .send({ eventId }).expect(409);
      expect(duplicate.body).toMatchObject({ code: 'duplicate_venue_request', bookingId: first.body.id, bookingReference: first.body.bookingReference });
      expect((await pool.query('SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2', [venueId, eventId])).rows).toEqual([{ id: first.body.id }]);

      const otherEventId = await createAssignedEvent(coordinator.id, 'Independent same-venue event');
      const independent = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`).set('Cookie', coordinator.cookie)
        .send({ eventId: otherEventId }).expect(201);
      expect(independent.body).toMatchObject({ eventId: otherEventId, venueId, status: 'pending' });

      const otherVenue = await request(app.getHttpServer())
        .post(`/api/venues/${secondVenueId}/booking-requests`).set('Cookie', coordinator.cookie)
        .send({ eventId }).expect(201);
      expect(otherVenue.body).toMatchObject({ eventId, venueId: secondVenueId, status: 'pending' });
    });

    /** SPM-54 AC5: a prior request stays unique after event dates change, so duplicate detection cannot depend on time. */
    it('rejects a repeat event/venue request after the event period changes', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Request after event reschedule');
      const first = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(201);

      await pool.query(
        `UPDATE events SET start_date_time = $2, end_date_time = $3 WHERE id = $1`,
        [eventId, new Date('2030-02-12T04:00:00.000Z'), new Date('2030-02-12T05:00:00.000Z')],
      );

      const duplicate = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(409);
      expect(duplicate.body).toMatchObject({
        code: 'duplicate_venue_request',
        bookingId: first.body.id,
        bookingReference: first.body.bookingReference,
      });
      expect((await pool.query(
        'SELECT id, start_at, end_at FROM venue_bookings WHERE event_id = $1 AND venue_id = $2',
        [eventId, venueId],
      )).rows).toEqual([{
        id: first.body.id,
        start_at: new Date('2030-01-12T04:00:00.000Z'),
        end_at: new Date('2030-01-12T05:00:00.000Z'),
      }]);
      expect((await pool.query(
        'SELECT event_id, venue_id FROM venue_booking_requests WHERE event_id = $1 AND venue_id = $2',
        [eventId, venueId],
      )).rows).toEqual([{ event_id: eventId, venue_id: venueId }]);
    });

    async function expectHistoricalRequestReplacement(historyStatus: 'approved' | 'cancelled' | 'rejected') {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, `Historical ${historyStatus} request`);
      const prior = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`).set('Cookie', coordinator.cookie)
        .send({ eventId }).expect(201);
      await pool.query('UPDATE venue_bookings SET status = $2 WHERE id = $1', [prior.body.id, historyStatus]);

      const replacement = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`).set('Cookie', coordinator.cookie)
        .send({ eventId }).expect(409);
      expect(replacement.body).toMatchObject({ code: 'duplicate_venue_request', bookingId: prior.body.id });
      expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [prior.body.id])).rows).toEqual([{ status: historyStatus }]);
    }

    /** SPM-54 AC5: canceled request history permanently prevents another request for the same event and venue. */
    it('cancelled booking history permanently prevents another request at the same venue', async () => {
      await expectHistoricalRequestReplacement('cancelled');
    });

    /** SPM-54 AC5: rejected request history permanently prevents another request for the same event and venue. */
    it('rejected booking history permanently prevents another request at the same venue', async () => {
      await expectHistoricalRequestReplacement('rejected');
    });

    /** SPM-54 AC5: approved booking history permanently prevents another request for the same event and venue. */
    it('approved booking history permanently prevents another request at the same venue', async () => {
      await expectHistoricalRequestReplacement('approved');
    });

    /** Planning events remain eligible for a venue booking request. */
    it('creates a pending request for a Planning event', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Planning event venue request');
      await pool.query("UPDATE events SET status = 'Planning' WHERE id = $1", [eventId]);

      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(201);

      expect(response.body).toMatchObject({ eventId, venueId, status: 'pending' });
      expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [response.body.id])).rows).toEqual([{ status: 'pending' }]);
    });

    /** SPM-54 AC5: removing a rejected request from Planning preserves permanent pair identity and prevents a second booking row. */
    it('preserves the cancelled request key when a Planning venue request is removed', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Removed Planning venue request');
      await pool.query("UPDATE events SET status = 'Planning' WHERE id = $1", [eventId]);
      const original = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(201);
      await pool.query("UPDATE venue_bookings SET status = 'rejected' WHERE id = $1", [original.body.id]);

      await request(app.getHttpServer())
        .delete(`/api/events/${eventId}/venue-requests/${original.body.id}`)
        .set('Cookie', coordinator.cookie)
        .expect(200)
        .expect({ eventId, venueRequestId: original.body.id, removed: true });

      const duplicate = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(409);
      expect(duplicate.body).toMatchObject({
        code: 'duplicate_venue_request',
        bookingId: original.body.id,
        bookingReference: original.body.bookingReference,
      });
      expect((await pool.query(
        'SELECT id, status FROM venue_bookings WHERE event_id = $1 AND venue_id = $2',
        [eventId, venueId],
      )).rows).toEqual([{ id: original.body.id, status: 'cancelled' }]);
      expect((await pool.query(
        'SELECT event_id, venue_id FROM venue_booking_requests WHERE event_id = $1 AND venue_id = $2',
        [eventId, venueId],
      )).rows).toEqual([{ event_id: eventId, venue_id: venueId }]);
    });

    /** SPM-54 AC6/AC7: an affected original remains preserved when the coordinator adds a replacement venue request. */
    it('preserves an affected first request while adding a replacement venue', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const originalVenueId = await createVenue(owner.id);
      const replacementVenueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Affected first venue request');
      const original = await request(app.getHttpServer())
        .post(`/api/venues/${originalVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId, specialRequests: 'Preserve the original request note.' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/venues/${originalVenueId}/unavailable-periods`)
        .set('Cookie', owner.cookie)
        .send({ start: '2030-01-12T04:00:00Z', end: '2030-01-12T05:00:00Z', reason: 'Scheduled facility maintenance' })
        .expect(201);

      const replacement = await request(app.getHttpServer())
        .post(`/api/venues/${replacementVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(201);
      const bookings = await request(app.getHttpServer())
        .get('/api/venues/my-bookings')
        .set('Cookie', coordinator.cookie)
        .expect(200);
      expect(bookings.body).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: original.body.id,
          venueId: originalVenueId,
          status: 'pending',
          specialRequests: 'Preserve the original request note.',
          affectedByUnavailablePeriod: true,
        }),
        expect.objectContaining({
          id: replacement.body.id,
          venueId: replacementVenueId,
          status: 'pending',
          affectedByUnavailablePeriod: false,
        }),
      ]));
      expect((await pool.query(
        'SELECT status FROM venue_bookings WHERE id = $1',
        [original.body.id],
      )).rows).toEqual([{ status: 'pending' }]);
    });

    /** VEN-BKG-03/05/06/07/08/09/10: replacement requests preserve the affected row; each venue request is listed and cancelled independently. */
    it('lists multiple requests for one event, identifies an unavailable venue, and confirms last-booking cancellation', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const originalVenueId = await createVenue(owner.id);
      const replacementVenueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'SPM-54 replacement event');
      const original = await request(app.getHttpServer()).post(`/api/venues/${originalVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie).send({ eventId, specialRequests: 'Step-free access' }).expect(201);
      const originalEvent = await pool.query('SELECT event_name, start_date_time, end_date_time, expected_attendance FROM events WHERE id = $1', [eventId]);
      const replacement = await request(app.getHttpServer()).post(`/api/venues/${replacementVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie).send({ eventId }).expect(201);

      await request(app.getHttpServer()).post(`/api/venues/${originalVenueId}/unavailable-periods`)
        .set('Cookie', owner.cookie).send({ start: '2030-01-12T04:00:00Z', end: '2030-01-12T05:00:00Z', reason: 'Facility closure' }).expect(201);
      const closureEvent = await createAssignedEvent(coordinator.id, 'Event blocked by venue closure');
      await expectConflictWithoutRequest(originalVenueId, coordinator.cookie, closureEvent,
        'Facility closure');
      const listed = await request(app.getHttpServer()).get('/api/venues/my-bookings').set('Cookie', coordinator.cookie).expect(200);
      expect(listed.body).toHaveLength(2);
      expect(listed.body).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: original.body.id, eventId, venueId: originalVenueId, status: 'pending', specialRequests: 'Step-free access', affectedByUnavailablePeriod: true }),
        expect.objectContaining({ id: replacement.body.id, eventId, venueId: replacementVenueId, status: 'pending', affectedByUnavailablePeriod: false }),
      ]));
      expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [original.body.id])).rows).toEqual([{ status: 'pending' }]);
      expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [replacement.body.id])).rows).toEqual([{ status: 'pending' }]);
      expect((await pool.query('SELECT event_name, start_date_time, end_date_time, expected_attendance FROM events WHERE id = $1', [eventId])).rows).toEqual(originalEvent.rows);
      expect(original.body.id).not.toBe(replacement.body.id);

      await request(app.getHttpServer()).post(`/api/venues/booking-requests/${original.body.id}/cancel`)
        .set('Cookie', coordinator.cookie).send({ confirmLastActive: false }).expect(201);
      expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [replacement.body.id])).rows).toEqual([{ status: 'pending' }]);
      await request(app.getHttpServer()).post(`/api/venues/booking-requests/${replacement.body.id}/cancel`)
        .set('Cookie', coordinator.cookie).send({ confirmLastActive: false }).expect(409);
      await request(app.getHttpServer()).post(`/api/venues/booking-requests/${replacement.body.id}/cancel`)
        .set('Cookie', coordinator.cookie).send({ confirmLastActive: true }).expect(201);
    });

    /** VEN-BKG-08-A/SEC-1 and VEN-BKG-09/10-A/C: status rows are independently listed; rejected/cancelled do not count as active; only the selected active booking changes. */
    it('lists all booking statuses and only warns when cancelling the final pending or confirmed booking', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const secondVenueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'SPM-54 status lifecycle');
      const pending = await request(app.getHttpServer()).post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie).send({ eventId }).expect(201);
      const confirmed = await request(app.getHttpServer()).post(`/api/venues/${secondVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie).send({ eventId }).expect(201);
      await pool.query("UPDATE venue_bookings SET status = 'approved' WHERE id = $1", [confirmed.body.id]);
      const rejectedEvent = await createAssignedEvent(coordinator.id, 'Rejected history row');
      const cancelledEvent = await createAssignedEvent(coordinator.id, 'Cancelled history row');
      await addBooking(venueId, rejectedEvent, { start: '2030-01-12T08:00:00Z', end: '2030-01-12T09:00:00Z', status: 'rejected' });
      await addBooking(venueId, cancelledEvent, { start: '2030-01-12T10:00:00Z', end: '2030-01-12T11:00:00Z', status: 'cancelled' });

      const listed = await request(app.getHttpServer()).get('/api/venues/my-bookings').set('Cookie', coordinator.cookie).expect(200);
      expect(listed.body.map((row: { status: string }) => row.status)).toEqual(expect.arrayContaining(['pending', 'approved', 'rejected', 'cancelled']));
      await request(app.getHttpServer()).post(`/api/venues/booking-requests/${pending.body.id}/cancel`)
        .set('Cookie', coordinator.cookie).send({ confirmLastActive: false }).expect(201);
      await request(app.getHttpServer()).post(`/api/venues/booking-requests/${confirmed.body.id}/cancel`)
        .set('Cookie', coordinator.cookie).send({ confirmLastActive: false }).expect(409);
      expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [confirmed.body.id])).rows).toEqual([{ status: 'approved' }]);
      await request(app.getHttpServer()).post(`/api/venues/booking-requests/${confirmed.body.id}/cancel`)
        .set('Cookie', coordinator.cookie).send({ confirmLastActive: true }).expect(201);
      expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [confirmed.body.id])).rows).toEqual([{ status: 'cancelled' }]);
    });

    /** SPM-54 AC10: rejected and cancelled venue rows do not count as active alternatives to the one live request. */
    it('requires last-active confirmation when only rejected and cancelled rows accompany the active booking', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const activeVenueId = await createVenue(owner.id);
      const rejectedVenueId = await createVenue(owner.id);
      const cancelledVenueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Only one active request remains');
      const active = await request(app.getHttpServer())
        .post(`/api/venues/${activeVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(201);
      const rejected = await request(app.getHttpServer())
        .post(`/api/venues/${rejectedVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(201);
      const cancelled = await request(app.getHttpServer())
        .post(`/api/venues/${cancelledVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(201);
      await pool.query("UPDATE venue_bookings SET status = 'rejected' WHERE id = $1", [rejected.body.id]);
      await pool.query("UPDATE venue_bookings SET status = 'cancelled' WHERE id = $1", [cancelled.body.id]);

      const missingConfirmation = await request(app.getHttpServer())
        .post(`/api/venues/booking-requests/${active.body.id}/cancel`)
        .set('Cookie', coordinator.cookie)
        .send({ confirmLastActive: false })
        .expect(409);
      expect(missingConfirmation.body.message)
        .toContain('This is the last active venue booking for this event.');
      expect((await pool.query(
        'SELECT status FROM venue_bookings WHERE id = $1',
        [active.body.id],
      )).rows).toEqual([{ status: 'pending' }]);
      await request(app.getHttpServer())
        .post(`/api/venues/booking-requests/${active.body.id}/cancel`)
        .set('Cookie', coordinator.cookie)
        .send({ confirmLastActive: true })
        .expect(201);
      expect((await pool.query(
        'SELECT status FROM venue_bookings WHERE id = $1',
        [active.body.id],
      )).rows).toEqual([{ status: 'cancelled' }]);
    });

    /** VEN-BKG-02-BND-1/BND-2: setup and turnaround use strict overlap, so exact adjacency is available while actual overlap conflicts. */
    it('accepts exact setup-plus-turnaround adjacency without creating a false conflict', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, { setupTimeMinutes: 30, turnaroundTimeMinutes: 45 });
      const existing = await createAssignedEvent(coordinator.id, 'Boundary confirmed event');
      await addBooking(venueId, existing, { start: '2030-01-12T04:00:00Z', end: '2030-01-12T05:00:00Z', status: 'approved' });
      const adjacent = await createAssignedEvent(coordinator.id, 'Exact boundary candidate', { start: '2030-01-12T06:15:00.000Z', end: '2030-01-12T07:15:00.000Z' });
      const response = await request(app.getHttpServer()).post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie).send({ eventId: adjacent }).expect(201);
      expect(response.body).toMatchObject({ eventId: adjacent, status: 'pending' });
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

    /** SPM-54 AC3: only the event's assigned coordinator can create its booking request. */
    it('rejects an unassigned coordinator without persisting a request', async () => {
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
        })
        .expect(404);
      const rows = await pool.query(
        'SELECT id FROM venue_bookings WHERE venue_id = $1 AND event_id = $2',
        [venueId, eventId],
      );
      expect(rows.rows).toEqual([]);
    });

    /** SPM-54 AC8/AC9: booking lists and cancellation are scoped to the authenticated Coordinator's assigned events. */
    it('hides another Coordinator booking and refuses their cancellation attempt', async () => {
      const owner = await createUser('VENUE_STAFF');
      const assigned = await createUser('COORDINATOR');
      const otherCoordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(assigned.id, 'Coordinator-private venue request');
      const booking = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', assigned.cookie)
        .send({ eventId })
        .expect(201);

      const otherList = await request(app.getHttpServer())
        .get('/api/venues/my-bookings')
        .set('Cookie', otherCoordinator.cookie)
        .expect(200);
      expect(otherList.body).toEqual([]);

      await request(app.getHttpServer())
        .post(`/api/venues/booking-requests/${booking.body.id}/cancel`)
        .set('Cookie', otherCoordinator.cookie)
        .send({ confirmLastActive: true })
        .expect(404);
      expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [booking.body.id])).rows)
        .toEqual([{ status: 'pending' }]);
    });

    /** SPM-54 AC1/AC7: a valid first request remains unchanged when another venue is unsuitable. */
    it('keeps a valid first venue request when a second venue fails suitability', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const validVenueId = await createVenue(owner.id);
      const unsuitableVenueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'First request remains on second venue failure');
      await pool.query('UPDATE events SET expected_attendance = 101 WHERE id = $1', [eventId]);
      // Make the first venue suitable for this event while the second retains its original capacity.
      await pool.query('UPDATE venues SET capacity = 101 WHERE id = $1', [validVenueId]);

      const first = await request(app.getHttpServer())
        .post(`/api/venues/${validVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId, specialRequests: 'Keep the step-free entrance clear.' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/venues/${unsuitableVenueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(409);

      expect((await pool.query(
        'SELECT id, status FROM venue_bookings WHERE event_id = $1 ORDER BY venue_id',
        [eventId],
      )).rows).toEqual([{ id: first.body.id, status: 'pending' }]);
      expect((await pool.query(
        'SELECT event_id, venue_id, special_request FROM venue_booking_requests WHERE event_id = $1',
        [eventId],
      )).rows).toEqual([{
        event_id: eventId,
        venue_id: validVenueId,
        special_request: 'Keep the step-free entrance clear.',
      }]);
    });

    /** SPM-54 AC3: booking requests use assigned event attendance and reject client attempts to alter it. */
    it('rejects client-supplied attendance without creating a booking or request key', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Attendance tamper attempt');

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId, expectedAttendance: 1 })
        .expect(400);

      expect((await pool.query(
        'SELECT id FROM venue_bookings WHERE event_id = $1 AND venue_id = $2',
        [eventId, venueId],
      )).rows).toEqual([]);
      expect((await pool.query(
        'SELECT event_id FROM venue_booking_requests WHERE event_id = $1 AND venue_id = $2',
        [eventId, venueId],
      )).rows).toEqual([]);
    });

    /** SPM-54 AC1: an unsuitable event is refused without creating booking or request persistence. */
    it('rejects an unsuitable venue without creating a booking or request key', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const eventId = await createAssignedEvent(coordinator.id, 'Attendance exceeds venue capacity');
      await pool.query('UPDATE events SET expected_attendance = 101 WHERE id = $1', [eventId]);

      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId })
        .expect(409);
      expect(response.body).toMatchObject({
        message: 'This venue does not meet the event requirements.',
        reasons: ['Capacity 100 is below required attendance 101.'],
      });
      expect((await pool.query(
        'SELECT id FROM venue_bookings WHERE event_id = $1 AND venue_id = $2',
        [eventId, venueId],
      )).rows).toEqual([]);
      expect((await pool.query(
        'SELECT event_id FROM venue_booking_requests WHERE event_id = $1 AND venue_id = $2',
        [eventId, venueId],
      )).rows).toEqual([]);
    });

    /** SPM-54 AC5 / SPM-51 AC7: a pending request without Venue Staff hold expiry is not a tentative blocker. Kills: unbounded pending request treated as an active hold (B11). */
    it('keeps a pending request without expiry out of holds and conflict checks', async () => {
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
      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId: firstEvent })
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
        .send({ eventId: secondEvent })
        .expect(201);
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
        start: new Date('2030-01-12T04:00:00.000Z'),
        end: new Date('2030-01-12T05:00:00.000Z'),
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

    /** SPM-54 AC3: the API rejects client-supplied intervals and writes no request. */
    it('rejects client-supplied event times without recording a request', async () => {
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
        { start: '2030-01-12T04:00:00Z', end: '2030-01-12T05:00:00Z' },
      );
      const exactCandidate = await createAssignedEvent(
        coordinator.id,
        'Exact expiry available',
        { start: '2030-01-12T06:00:00Z', end: '2030-01-12T07:00:00Z' },
      );
      const activeCandidate = await createAssignedEvent(
        coordinator.id,
        'Active hold blocked',
        { start: '2030-01-12T08:00:00Z', end: '2030-01-12T09:00:00Z' },
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

      for (const eventId of [expiredCandidate, exactCandidate])
        await request(app.getHttpServer())
          .post(`/api/venues/${venueId}/booking-requests`)
          .set('Cookie', coordinator.cookie)
          .send({ eventId })
          .expect(201);

      const activeConflict = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({
          eventId: activeCandidate,
        })
        .expect(409);
      expect(activeConflict.body.message).toContain('Active hold');
    });

    /** SPM-51 AC10: an active hold stops blocking at its expiry instant according to the injected server clock. */
    it('transitions an active hold to available when the server clock reaches expiry', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id);
      const heldEvent = await createAssignedEvent(coordinator.id, 'Hold expires during check');
      const candidateEvent = await createAssignedEvent(coordinator.id, 'Candidate after hold expiry');
      const expiresAt = new Date('2030-01-11T12:00:00.000Z');
      await addBooking(venueId, heldEvent, {
        start: '2030-01-12T04:00:00Z',
        end: '2030-01-12T05:00:00Z',
        status: 'pending',
        expires: expiresAt,
      });

      try {
        currentNow = new Date('2030-01-11T11:59:59.999Z');
        const activeSchedule = await request(app.getHttpServer())
          .get(`/api/venues/${venueId}`)
          .set('Cookie', coordinator.cookie)
          .expect(200);
        expect(activeSchedule.body.reservations.map((row: { eventName: string }) => row.eventName))
          .toEqual(['Hold expires during check']);
        await request(app.getHttpServer())
          .post(`/api/venues/${venueId}/booking-requests`)
          .set('Cookie', coordinator.cookie)
          .send({ eventId: candidateEvent })
          .expect(409);

        currentNow = expiresAt;
        const expiredSchedule = await request(app.getHttpServer())
          .get(`/api/venues/${venueId}`)
          .set('Cookie', coordinator.cookie)
          .expect(200);
        expect(expiredSchedule.body.reservations).toEqual([]);
        const available = await request(app.getHttpServer())
          .post(`/api/venues/${venueId}/booking-requests`)
          .set('Cookie', coordinator.cookie)
          .send({ eventId: candidateEvent })
          .expect(201);
        expect(available.body).toMatchObject({ eventId: candidateEvent, status: 'pending' });
      } finally {
        currentNow = fixedNow;
      }
    });

    /** VEN-AVL-08-A/VAR-1: a candidate after a booking conflicts when only turnaround occupancy overlaps. */
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
        { start: '2030-01-12T05:20:00Z', end: '2030-01-12T06:00:00Z' },
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
        'Existing earlier event',
      );
    });

    /** VEN-AVL-08-A/B/VAR-1: a candidate before a booking conflicts when only setup occupancy overlaps. Kills: B12-A. */
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
        'Existing later event',
      );
    });

    /** SPM-54 AC2: a one-minute overlap inside the setup buffer is rejected and creates no request. */
    it('rejects a one-minute overlap with the later booking setup buffer', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, { setupTimeMinutes: 30, turnaroundTimeMinutes: 0 });
      const candidate = await createAssignedEvent(
        coordinator.id,
        'One minute setup overlap candidate',
        { start: '2030-01-12T04:00:00Z', end: '2030-01-12T05:00:00Z' },
      );
      const existing = await createAssignedEvent(
        coordinator.id,
        'Setup begins one minute too early',
        { start: '2030-01-12T05:29:00Z', end: '2030-01-12T06:00:00Z' },
      );
      await addBooking(venueId, existing, {
        start: '2030-01-12T05:29:00Z',
        end: '2030-01-12T06:00:00Z',
      });

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidate,
        'Setup begins one minute too early',
      );
    });

    /** SPM-54 AC2: a one-minute overlap inside the turnaround buffer is rejected and creates no request. */
    it('rejects a one-minute overlap with the earlier booking turnaround buffer', async () => {
      const owner = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(owner.id, { setupTimeMinutes: 0, turnaroundTimeMinutes: 45 });
      const candidate = await createAssignedEvent(
        coordinator.id,
        'One minute turnaround overlap candidate',
        { start: '2030-01-12T05:44:00Z', end: '2030-01-12T06:44:00Z' },
      );
      const existing = await createAssignedEvent(
        coordinator.id,
        'Turnaround ends one minute too late',
        { start: '2030-01-12T04:00:00Z', end: '2030-01-12T05:00:00Z' },
      );
      await addBooking(venueId, existing, {
        start: '2030-01-12T04:00:00Z',
        end: '2030-01-12T05:00:00Z',
      });

      await expectConflictWithoutRequest(
        venueId,
        coordinator.cookie,
        candidate,
        'Turnaround ends one minute too late',
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
        'Maintenance',
      );
    });

    /** VEN-AVL-08-A/B/BND-1/VAR-1: setup and turnaround blockout intersections both reject without insertion. Kills: setup or turnaround occupancy omitted for blockouts (B12-B, B12-C). */
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
      );
      const turnaroundCandidate = await createAssignedEvent(
        coordinator.id,
        'Turnaround blockout candidate',
        { start: '2030-01-12T06:00:00Z', end: '2030-01-12T07:00:00Z' },
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
        'Setup cleaning',
      );
      await expectConflictWithoutRequest(
        turnaroundVenueId,
        coordinator.cookie,
        turnaroundCandidate,
        'Turnaround maintenance',
      );
    });
  },
);
