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
import { VenuesRepository } from '../src/venues/repository/venues.repository.js';
import { TentativeHoldExpiryScheduler } from '../src/venues/tentative-hold-expiry.scheduler.js';

const databaseUrl = process.env.DATABASE_URL;
const fixedNow = new Date('2030-06-01T12:00:00.000Z');
let testNow = fixedNow;

if (!databaseUrl && process.env.CI)
  throw new Error('SPM-133 tentative hold expiry tests require DATABASE_URL in CI.');

describe.skipIf(!databaseUrl)(
  'SPM-133 tentative hold expiry (VEN-HOLD-EXP)',
  () => {
    let app: INestApplication;
    let pool: pg.Pool;
    const venueIds: string[] = [];
    const eventIds: string[] = [];
    const userIds: string[] = [];

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: databaseUrl });
      pool.on('error', (err) => { console.error('[pool-idle-error]', err.message); });

      const currentSchema = await pool.query<{ supports_expired: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'venue_bookings'::regclass
          AND conname = 'venue_bookings_status_check' AND pg_get_constraintdef(oid) LIKE '%expired%') AS supports_expired`,
      );
      for (const migration of [
        '005_venues.sql',
        '006_venue_operating_information.sql',
        '007_venue_operating_schedule.sql',
        '008_venue_owner_user_id.sql',
        '009_venue_availability.sql',
        '010_remove_venue_operating_schedule.sql',
        '019_spm54_venue_booking_lifecycle.sql',
        '021_spm55_booking_review.sql',
        '024_spm159_tentative_hold_requests.sql',
        '025_spm159_approved_hold_expiry.sql',
        '032_spm132_tentative_hold_expiry_processing.sql',
      ]) {
        if (currentSchema.rows[0].supports_expired && (migration === '009_venue_availability.sql' || migration === '019_spm54_venue_booking_lifecycle.sql')) continue;
        await pool.query(
          await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'),
        );
      }

      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(CLOCK)
        .useValue({ now: () => testNow })
        .compile();
      app = module.createNestApplication({ logger: ['warn', 'log'] });
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      if (!pool) return;
      if (venueIds.length)
        await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venueIds]);
      if (eventIds.length)
        await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
      if (userIds.length)
        await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
      await pool.end();
    });

    async function createUser(role: 'COORDINATOR' | 'VENUE_STAFF') {
      const email = `spm133-${randomUUID()}@example.test`;
      const client = await pool.connect();
      let id!: string;
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO users (email, display_name, password_hash)
           VALUES ($1, 'SPM-133 Test User', crypt('password123', gen_salt('bf', 4)))
           RETURNING id`,
          [email],
        );
        id = result.rows[0].id;
        userIds.push(id);
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
          [id, role],
        );
      } finally {
        client.release();
      }
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'password123' })
        .expect(201);
      const cookie = (login.headers['set-cookie'] as unknown as string[] | undefined)
        ?.find((v) => v.startsWith('connectsphere_session='));
      if (!cookie) throw new Error('Expected an authenticated test session cookie');
      return { id, cookie: cookie.split(';', 1)[0] };
    }

    async function createVenue(ownerId: string) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO venues (id, owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
         VALUES ($1, $2, $3, 'Test Location', 100, 'Integration fixture', 0, 0)`,
        [id, ownerId, `SPM-133 Venue ${id}`],
      );
      venueIds.push(id);
      return id;
    }

    async function createAssignedEvent(
      coordinatorId: string,
      name: string,
      start = '2030-09-01T10:00:00.000Z',
      end = '2030-09-01T11:00:00.000Z',
    ) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
         start_date_time, end_date_time, expected_attendance, coordinator_id,
         coordinator_name, submission_key, status)
         VALUES ($1, 'spm133-test', 'SPM-133 Organiser', 'spm133@example.test', $2,
         'Hold expiry integration', $3, $4, 10, $5, 'SPM-133 Coordinator', $1, 'Planning')`,
        [id, name, new Date(start), new Date(end), coordinatorId],
      );
      eventIds.push(id);
      return id;
    }

    /** Seeds an approved tentative hold at a given slot with an explicit expiry. */
    async function addActiveHold(
      venueId: string,
      eventId: string,
      expires: string,
      start = '2030-09-01T10:00:00Z',
      end = '2030-09-01T11:00:00Z',
    ) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
         VALUES ($1, $2, $3, $4, 'approved', 'tentative_hold', $5)
         RETURNING id`,
        [venueId, eventId, new Date(start), new Date(end), new Date(expires)],
      );
      return result.rows[0].id;
    }

    // ── AC2: Expired hold does not block a new booking request ───────────────

    // Traceability: Jira 133 AC2 (matrix 39223343)
    /** VEN-HOLD-EXP-02-A: a clearly-past-expired hold does not block a new booking request for the same slot. */
    it('VEN-HOLD-EXP-02-A past-expired hold does not block a new booking request', async () => {
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const holdEventId = await createAssignedEvent(coordinator.id, 'EXP-02-A hold event');
      const newEventId = await createAssignedEvent(coordinator.id, 'EXP-02-A new event');

      // Hold expired 1 hour before fixedNow — clearly in the past
      const pastExpiry = new Date(fixedNow.getTime() - 60 * 60_000).toISOString();
      await addActiveHold(venueId, holdEventId, pastExpiry);

      const response = await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId: newEventId, start: '2030-09-01T10:00:00Z', end: '2030-09-01T11:00:00Z' })
        .expect(201);

      expect(response.body).toMatchObject({ eventId: newEventId, venueId, status: 'pending' });
    });

    // Traceability: Jira 133 AC2 (matrix 39223343)
    /** VEN-HOLD-EXP-02-BND-1: at exact equality (hold_expires_at = now), the hold is non-blocking. */
    it('VEN-HOLD-EXP-02-BND-1 hold at exact equality is non-blocking for a new request', async () => {
      const previousNow = testNow;
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const holdEventId = await createAssignedEvent(coordinator.id, 'EXP-02-BND-1 hold', '2030-09-02T10:00:00Z', '2030-09-02T11:00:00Z');
      const newEventId = await createAssignedEvent(coordinator.id, 'EXP-02-BND-1 new', '2030-09-02T10:00:00Z', '2030-09-02T11:00:00Z');

      const exactExpiry = fixedNow;
      await addActiveHold(venueId, holdEventId, exactExpiry.toISOString(), '2030-09-02T10:00:00Z', '2030-09-02T11:00:00Z');
      testNow = exactExpiry;

      try {
        await request(app.getHttpServer())
          .post(`/api/venues/${venueId}/booking-requests`)
          .set('Cookie', coordinator.cookie)
          .send({ eventId: newEventId, start: '2030-09-02T10:00:00Z', end: '2030-09-02T11:00:00Z' })
          .expect(201);
      } finally {
        testNow = previousNow;
      }
    });

    // Traceability: Jira 133 AC2 (matrix 39223343)
    /** VEN-HOLD-EXP-02-B: an active hold still blocks a new booking request for the same slot. */
    it('VEN-HOLD-EXP-02-B active hold still blocks a new booking request', async () => {
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const holdEventId = await createAssignedEvent(coordinator.id, 'EXP-02-B active hold', '2030-09-03T10:00:00Z', '2030-09-03T11:00:00Z');
      const newEventId = await createAssignedEvent(coordinator.id, 'EXP-02-B blocked', '2030-09-03T10:00:00Z', '2030-09-03T11:00:00Z');

      // Active hold: expires well in the future
      const futureExpiry = new Date(fixedNow.getTime() + 7 * 24 * 60 * 60_000).toISOString();
      await addActiveHold(venueId, holdEventId, futureExpiry, '2030-09-03T10:00:00Z', '2030-09-03T11:00:00Z');

      await request(app.getHttpServer())
        .post(`/api/venues/${venueId}/booking-requests`)
        .set('Cookie', coordinator.cookie)
        .send({ eventId: newEventId, start: '2030-09-03T10:00:00Z', end: '2030-09-03T11:00:00Z' })
        .expect(409);
    });

    // ── AC3: Expired hold has no confirmed capacity ──────────────────────────

    // Traceability: Jira 133 AC3 (matrix 39223343)
    /** VEN-HOLD-EXP-03-A: expired hold does not appear in the venue schedule reservations. */
    it('VEN-HOLD-EXP-03-A expired hold has no confirmed capacity in the venue schedule', async () => {
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const holdEventId = await createAssignedEvent(coordinator.id, 'EXP-03-A expired hold', '2030-09-04T10:00:00Z', '2030-09-04T11:00:00Z');

      const holdId = await addActiveHold(venueId, holdEventId, fixedNow.toISOString(), '2030-09-04T10:00:00Z', '2030-09-04T11:00:00Z');

      const schedule = await request(app.getHttpServer())
        .get(`/api/venues/${venueId}`)
        .set('Cookie', staff.cookie)
        .expect(200);

      // Reservations use booking `id`, not eventId — confirm the expired booking row is absent
      expect(schedule.body.reservations).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: holdId })]),
      );
    });

    // Traceability: Jira 133 AC3 (matrix 39223343)
    /** VEN-HOLD-EXP-03-B: an unrelated confirmed booking still appears in the venue schedule. */
    it('VEN-HOLD-EXP-03-B unrelated confirmed booking still counted in venue schedule', async () => {
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const expiredEventId = await createAssignedEvent(coordinator.id, 'EXP-03-B expired hold', '2030-09-05T10:00:00Z', '2030-09-05T11:00:00Z');
      const activeEventId = await createAssignedEvent(coordinator.id, 'EXP-03-B active booking', '2030-09-06T10:00:00Z', '2030-09-06T11:00:00Z');

      const expiredHoldId = await addActiveHold(venueId, expiredEventId, fixedNow.toISOString(), '2030-09-05T10:00:00Z', '2030-09-05T11:00:00Z');
      const activeBooking = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind)
         VALUES ($1, $2, '2030-09-06T10:00:00Z', '2030-09-06T11:00:00Z', 'approved', 'booking')
         RETURNING id`,
        [venueId, activeEventId],
      );
      const activeBookingId = activeBooking.rows[0].id;

      const schedule = await request(app.getHttpServer())
        .get(`/api/venues/${venueId}`)
        .set('Cookie', staff.cookie)
        .expect(200);

      // Reservations use booking `id` — the confirmed booking must appear, the expired hold must not
      expect(schedule.body.reservations).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: activeBookingId })]),
      );
      expect(schedule.body.reservations).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: expiredHoldId })]),
      );
    });

    // ── AC4: Expired hold cannot be converted ────────────────────────────────

    // Traceability: Jira 133 AC4 (matrix 39223343)
    /** VEN-HOLD-EXP-04-B: a stored-expired hold (status = 'expired') conversion is refused. */
    it('VEN-HOLD-EXP-04-B stored-expired hold conversion is refused', async () => {
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const eventId = await createAssignedEvent(coordinator.id, 'EXP-04-B stored expired', '2030-09-07T10:00:00Z', '2030-09-07T11:00:00Z');

      const holdId = await addActiveHold(venueId, eventId, fixedNow.toISOString(), '2030-09-07T10:00:00Z', '2030-09-07T11:00:00Z');
      // Mark as stored-expired (as the scheduler would do)
      await pool.query(
        `UPDATE venue_bookings SET status = 'expired', hold_expiry_processed_at = $2 WHERE id = $1`,
        [holdId, fixedNow],
      );

      const response = await request(app.getHttpServer())
        .post(`/api/venues/bookings/${holdId}/convert-hold`)
        .set('Cookie', staff.cookie)
        .expect(409);

      expect(response.body.code).toBe('TENTATIVE_HOLD_EXPIRED');
    });

    // Traceability: Jira 133 AC4 (matrix 39223343)
    /** VEN-HOLD-EXP-04-BND-1: clock at equality (hold_expires_at = now), DB still 'approved' — conversion refused. */
    it('VEN-HOLD-EXP-04-BND-1 clock at equality with approved status conversion refused', async () => {
      const previousNow = testNow;
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const eventId = await createAssignedEvent(coordinator.id, 'EXP-04-BND-1 equality', '2030-09-08T10:00:00Z', '2030-09-08T11:00:00Z');

      const expiry = fixedNow;
      const holdId = await addActiveHold(venueId, eventId, expiry.toISOString(), '2030-09-08T10:00:00Z', '2030-09-08T11:00:00Z');
      testNow = expiry; // clock at exact equality

      try {
        await request(app.getHttpServer())
          .post(`/api/venues/bookings/${holdId}/convert-hold`)
          .set('Cookie', staff.cookie)
          .expect(409);

        // DB record should still be 'approved' — scheduler has not run
        const stored = await pool.query<{ status: string }>(
          'SELECT status FROM venue_bookings WHERE id = $1',
          [holdId],
        );
        expect(stored.rows[0].status).toBe('approved');
      } finally {
        testNow = previousNow;
      }
    });

    // Traceability: Jira 133 AC4 (matrix 39223343)
    /** VEN-HOLD-EXP-04-PERF-1: race — clock past expiry but DB still 'approved' → conversion refused. */
    it('VEN-HOLD-EXP-04-PERF-1 race condition: clock-expired but DB approved conversion refused', async () => {
      const previousNow = testNow;
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const eventId = await createAssignedEvent(coordinator.id, 'EXP-04-PERF-1 race', '2030-09-09T10:00:00Z', '2030-09-09T11:00:00Z');

      // Expiry 1 s before fixedNow; DB status is still 'approved' (scheduler has not fired)
      const expiry = new Date(fixedNow.getTime() - 1_000);
      const holdId = await addActiveHold(venueId, eventId, expiry.toISOString(), '2030-09-09T10:00:00Z', '2030-09-09T11:00:00Z');
      testNow = fixedNow;

      try {
        await request(app.getHttpServer())
          .post(`/api/venues/bookings/${holdId}/convert-hold`)
          .set('Cookie', staff.cookie)
          .expect(409);
      } finally {
        testNow = previousNow;
      }
    });

    // Traceability: Jira 133 AC4 (matrix 39223343)
    /** VEN-HOLD-EXP-04-PERF-2: a hold converted before expiry remains a confirmed booking after the scheduler runs. */
    it('VEN-HOLD-EXP-04-PERF-2 converted hold remains confirmed after scheduler processes expiry', async () => {
      const previousNow = testNow;
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const eventId = await createAssignedEvent(coordinator.id, 'EXP-04-PERF-2 convert then expire', '2030-09-10T10:00:00Z', '2030-09-10T11:00:00Z');

      // Hold expires 1 s in the future relative to fixedNow
      const expiry = new Date(fixedNow.getTime() + 1_000);
      const holdId = await addActiveHold(venueId, eventId, expiry.toISOString(), '2030-09-10T10:00:00Z', '2030-09-10T11:00:00Z');

      try {
        testNow = fixedNow; // before expiry — conversion should succeed
        const converted = await request(app.getHttpServer())
          .post(`/api/venues/bookings/${holdId}/convert-hold`)
          .set('Cookie', staff.cookie)
          .expect(201);
        expect(converted.body).toMatchObject({ status: 'approved', requestKind: 'booking' });

        // Advance clock past expiry and run the processor
        testNow = new Date(expiry.getTime() + 1_000);
        const venues = app.get(VenuesRepository);
        await venues.processExpiredTentativeHolds();

        // Converted booking (request_kind = 'booking') must not be expired by the processor
        const stored = await pool.query<{ status: string; request_kind: string }>(
          'SELECT status, request_kind FROM venue_bookings WHERE id = $1',
          [holdId],
        );
        expect(stored.rows[0]).toMatchObject({ status: 'approved', request_kind: 'booking' });
      } finally {
        testNow = previousNow;
      }
    });

    // ── AC6: Scheduler expires holds ─────────────────────────────────────────

    // Traceability: Jira 133 AC6 (matrix 39223343)
    /** VEN-HOLD-EXP-06-VAR-1: direct processor call expires an approved hold at or past expiry. */
    it('VEN-HOLD-EXP-06-VAR-1 direct processor call expires an approved hold past expiry', async () => {
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const eventId = await createAssignedEvent(coordinator.id, 'EXP-06-VAR-1 direct processor', '2030-09-11T10:00:00Z', '2030-09-11T11:00:00Z');

      const holdId = await addActiveHold(venueId, eventId, fixedNow.toISOString(), '2030-09-11T10:00:00Z', '2030-09-11T11:00:00Z');
      const venues = app.get(VenuesRepository);
      const expired = await venues.processExpiredTentativeHolds();

      expect(expired).toContain(holdId);
      const stored = await pool.query<{ status: string }>(
        'SELECT status FROM venue_bookings WHERE id = $1',
        [holdId],
      );
      expect(stored.rows[0].status).toBe('expired');
    });

    // Traceability: Jira 133 AC6 (matrix 39223343)
    /** VEN-HOLD-EXP-06-B: processor does not expire a hold before its expiry time. */
    it('VEN-HOLD-EXP-06-B processor does not expire a hold before its expiry time', async () => {
      const previousNow = testNow;
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const eventId = await createAssignedEvent(coordinator.id, 'EXP-06-B premature', '2030-09-12T10:00:00Z', '2030-09-12T11:00:00Z');

      // Hold expires 1 s after fixedNow — clock is before expiry
      const expiry = new Date(fixedNow.getTime() + 1_000);
      const holdId = await addActiveHold(venueId, eventId, expiry.toISOString(), '2030-09-12T10:00:00Z', '2030-09-12T11:00:00Z');

      testNow = fixedNow;
      try {
        const venues = app.get(VenuesRepository);
        const expired = await venues.processExpiredTentativeHolds();

        expect(expired).not.toContain(holdId);
        const stored = await pool.query<{ status: string }>(
          'SELECT status FROM venue_bookings WHERE id = $1',
          [holdId],
        );
        expect(stored.rows[0].status).toBe('approved');
      } finally {
        testNow = previousNow;
      }
    });

    // Traceability: Jira 133 AC6 (matrix 39223343)
    /** VEN-HOLD-EXP-06-PERF-1: idempotent — H-A expires once, H-B (still active) is unaffected by a second run. */
    it('VEN-HOLD-EXP-06-PERF-1 idempotent: expired hold processed once, active hold unaffected', async () => {
      const previousNow = testNow;
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const eventA = await createAssignedEvent(coordinator.id, 'EXP-06-PERF-1 H-A expired', '2030-09-13T10:00:00Z', '2030-09-13T11:00:00Z');
      const eventB = await createAssignedEvent(coordinator.id, 'EXP-06-PERF-1 H-B active', '2030-09-14T10:00:00Z', '2030-09-14T11:00:00Z');

      // H-A expires at equality; H-B expires tomorrow
      const holdAResult = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
         VALUES ($1, $2, '2030-09-13T10:00:00Z', '2030-09-13T11:00:00Z', 'approved', 'tentative_hold', $3)
         RETURNING id`,
        [venueId, eventA, fixedNow],
      );
      const holdAId = holdAResult.rows[0].id;

      const holdBResult = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
         VALUES ($1, $2, '2030-09-14T10:00:00Z', '2030-09-14T11:00:00Z', 'approved', 'tentative_hold', $3)
         RETURNING id`,
        [venueId, eventB, new Date(fixedNow.getTime() + 24 * 60 * 60_000)],
      );
      const holdBId = holdBResult.rows[0].id;

      testNow = fixedNow; // H-A expired (equality), H-B still active
      try {
        const venues = app.get(VenuesRepository);

        const firstRun = await venues.processExpiredTentativeHolds();
        expect(firstRun).toContain(holdAId);
        expect(firstRun).not.toContain(holdBId);

        const secondRun = await venues.processExpiredTentativeHolds();
        expect(secondRun).toEqual([]); // idempotent — nothing new to process

        const rows = await pool.query<{ id: string; status: string }>(
          'SELECT id, status FROM venue_bookings WHERE id = ANY($1::uuid[])',
          [[holdAId, holdBId]],
        );
        const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.status]));
        expect(byId[holdAId]).toBe('expired');
        expect(byId[holdBId]).toBe('approved');
      } finally {
        testNow = previousNow;
      }
    });

    // Traceability: Jira 133 AC6 (matrix 39223343)
    /** VEN-HOLD-EXP-06-A: registered scheduler's process() method expires a hold without a direct repository call. */
    it('VEN-HOLD-EXP-06-A registered scheduler process() expires a hold', async () => {
      const staff = await createUser('VENUE_STAFF');
      const coordinator = await createUser('COORDINATOR');
      const venueId = await createVenue(staff.id);
      const eventId = await createAssignedEvent(coordinator.id, 'EXP-06-A scheduler fires', '2030-09-15T10:00:00Z', '2030-09-15T11:00:00Z');

      const holdId = await addActiveHold(venueId, eventId, fixedNow.toISOString(), '2030-09-15T10:00:00Z', '2030-09-15T11:00:00Z');
      const scheduler = app.get(TentativeHoldExpiryScheduler);
      await scheduler.process();

      const stored = await pool.query<{ status: string }>(
        'SELECT status FROM venue_bookings WHERE id = $1',
        [holdId],
      );
      expect(stored.rows[0].status).toBe('expired');
    });
  },
);
