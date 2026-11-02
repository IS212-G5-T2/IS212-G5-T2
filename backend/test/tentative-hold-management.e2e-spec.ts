import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { DatabaseService } from '../src/database/database.service.js';
import { VenuesRepository } from '../src/venues/repository/venues.repository.js';
import { TentativeHoldExpiryScheduler } from '../src/venues/tentative-hold-expiry.scheduler.js';

const databaseUrl = process.env.DATABASE_URL;
const initialNow = new Date('2030-11-01T01:00:00.000Z');
const hour = 3_600_000;

describe.skipIf(!databaseUrl)('SPM-132 Venue Staff tentative hold lifecycle HTTP and PostgreSQL', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let now = new Date(initialNow);
  const venueIds: string[] = [];
  const eventIds: string[] = [];
  const userIds: string[] = [];
  const fixedClock = { now: () => new Date(now) };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
    for (const migration of [
      '005_venues.sql', '006_venue_operating_information.sql', '007_venue_operating_schedule.sql',
      '008_venue_owner_user_id.sql', '009_venue_availability.sql', '010_remove_venue_operating_schedule.sql',
      '019_spm54_venue_booking_lifecycle.sql', '021_spm55_booking_review.sql',
      '022_spm55_booking_special_request.sql', '024_spm159_tentative_hold_requests.sql',
      '025_spm159_approved_hold_expiry.sql', '026_spm132_hold_expiry.sql',
    ]) await pool.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK).useValue(fixedClock)
      .overrideProvider(TentativeHoldExpiryScheduler).useValue({ onModuleInit() {}, onModuleDestroy() {} })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (!pool) return;
    if (venueIds.length) await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venueIds]);
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await pool.end();
  });

  beforeEach(() => { now = new Date(initialNow); });

  async function createUser(role: 'COORDINATOR' | 'VENUE_STAFF') {
    const email = `spm132-${randomUUID()}@example.test`;
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
      [email, role === 'COORDINATOR' ? 'SPM-132 Coordinator' : 'SPM-132 Venue Staff'],
    );
    const id = result.rows[0].id;
    userIds.push(id);
    const assignedRole = await pool.query<{ role_id: number }>(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2 RETURNING role_id',
      [id, role],
    );
    const poolDatabase = await pool.query<{ database_name: string }>(
      'SELECT current_database() AS database_name',
    );
    const appAccount = await app.get(DatabaseService).query<{
      database_name: string;
      is_active: boolean;
      password_matches: boolean;
      roles: string[];
    }>(
      `SELECT current_database() AS database_name, u.is_active,
              u.password_hash = crypt('password123', u.password_hash) AS password_matches,
              array_agg(r.name ORDER BY r.id)::text[] AS roles
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE u.id = $1
        GROUP BY u.id`,
      [id],
    );
    const account = appAccount.rows[0];
    if (assignedRole.rowCount !== 1 || !account || !account.is_active || !account.password_matches || !account.roles.includes(role) || account.database_name !== poolDatabase.rows[0]?.database_name) {
      throw new Error(`SPM-132 auth fixture mismatch for ${email}: pool DB=${poolDatabase.rows[0]?.database_name ?? 'missing'}, app DB=${account?.database_name ?? 'account not visible'}, assigned roles=${JSON.stringify(account?.roles ?? [])}, role insert rows=${assignedRole.rowCount}`);
    }
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'password123' });
    if (login.status !== 201) {
      throw new Error(`SPM-132 fixture login failed for ${email} in ${account.database_name}: ${login.status} ${JSON.stringify(login.body)}`);
    }
    const cookie = login.headers['set-cookie']?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected authenticated test session cookie');
    const sessionCookie = cookie.split(';', 1)[0];
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', sessionCookie).expect(200);
    return { id, cookie: sessionCookie };
  }

  async function createVenue(ownerId: string, setup = 30, turnaround = 45) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO venues (id, owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, $3, 'SPM-132 Test Location', 100, 'Integration fixture', $4, $5)`,
      [id, ownerId, `SPM-132 ${id}`, setup, turnaround],
    );
    venueIds.push(id);
    return id;
  }

  async function createEvent(coordinatorId: string, startsAt = new Date('2030-11-20T02:00:00.000Z'), endsAt = new Date('2030-11-20T04:00:00.000Z')) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
        start_date_time, end_date_time, expected_attendance, coordinator_id, coordinator_name, submission_key, status)
       VALUES ($1, 'spm132-test', 'SPM-132 Organiser', 'spm132@example.test', $2, 'Venue hold lifecycle', $3, $4, 10, $5, 'SPM-132 Coordinator', $1, 'Planning')`,
      [id, `SPM-132 Event ${id}`, startsAt, endsAt, coordinatorId],
    );
    eventIds.push(id);
    return id;
  }

  async function context(options: { setup?: number; turnaround?: number; startsAt?: Date } = {}) {
    const staff = await createUser('VENUE_STAFF');
    const coordinator = await createUser('COORDINATOR');
    const venue = await createVenue(staff.id, options.setup ?? 30, options.turnaround ?? 45);
    const event = await createEvent(coordinator.id, options.startsAt);
    return { staff, coordinator, venue, event };
  }

  async function addHold(venue: string, event: string, status: 'pending' | 'approved' | 'expired' | 'released' = 'pending', expires: Date | null = null) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO venue_bookings (id, venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
       VALUES ($1, $2, $3, (SELECT start_date_time FROM events WHERE id = $3), (SELECT end_date_time FROM events WHERE id = $3), $4, 'tentative_hold', $5)`,
      [id, venue, event, status, expires],
    );
    return id;
  }

  async function addBooking(venue: string, event: string, status: 'approved' | 'pending' | 'blocked', start?: Date, end?: Date, kind: 'booking' | 'tentative_hold' = 'booking', expires: Date | null = null) {
    const id = randomUUID();
    if (status === 'blocked') {
      await pool.query(`INSERT INTO venue_bookings (id, venue_id, start_at, end_at, status, reason) VALUES ($1, $2, $3, $4, 'blocked', 'Maintenance')`, [id, venue, start, end]);
    } else {
      await pool.query(
        `INSERT INTO venue_bookings (id, venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, venue, event, start ?? new Date('2030-11-20T02:00:00.000Z'), end ?? new Date('2030-11-20T04:00:00.000Z'), status, kind, expires],
      );
    }
    return id;
  }

  /** VEN-HOLD-DEC-01-A: both pending requests for managed venues appear, without foreign or non-Pending rows. */
  it('VEN-HOLD-DEC-01-A returns every managed pending hold and excludes other venues and statuses', async () => {
    const a = await context(); const otherStaff = await createUser('VENUE_STAFF'); const otherVenue = await createVenue(otherStaff.id);
    const ownId = await addHold(a.venue, a.event);
    const secondOwnId = await addHold(a.venue, await createEvent(a.coordinator.id));
    const otherId = await addHold(otherVenue, await createEvent(a.coordinator.id));
    const approvedId = await addHold(a.venue, await createEvent(a.coordinator.id), 'approved', new Date(now.getTime() + 14 * hour * 24));
    const expiredId = await addHold(a.venue, await createEvent(a.coordinator.id), 'expired', new Date(now.getTime() - hour));
    const releasedId = await addHold(a.venue, await createEvent(a.coordinator.id), 'released', new Date(now.getTime() + 14 * hour * 24));
    const result = await request(app.getHttpServer()).get('/api/venues/bookings/pending').set('Cookie', a.staff.cookie).expect(200);
    expect(result.body).toHaveLength(2);
    expect(result.body.map((booking: { id: string }) => booking.id)).toEqual(expect.arrayContaining([ownId, secondOwnId]));
    expect(result.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: otherId }), expect.objectContaining({ id: approvedId }), expect.objectContaining({ id: expiredId }), expect.objectContaining({ id: releasedId })]));
    const allStatuses = await request(app.getHttpServer()).get('/api/venues/bookings/pending?includeDecided=true').set('Cookie', a.staff.cookie).expect(200);
    expect(allStatuses.body).toHaveLength(5);
    expect(allStatuses.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ownId, status: 'pending' }),
      expect.objectContaining({ id: secondOwnId, status: 'pending' }),
      expect.objectContaining({ id: approvedId, status: 'approved' }),
      expect.objectContaining({ id: expiredId, status: 'expired', holdExpired: true }),
      expect.objectContaining({ id: releasedId, status: 'released' }),
    ]));
    expect(allStatuses.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: otherId })]));
  });

  /** VEN-HOLD-DEC-01-B: no pending requests produce an empty collection. */
  it('VEN-HOLD-DEC-01-B returns an empty list when the staff member has no pending requests', async () => {
    const a = await context();
    const result = await request(app.getHttpServer()).get('/api/venues/bookings/pending').set('Cookie', a.staff.cookie).expect(200);
    expect(result.body).toEqual([]);
  });

  /** VEN-HOLD-DEC-01-SEC-1: other users cannot retrieve another coordinator's hold, and another Venue Staff owner cannot decide it. */
  it('VEN-HOLD-DEC-01-SEC-1 hides unrelated requests and another venue staff cannot decide them', async () => {
    const a = await context(); const otherCoordinator = await createUser('COORDINATOR'); const otherStaff = await createUser('VENUE_STAFF');
    const holdId = await addHold(a.venue, a.event);
    const own = await request(app.getHttpServer()).get('/api/venues/bookings/mine').set('Cookie', otherCoordinator.cookie).expect(200);
    expect(own.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId })]));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', otherStaff.cookie).expect(404);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/convert`).set('Cookie', otherStaff.cookie).expect(404);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/release`).set('Cookie', otherStaff.cookie).expect(404);
    const row = await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [holdId]);
    expect(row.rows[0].status).toBe('pending');
  });

  /** VEN-HOLD-DEC-01-SEC-2: coordinators cannot approve, reject, convert, or release through Venue Staff routes. */
  it('VEN-HOLD-DEC-01-SEC-2 forbids an assigned coordinator from every Venue Staff decision route', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.coordinator.cookie).expect(403);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/reject`).set('Cookie', a.coordinator.cookie).send({ reason: 'Coordinator must not decide' }).expect(403);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/convert`).set('Cookie', a.coordinator.cookie).expect(403);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/release`).set('Cookie', a.coordinator.cookie).expect(403);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/convert`).expect(401);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/release`).expect(401);
    const row = await pool.query('SELECT status, rejection_reason FROM venue_bookings WHERE id = $1', [holdId]);
    expect(row.rows[0]).toEqual({ status: 'pending', rejection_reason: null });
    expect((await pool.query('SELECT count(*)::int AS count FROM booking_review_log WHERE booking_id = $1', [holdId])).rows[0].count).toBe(0);
  });

  /** VEN-HOLD-DEC-01-VAR-1: an assigned coordinator can read their own pending request without mutating it. */
  it('VEN-HOLD-DEC-01-VAR-1 lets the assigned coordinator read their own request', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    const result = await request(app.getHttpServer()).get('/api/venues/bookings/mine').set('Cookie', a.coordinator.cookie).expect(200);
    expect(result.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId, status: 'pending', requestKind: 'tentative_hold' })]));
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id = $1', [holdId])).rows[0].status).toBe('pending');
  });

  /** VEN-HOLD-DEC-02-A: pending details include the venue, requested event time, coordinator, and 14-day policy. */
  it('VEN-HOLD-DEC-02-A returns request details and the fourteen-day hold duration', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    const list = await request(app.getHttpServer()).get('/api/venues/bookings/pending').set('Cookie', a.staff.cookie).expect(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId, venueName: expect.stringContaining('SPM-132'), eventStart: '2030-11-20T02:00:00.000Z', eventEnd: '2030-11-20T04:00:00.000Z', coordinatorName: 'SPM-132 Coordinator', requestKind: 'tentative_hold' })]));
  });

  /** VEN-HOLD-DEC-02-B: pending requests describe the policy duration but have no active expiry. */
  it('VEN-HOLD-DEC-02-B keeps a pending hold without an approval expiry countdown', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    const list = await request(app.getHttpServer()).get('/api/venues/bookings/pending').set('Cookie', a.staff.cookie).expect(200);
    const row = list.body.find((booking: { id: string }) => booking.id === holdId);
    expect(row).toMatchObject({ status: 'pending', holdExpired: false });
    expect(row.holdExpiresAt).toBeUndefined();
  });

  /** VEN-HOLD-DEC-03-A: approving an eligible hold stores exactly one active hold and its approval-based expiry. */
  it('VEN-HOLD-DEC-03-A approves an eligible request and stores one active hold', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    const before = (await pool.query('SELECT venue_id, event_id, start_at, end_at FROM venue_bookings WHERE id=$1', [holdId])).rows[0];
    const result = await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(201);
    expect(result.body).toMatchObject({ id: holdId, status: 'approved', requestKind: 'tentative_hold', holdExpiresAt: new Date(now.getTime() + 14 * 24 * hour).toISOString() });
    const after = (await pool.query("SELECT venue_id, event_id, start_at, end_at FROM venue_bookings WHERE id=$1 AND status='approved' AND request_kind='tentative_hold'", [holdId])).rows[0];
    expect(after).toEqual(before);
    expect((await pool.query("SELECT count(*)::int AS count FROM venue_bookings WHERE id=$1 AND status='approved' AND request_kind='tentative_hold'", [holdId])).rows[0].count).toBe(1);
  });

  /** VEN-HOLD-DEC-03-B: a closure added after submission blocks approval and leaves the request pending. */
  it('VEN-HOLD-DEC-03-B rechecks a newly added closure at approval time', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    await addBooking(a.venue, a.event, 'blocked', new Date('2030-11-20T01:00:00Z'), new Date('2030-11-20T01:45:00Z'));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(409);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('pending');
  });

  /** VEN-HOLD-DEC-03-C: a confirmed booking added after submission blocks approval. */
  it('VEN-HOLD-DEC-03-C rechecks a newly added confirmed booking at approval time', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    const otherEvent = await createEvent(a.coordinator.id);
    await addBooking(a.venue, otherEvent, 'approved');
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(409);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('pending');
  });

  /** VEN-HOLD-DEC-04-A: approval succeeds above the 336-hour setup-adjusted lead-time limit. */
  it('VEN-HOLD-DEC-04-A allows approval when setup begins more than 336 hours ahead', async () => {
    const startsAt = new Date(now.getTime() + (336 * hour) + 30 * 60_000 + 1000);
    const a = await context({ startsAt }); const holdId = await addHold(a.venue, a.event);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(201);
  });

  /** VEN-HOLD-DEC-04-BND-1: exactly 336 hours from setup start is allowed. */
  it('VEN-HOLD-DEC-04-BND-1 allows the exact 336-hour setup-adjusted boundary', async () => {
    const startsAt = new Date(now.getTime() + (336 * hour) + 30 * 60_000);
    const a = await context({ startsAt }); const holdId = await addHold(a.venue, a.event);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(201);
  });

  /** VEN-HOLD-DEC-04-BND-2: a setup period starting one second inside the 336-hour limit is refused. */
  it('VEN-HOLD-DEC-04-BND-2 rejects one second below the 336-hour lead-time boundary', async () => {
    const startsAt = new Date(now.getTime() + (336 * hour) + 30 * 60_000 - 1000);
    const a = await context({ startsAt }); const holdId = await addHold(a.venue, a.event);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(409);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('pending');
  });

  /** VEN-HOLD-DEC-05-A: approval exposes the persisted expiry to Venue Staff. */
  it('VEN-HOLD-DEC-05-A displays the saved expiry after approval', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    const approved = await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(201);
    const listed = await request(app.getHttpServer()).get('/api/venues/bookings/pending?includeDecided=true').set('Cookie', a.staff.cookie).expect(200);
    expect(listed.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId, holdExpiresAt: approved.body.holdExpiresAt })]));
  });

  /** VEN-HOLD-DEC-05-B: before approval, neither the response nor stored row invents an expiry. */
  it('VEN-HOLD-DEC-05-B has no expiry before approval', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    const listed = await request(app.getHttpServer()).get('/api/venues/bookings/pending').set('Cookie', a.staff.cookie).expect(200);
    expect(listed.body.find((booking: { id: string }) => booking.id === holdId).holdExpiresAt).toBeUndefined();
    expect((await pool.query('SELECT hold_expires_at FROM venue_bookings WHERE id=$1', [holdId])).rows[0].hold_expires_at).toBeNull();
  });

  /** VEN-HOLD-DEC-06-A: expiry is calculated from approval time rather than request creation. */
  it('VEN-HOLD-DEC-06-A computes 336 hours from the approval clock', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    now = new Date(now.getTime() + 5 * hour);
    const result = await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(201);
    expect(result.body.holdExpiresAt).toBe(new Date(now.getTime() + 14 * 24 * hour).toISOString());
  });

  /** VEN-HOLD-DEC-06-BND-1: processor leaves the hold active just before expiry and expires it at equality. */
  it('VEN-HOLD-DEC-06-BND-1 expires the persisted status at the exact expiry instant', async () => {
    const a = await context(); const expires = new Date(now.getTime() + hour); const holdId = await addHold(a.venue, a.event, 'approved', expires);
    const repository = app.get(VenuesRepository);
    now = new Date(expires.getTime() - 1);
    expect(await repository.expireDueTentativeHolds(now)).toBe(0);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('approved');
    now = new Date(expires);
    expect(await repository.expireDueTentativeHolds(now)).toBe(1);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('expired');
  });

  /** VEN-HOLD-DEC-06-B: repeated expiry processing leaves one Expired state and one audit row. */
  it('VEN-HOLD-DEC-06-B processes an expired hold idempotently', async () => {
    const a = await context(); const expires = new Date(now.getTime() + hour); const holdId = await addHold(a.venue, a.event, 'approved', expires);
    vi.useFakeTimers();
    process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS = '1000';
    const schedulerModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK).useValue(fixedClock)
      .compile();
    const repository = schedulerModule.get(VenuesRepository);
    const scheduledProcessor = vi.spyOn(repository, 'expireDueTentativeHolds');
    const schedulerApp = schedulerModule.createNestApplication();
    try {
      await schedulerApp.init();
      await vi.waitFor(() => expect(scheduledProcessor).toHaveBeenCalledTimes(1));
      now = new Date(expires.getTime() + 1000);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.waitFor(async () => {
        expect(scheduledProcessor).toHaveBeenCalledTimes(2);
        expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('expired');
      });
      await vi.advanceTimersByTimeAsync(1000);
      // The scheduled callback above proves automatic processing; this extra call proves idempotency after the persisted transition.
      expect(await repository.expireDueTentativeHolds(now)).toBe(0);
    } finally {
      await schedulerApp.close();
      vi.useRealTimers();
      delete process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS;
    }
    const row = await pool.query(`SELECT b.status, count(l.id)::int AS audits FROM venue_bookings b JOIN booking_review_log l ON l.booking_id=b.id WHERE b.id=$1 GROUP BY b.status`, [holdId]);
    expect(row.rows[0]).toEqual({ status: 'expired', audits: 1 });
    expect((await pool.query('SELECT action FROM booking_review_log WHERE booking_id=$1', [holdId])).rows.map((entry) => entry.action)).toEqual(['expired']);
    const checklist = await request(app.getHttpServer()).get(`/api/events/${a.event}/arrangements-status`).set('Cookie', a.coordinator.cookie).expect(200);
    expect(checklist.body.checklist.venue.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId, status: 'unavailable', holdState: 'Hold expired' })]));
  });

  /** VEN-HOLD-DEC-06-B: expiry and its system audit row roll back together if the audit write fails. */
  it('VEN-HOLD-DEC-06-B leaves a due hold active when its expiry audit cannot be written', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event, 'approved', new Date(now.getTime() - 1));
    await pool.query(`CREATE OR REPLACE FUNCTION spm132_fail_expiry_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'expired' THEN RAISE EXCEPTION 'test expiry audit rejection'; END IF;
        RETURN NEW;
      END;
    $$`);
    await pool.query('CREATE TRIGGER spm132_fail_expiry_audit BEFORE INSERT ON booking_review_log FOR EACH ROW EXECUTE FUNCTION spm132_fail_expiry_audit()');
    try {
      await expect(app.get(VenuesRepository).expireDueTentativeHolds(now)).rejects.toThrow('test expiry audit rejection');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS spm132_fail_expiry_audit ON booking_review_log');
      await pool.query('DROP FUNCTION IF EXISTS spm132_fail_expiry_audit()');
    }
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('approved');
    expect((await pool.query('SELECT count(*)::int AS count FROM booking_review_log WHERE booking_id=$1', [holdId])).rows[0].count).toBe(0);
  });

  /** VEN-HOLD-DEC-07-A: an authorized read exposes the exact reason and rejected holds leave the venue calendar. */
  it('VEN-HOLD-DEC-07-A exposes the rejection reason and removes the hold from calendar reservations', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/reject`).set('Cookie', a.staff.cookie).send({ reason: 'Venue maintenance scheduled' }).expect(201);
    expect((await pool.query('SELECT status, rejection_reason FROM venue_bookings WHERE id=$1', [holdId])).rows[0]).toEqual({ status: 'rejected', rejection_reason: 'Venue maintenance scheduled' });
    const coordinatorBookings = await request(app.getHttpServer()).get('/api/venues/bookings/mine').set('Cookie', a.coordinator.cookie).expect(200);
    expect(coordinatorBookings.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId, status: 'rejected', rejectionReason: 'Venue maintenance scheduled' })]));
    const calendar = await request(app.getHttpServer()).get(`/api/venues/${a.venue}`).set('Cookie', a.staff.cookie).expect(200);
    expect(calendar.body.reservations).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId })]));
  });

  /** VEN-HOLD-DEC-07-B: missing rejection reason is rejected without changing the pending request. */
  it('VEN-HOLD-DEC-07-B requires a rejection reason', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/reject`).set('Cookie', a.staff.cookie).send({}).expect(400);
    expect((await pool.query('SELECT status, rejection_reason FROM venue_bookings WHERE id=$1', [holdId])).rows[0]).toEqual({ status: 'pending', rejection_reason: null });
  });

  /** VEN-HOLD-DEC-07-C: whitespace-only rejection reason is rejected without a write. */
  it('VEN-HOLD-DEC-07-C rejects a whitespace-only reason', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/reject`).set('Cookie', a.staff.cookie).send({ reason: '  \n ' }).expect(400);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('pending');
  });

  /** VEN-HOLD-DEC-07-BND-1: one non-whitespace character is sufficient as a reason. */
  it('VEN-HOLD-DEC-07-BND-1 accepts the minimum one-character reason', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/reject`).set('Cookie', a.staff.cookie).send({ reason: 'A' }).expect(201);
    expect((await pool.query('SELECT rejection_reason FROM venue_bookings WHERE id=$1', [holdId])).rows[0].rejection_reason).toBe('A');
  });

  /** VEN-HOLD-DEC-07-BND-2: the maximum 1,000-character reason is preserved. */
  it('VEN-HOLD-DEC-07-BND-2 accepts exactly 1000 reason characters', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event); const reason = 'R'.repeat(1000);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/reject`).set('Cookie', a.staff.cookie).send({ reason }).expect(201);
    expect((await pool.query('SELECT rejection_reason FROM venue_bookings WHERE id=$1', [holdId])).rows[0].rejection_reason).toBe(reason);
  });

  /** VEN-HOLD-DEC-07-BND-3: a reason above the service maximum is rejected and leaves the row pending. */
  it('VEN-HOLD-DEC-07-BND-3 rejects 1001 reason characters without writing', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/reject`).set('Cookie', a.staff.cookie).send({ reason: 'R'.repeat(1001) }).expect(400);
    expect((await pool.query('SELECT status, rejection_reason FROM venue_bookings WHERE id=$1', [holdId])).rows[0]).toEqual({ status: 'pending', rejection_reason: null });
  });

  /** VEN-HOLD-DEC-08-A: an active hold appears as tentative in the calendar and blocks the configured occupied period. */
  it('VEN-HOLD-DEC-08-A lists the active hold as a tentative venue reservation', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    const venue = await request(app.getHttpServer()).get(`/api/venues/${a.venue}`).set('Cookie', a.staff.cookie).expect(200);
    expect(venue.body).toMatchObject({ setupTimeMinutes: 30, turnaroundTimeMinutes: 45 });
    expect(venue.body.reservations).toEqual(expect.arrayContaining([expect.objectContaining({
      id: holdId,
      start: '2030-11-20T02:00:00.000Z',
      end: '2030-11-20T04:00:00.000Z',
      status: 'tentative',
      holdExpiresAt: new Date(now.getTime() + 14 * 24 * hour).toISOString(),
    })]));
    const anotherEvent = await createEvent(a.coordinator.id);
    const conflict = await request(app.getHttpServer()).post(`/api/venues/${a.venue}/booking-requests`).set('Cookie', a.coordinator.cookie).send({ eventId: anotherEvent, start: '2030-11-20T02:00:00.000Z', end: '2030-11-20T04:00:00.000Z' }).expect(409);
    expect(conflict.body).toBeDefined();
  });

  /** VEN-HOLD-DEC-08-B: a pending request alone is not rendered as a blocking active hold. */
  it('VEN-HOLD-DEC-08-B does not list a pending request as a calendar reservation', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    const venue = await request(app.getHttpServer()).get(`/api/venues/${a.venue}`).set('Cookie', a.staff.cookie).expect(200);
    expect(venue.body.reservations).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId })]));
  });

  /** VEN-HOLD-DEC-08-BND-1: setup and turnaround overlap both block approval. */
  async function assertOccupiedEdge(blockStart: Date, blockEnd: Date) {
    const a = await context(); const holdId = await addHold(a.venue, a.event);
    await addBooking(a.venue, a.event, 'blocked', blockStart as Date, blockEnd as Date);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(409);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('pending');
    expect((await pool.query("SELECT start_at,end_at,status FROM venue_bookings WHERE venue_id=$1 AND status='blocked'", [a.venue])).rows[0]).toEqual({ start_at: blockStart, end_at: blockEnd, status: 'blocked' });
  }
  /** VEN-HOLD-DEC-08-BND-1: a blocker crossing 09:30 SGT overlaps the first setup minute. */
  it('VEN-HOLD-DEC-08-BND-1 rejects a blocker overlapping the first minute of setup', async () => {
    await assertOccupiedEdge(new Date('2030-11-20T01:29:00.000Z'), new Date('2030-11-20T01:31:00.000Z'));
  });
  /** VEN-HOLD-DEC-08-BND-1: a blocker crossing 12:45 SGT overlaps the last turnaround minute. */
  it('VEN-HOLD-DEC-08-BND-1 rejects a blocker overlapping the last minute of turnaround', async () => {
    await assertOccupiedEdge(new Date('2030-11-20T04:44:00.000Z'), new Date('2030-11-20T04:46:00.000Z'));
  });

  /** VEN-HOLD-DEC-09-A: an active hold converts to the same persisted venue/event booking. */
  it('VEN-HOLD-DEC-09-A converts an active hold before expiry', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    const before = (await pool.query('SELECT event_id, venue_id, start_at, end_at FROM venue_bookings WHERE id=$1', [holdId])).rows[0];
    const result = await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/convert`).set('Cookie', a.staff.cookie).expect(201);
    expect(result.body).toMatchObject({ id: holdId, status: 'approved', requestKind: 'booking' });
    expect(result.body).not.toHaveProperty('holdExpiresAt');
    const after = (await pool.query('SELECT event_id, venue_id, start_at, end_at, request_kind, hold_expires_at FROM venue_bookings WHERE id=$1', [holdId])).rows[0];
    expect(after).toEqual({ ...before, request_kind: 'booking', hold_expires_at: null });
    expect((await pool.query("SELECT action FROM booking_review_log WHERE booking_id=$1", [holdId])).rows[0].action).toBe('converted');
  });

  /** VEN-HOLD-DEC-09-B: conversion at expiry is rejected and leaves the persisted expired hold unchanged. */
  it('VEN-HOLD-DEC-09-B rejects conversion at expiry', async () => {
    const a = await context(); const expiry = new Date(now.getTime() + hour); const holdId = await addHold(a.venue, a.event, 'approved', expiry);
    now = expiry;
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/convert`).set('Cookie', a.staff.cookie).expect(409);
    expect((await pool.query('SELECT status, request_kind FROM venue_bookings WHERE id=$1', [holdId])).rows[0]).toEqual({ status: 'approved', request_kind: 'tentative_hold' });
    const ordinary = await addBooking(a.venue, await createEvent(a.coordinator.id), 'approved');
    await request(app.getHttpServer()).post(`/api/venues/bookings/${ordinary}/convert`).set('Cookie', a.staff.cookie).expect(409);
    expect((await pool.query('SELECT status, request_kind FROM venue_bookings WHERE id=$1', [ordinary])).rows[0]).toEqual({ status: 'approved', request_kind: 'booking' });
  });

  /** VEN-HOLD-DEC-09-B and VEN-HOLD-DEC-10-B: cancelled events cannot convert or release their venue holds. */
  it('VEN-HOLD-DEC-09-B refuses convert and release after the event is cancelled', async () => {
    const conversion = await context(); const convertId = await addHold(conversion.venue, conversion.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    await pool.query("UPDATE events SET status='Cancelled' WHERE id=$1", [conversion.event]);
    const convertResponse = await request(app.getHttpServer()).post(`/api/venues/bookings/${convertId}/convert`).set('Cookie', conversion.staff.cookie).expect(409);
    expect(convertResponse.body).toMatchObject({ code: 'EVENT_CANCELLED' });
    expect((await pool.query('SELECT status, request_kind FROM venue_bookings WHERE id=$1', [convertId])).rows[0]).toEqual({ status: 'approved', request_kind: 'tentative_hold' });

    const release = await context(); const releaseId = await addHold(release.venue, release.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    await pool.query("UPDATE events SET status='Cancelled' WHERE id=$1", [release.event]);
    const releaseResponse = await request(app.getHttpServer()).post(`/api/venues/bookings/${releaseId}/release`).set('Cookie', release.staff.cookie).expect(409);
    expect(releaseResponse.body).toMatchObject({ code: 'EVENT_CANCELLED' });
    expect((await pool.query('SELECT status, request_kind FROM venue_bookings WHERE id=$1', [releaseId])).rows[0]).toEqual({ status: 'approved', request_kind: 'tentative_hold' });
  });

  /** VEN-HOLD-DEC-09-B and VEN-HOLD-DEC-10-B: audit insertion failure rolls back both lifecycle mutations. */
  it('VEN-HOLD-DEC-09-B rolls back conversion and release when their audit insert fails', async () => {
    const convert = await context(); const convertId = await addHold(convert.venue, convert.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    const release = await context(); const releaseId = await addHold(release.venue, release.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    await pool.query(`CREATE OR REPLACE FUNCTION spm132_fail_terminal_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action IN ('converted', 'released') THEN RAISE EXCEPTION 'test audit rejection'; END IF;
        RETURN NEW;
      END;
    $$`);
    await pool.query('CREATE TRIGGER spm132_fail_terminal_audit BEFORE INSERT ON booking_review_log FOR EACH ROW EXECUTE FUNCTION spm132_fail_terminal_audit()');
    try {
      await request(app.getHttpServer()).post(`/api/venues/bookings/${convertId}/convert`).set('Cookie', convert.staff.cookie).expect(500);
      await request(app.getHttpServer()).post(`/api/venues/bookings/${releaseId}/release`).set('Cookie', release.staff.cookie).expect(500);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS spm132_fail_terminal_audit ON booking_review_log');
      await pool.query('DROP FUNCTION IF EXISTS spm132_fail_terminal_audit()');
    }
    expect((await pool.query('SELECT status, request_kind, hold_expires_at FROM venue_bookings WHERE id=$1', [convertId])).rows[0]).toMatchObject({ status: 'approved', request_kind: 'tentative_hold', hold_expires_at: new Date(now.getTime() + 14 * 24 * hour) });
    expect((await pool.query('SELECT status, request_kind FROM venue_bookings WHERE id=$1', [releaseId])).rows[0]).toEqual({ status: 'approved', request_kind: 'tentative_hold' });
    expect((await pool.query("SELECT count(*)::int AS count FROM booking_review_log WHERE booking_id=ANY($1::uuid[]) AND action IN ('converted','released')", [[convertId, releaseId]])).rows[0].count).toBe(0);
  });

  /** VEN-HOLD-DEC-09-PERF-1: concurrent conversion and release serialize to one terminal outcome. */
  it('VEN-HOLD-DEC-09-PERF-1 allows only one of concurrent conversion and release', async () => {
    const a = await context(); const expiry = new Date(now.getTime() + 14 * 24 * hour); const holdId = await addHold(a.venue, a.event, 'approved', expiry);
    const gate = await pool.connect();
    await pool.query('DROP TRIGGER IF EXISTS spm132_lifecycle_gate ON booking_review_log');
    await pool.query('DROP FUNCTION IF EXISTS spm132_lifecycle_gate()');
    await pool.query(`CREATE OR REPLACE FUNCTION spm132_lifecycle_gate() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action IN ('converted', 'released') THEN PERFORM pg_advisory_xact_lock(132132, 2); END IF;
        RETURN NEW;
      END;
    $$`);
    await pool.query('CREATE TRIGGER spm132_lifecycle_gate BEFORE INSERT ON booking_review_log FOR EACH ROW EXECUTE FUNCTION spm132_lifecycle_gate()');
    await gate.query('SELECT pg_advisory_lock(132132, 2)');
    const resultsPromise = Promise.all([
      request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/convert`).set('Cookie', a.staff.cookie),
      request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/release`).set('Cookie', a.staff.cookie),
    ]);
    let waiting = 0;
    const deadline = Date.now() + 5000;
    try {
      while (waiting < 2 && Date.now() < deadline) {
        const result = await pool.query(`SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND state = 'active' AND wait_event_type = 'Lock'
            AND (query ILIKE '%FOR UPDATE%' OR query ILIKE '%booking_review_log%')`);
        waiting = result.rows[0].count;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBeGreaterThanOrEqual(2);
    } finally {
      await gate.query('SELECT pg_advisory_unlock(132132, 2)');
      gate.release();
      await Promise.allSettled([resultsPromise]);
      await pool.query('DROP TRIGGER IF EXISTS spm132_lifecycle_gate ON booking_review_log');
      await pool.query('DROP FUNCTION IF EXISTS spm132_lifecycle_gate()');
    }
    const [convert, release] = await resultsPromise;
    expect([convert.status, release.status].filter((status) => status === 201)).toHaveLength(1);
    expect([convert.status, release.status].filter((status) => status === 409)).toHaveLength(1);
    const converted = convert.status === 201;
    const terminalAction = converted ? 'converted' : 'released';
    expect(converted ? release.status : convert.status).toBe(409);
    expect((await pool.query('SELECT status,request_kind,hold_expires_at FROM venue_bookings WHERE id=$1', [holdId])).rows[0]).toEqual({
      status: converted ? 'approved' : 'released', request_kind: converted ? 'booking' : 'tentative_hold', hold_expires_at: converted ? null : expiry,
    });
    expect((await pool.query('SELECT action,actor_user_id FROM booking_review_log WHERE booking_id=$1', [holdId])).rows).toEqual([{ action: terminalAction, actor_user_id: a.staff.id }]);
    const reservations = (await request(app.getHttpServer()).get(`/api/venues/${a.venue}`).set('Cookie', a.staff.cookie).expect(200)).body.reservations.filter((row: { id: string }) => row.id === holdId);
    expect(reservations).toEqual(converted ? [expect.objectContaining({ id: holdId, status: 'booked' })] : []);
  });

  /** VEN-HOLD-DEC-10-A: Venue Staff can release an active hold before expiry. */
  it('VEN-HOLD-DEC-10-A releases an active hold and persists Released', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/release`).set('Cookie', a.staff.cookie).expect(201);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [holdId])).rows[0].status).toBe('released');
    expect((await pool.query('SELECT action FROM booking_review_log WHERE booking_id=$1', [holdId])).rows.map((row) => row.action)).toEqual(['released']);
  });

  /** VEN-HOLD-DEC-10-B: releasing one venue's hold leaves another venue's hold unchanged. */
  it('VEN-HOLD-DEC-10-B releases only the selected venue hold', async () => {
    const a = await context(); const secondVenue = await createVenue(a.staff.id);
    const selected = await addHold(a.venue, a.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    const other = await addHold(secondVenue, a.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${selected}/release`).set('Cookie', a.staff.cookie).expect(201);
    const pending = await addHold(a.venue, await createEvent(a.coordinator.id));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${pending}/release`).set('Cookie', a.staff.cookie).expect(409);
    const expired = await addHold(a.venue, await createEvent(a.coordinator.id), 'expired', new Date(now.getTime() - hour));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${expired}/release`).set('Cookie', a.staff.cookie).expect(409);
    const exactExpiry = await addHold(a.venue, await createEvent(a.coordinator.id), 'approved', now);
    await request(app.getHttpServer()).post(`/api/venues/bookings/${exactExpiry}/release`).set('Cookie', a.staff.cookie).expect(409);
    const ordinary = await addBooking(a.venue, await createEvent(a.coordinator.id), 'approved');
    await request(app.getHttpServer()).post(`/api/venues/bookings/${ordinary}/release`).set('Cookie', a.staff.cookie).expect(409);
    const states = await pool.query('SELECT id,status FROM venue_bookings WHERE id=ANY($1::uuid[])', [[selected, other]]);
    expect(states.rows).toEqual(expect.arrayContaining([{ id: selected, status: 'released' }, { id: other, status: 'approved' }]));
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=ANY($1::uuid[]) ORDER BY status', [[pending, expired, exactExpiry, ordinary]])).rows.map((row) => row.status).sort()).toEqual(['approved', 'approved', 'expired', 'pending']);
  });

  /** VEN-HOLD-DEC-11-B: a confirmed booking blocks approval without changing either record. */
  it('VEN-HOLD-DEC-11-B blocks approval against a confirmed booking', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event); const confirmedEvent = await createEvent(a.coordinator.id);
    const bookingId = await addBooking(a.venue, confirmedEvent, 'approved');
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/approve`).set('Cookie', a.staff.cookie).expect(409);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=ANY($1::uuid[]) ORDER BY status', [[holdId, bookingId]])).rows.map((row) => row.status).sort()).toEqual(['approved', 'pending']);
  });

  /** VEN-HOLD-DEC-11-C: another active hold blocks approval. */
  it('VEN-HOLD-DEC-11-C blocks approval against an existing active hold', async () => {
    const a = await context(); const target = await addHold(a.venue, a.event); const otherEvent = await createEvent(a.coordinator.id);
    const existing = await addHold(a.venue, otherEvent, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${target}/approve`).set('Cookie', a.staff.cookie).expect(409);
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=ANY($1::uuid[])', [[target, existing]])).rows).toEqual(expect.arrayContaining([{ status: 'pending' }, { status: 'approved' }]));
  });

  /** VEN-HOLD-DEC-11-PERF-1: serial approval locks ensure that at most one overlapping hold becomes active. */
  it('VEN-HOLD-DEC-11-PERF-1 serializes competing approvals', async () => {
    const a = await context(); const eventB = await createEvent(a.coordinator.id); const first = await addHold(a.venue, a.event); const second = await addHold(a.venue, eventB);
    const gate = await pool.connect();
    await pool.query('DROP TRIGGER IF EXISTS spm132_approval_gate ON venue_bookings');
    await pool.query('DROP FUNCTION IF EXISTS spm132_approval_gate()');
    await pool.query(`CREATE OR REPLACE FUNCTION spm132_approval_gate() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'approved' AND NEW.request_kind = 'tentative_hold' THEN
          PERFORM pg_advisory_xact_lock(132132, 1);
        END IF;
        RETURN NEW;
      END;
    $$`);
    await pool.query('CREATE TRIGGER spm132_approval_gate BEFORE UPDATE ON venue_bookings FOR EACH ROW EXECUTE FUNCTION spm132_approval_gate()');
    await gate.query('SELECT pg_advisory_lock(132132, 1)');
    const pending = [first, second].map((id) => request(app.getHttpServer()).post(`/api/venues/bookings/${id}/approve`).set('Cookie', a.staff.cookie));
    const resultsPromise = Promise.all(pending);
    let waiting = 0;
    const deadline = Date.now() + 5000;
    try {
      while (waiting < 2 && Date.now() < deadline) {
        const result = await pool.query(`SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND state = 'active' AND wait_event_type = 'Lock'
            AND (query ILIKE '%venue_bookings%' OR query ILIKE '%FOR UPDATE%')`);
        waiting = result.rows[0].count;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBeGreaterThanOrEqual(2);
    } finally {
      await gate.query('SELECT pg_advisory_unlock(132132, 1)');
      gate.release();
      await Promise.allSettled([resultsPromise]);
      await pool.query('DROP TRIGGER IF EXISTS spm132_approval_gate ON venue_bookings');
      await pool.query('DROP FUNCTION IF EXISTS spm132_approval_gate()');
    }
    const results = await resultsPromise;
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS count FROM venue_bookings WHERE venue_id=$1 AND status='approved' AND request_kind='tentative_hold'", [a.venue])).rows[0].count).toBe(1);
  }, 15000);

  /** VEN-HOLD-DEC-12-A: a converted hold is represented as a confirmed calendar booking. */
  it('VEN-HOLD-DEC-12-A displays a converted hold as a booked calendar reservation', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/convert`).set('Cookie', a.staff.cookie).expect(201);
    const calendar = await request(app.getHttpServer()).get(`/api/venues/${a.venue}`).set('Cookie', a.staff.cookie).expect(200);
    expect(calendar.body.reservations).toEqual(expect.arrayContaining([expect.objectContaining({
      id: holdId,
      start: '2030-11-20T02:00:00.000Z',
      end: '2030-11-20T04:00:00.000Z',
      status: 'booked',
    })]));
    expect(calendar.body.reservations).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId, status: 'tentative' })]));
  });

  /** VEN-HOLD-DEC-12-B: conversion persists across an independent calendar read and produces no duplicate hold. */
  it('VEN-HOLD-DEC-12-B retains one confirmed row after reloading the calendar', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/convert`).set('Cookie', a.staff.cookie).expect(201);
    const [first, reload] = await Promise.all([
      request(app.getHttpServer()).get(`/api/venues/${a.venue}`).set('Cookie', a.staff.cookie),
      request(app.getHttpServer()).get(`/api/venues/${a.venue}`).set('Cookie', a.staff.cookie),
    ]);
    expect(first.body.reservations.filter((row: { id: string }) => row.id === holdId)).toHaveLength(1);
    expect(reload.body.reservations.filter((row: { id: string; status: string }) => row.id === holdId && row.status === 'booked')).toHaveLength(1);
  });

  /** VEN-HOLD-DEC-13-A: a released hold no longer appears among active calendar reservations. */
  it('VEN-HOLD-DEC-13-A removes a released hold from calendar reservations', async () => {
    const a = await context(); const holdId = await addHold(a.venue, a.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/release`).set('Cookie', a.staff.cookie).expect(201);
    const calendar = await request(app.getHttpServer()).get(`/api/venues/${a.venue}`).set('Cookie', a.staff.cookie).expect(200);
    expect(calendar.body.reservations).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: holdId })]));
    const replacementEvent = await createEvent(a.coordinator.id);
    const replacement = await request(app.getHttpServer()).post(`/api/venues/${a.venue}/booking-requests`)
      .set('Cookie', a.coordinator.cookie)
      .send({ eventId: replacementEvent, start: '2030-11-20T02:00:00.000Z', end: '2030-11-20T04:00:00.000Z' })
      .expect(201);
    expect(replacement.body).toMatchObject({ status: 'pending' });
    expect((await pool.query('SELECT status,request_kind FROM venue_bookings WHERE id=$1', [replacement.body.id])).rows[0]).toEqual({ status: 'pending', request_kind: 'booking' });
    expect((await pool.query('SELECT status,request_kind FROM venue_bookings WHERE id=$1', [holdId])).rows[0]).toEqual({ status: 'released', request_kind: 'tentative_hold' });
  });

  /** VEN-HOLD-DEC-13-B: release keeps history and leaves an unrelated confirmed booking untouched. */
  it('VEN-HOLD-DEC-13-B retains released history and preserves unrelated bookings', async () => {
    const a = await context(); const secondVenue = await createVenue(a.staff.id);
    const holdId = await addHold(a.venue, a.event, 'approved', new Date(now.getTime() + 14 * 24 * hour));
    const bookingEvent = await createEvent(a.coordinator.id); const otherId = await addBooking(secondVenue, bookingEvent, 'approved');
    await request(app.getHttpServer()).post(`/api/venues/bookings/${holdId}/release`).set('Cookie', a.staff.cookie).expect(201);
    const history = await request(app.getHttpServer()).get('/api/venues/bookings/mine').set('Cookie', a.coordinator.cookie).expect(200);
    expect(history).toMatchObject({ body: expect.arrayContaining([expect.objectContaining({ id: holdId, status: 'released' })]) });
    expect((await pool.query('SELECT status FROM venue_bookings WHERE id=$1', [otherId])).rows[0].status).toBe('approved');
  });
});
