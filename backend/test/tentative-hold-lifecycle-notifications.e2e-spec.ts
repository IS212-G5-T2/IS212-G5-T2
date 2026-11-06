/*
 * SPM-134 integration coverage (tentative hold expiry notifications, Coordinator) through the real Nest HTTP pipeline,
 * session middleware and PostgreSQL: the event's Coordinator gets one in-app notification 48 hours before an active
 * tentative hold expires, when it expires, and when Venue Staff release or convert it. Every user signs in through the
 * real login route; the scheduler's own methods run with the injected clock (CLOCK), so no test waits for real time.
 * Test cases: HOLD-EXP-NOTIF-01-G, 01-BND-1, 01-CONC-1, 01-SEC-1, 02-D, 02-BND-1, 02-CONC-1, 02-INT-1, 03-E, 03-F,
 * 03-STATE-1, 04-C, 05-A, 05-B, 05-C, 05-D, 06-G, 07-A, 08-A, 09-B, 09-D, 09-E, 10-B, 10-C, 11-E, 11-F, 11-G, 11-H.
 * Needs DATABASE_URL with database/postgresql/init applied (the venue migrations and 036 are applied again here).
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { VenuesRepository } from '../src/venues/repository/venues.repository.js';
import { venueBookingReleaser } from '../src/venues/release/venue-booking.releaser.js';

const databaseUrl = process.env.DATABASE_URL;
// The injected clock: every action in this suite happens at testNow, which a test moves explicitly.
const baseNow = new Date('2030-06-01T12:00:00.000Z');
let testNow = baseNow;
const HOUR = 3_600_000;
if (!databaseUrl && process.env.CI)
  throw new Error('SPM-134 hold lifecycle notification PostgreSQL tests must run in CI: set DATABASE_URL.');

type TestUser = { id: string; email: string; cookie: string };
type FeedItem = {
  id: string;
  type: string;
  message: string;
  relatedEventId: string | null;
  relatedBookingId: string | null;
  read: boolean;
  createdAt: string;
};
type MineItem = { id: string; status: string; requestKind: string; holdExpiresAt?: string; holdExpired: boolean };

const REMINDER = 'tentative_hold_expiry_reminder';
const EXPIRED = 'tentative_hold_expired';
const RELEASED = 'tentative_hold_released';
const CONVERTED = 'tentative_hold_converted';

describe.skipIf(!databaseUrl)('SPM-134 tentative hold lifecycle notifications HTTP and PostgreSQL', () => {
  let app: INestApplication;
  // The app listens once on a fixed loopback port (see the SPM-165 suite for why supertest's ephemeral port is avoided).
  let baseUrl: string;
  let pool: pg.Pool;
  let repository: VenuesRepository;
  const venueIds: string[] = [];
  const eventIds: string[] = [];
  const userIds: string[] = [];
  // Rows this suite did not create. The processors it drives are global and run with far-future clocks, so they can
  // expire or remind a hold that already exists in the database (for example the seeded "SPM-56 active tentative hold
  // blocker") and notify its Coordinator. afterAll puts those rows back and removes only the notices this suite caused.
  type ForeignBooking = { id: string; status: string; hold_expiry_processed_at: Date | null; hold_reminder_sent_at: Date | null };
  let foreignBookings: ForeignBooking[] = [];
  let foreignNoticeIds: string[] = [];
  const sameInstant = (a: Date | null, b: Date | null) => (a === null || b === null ? a === b : a.getTime() === b.getTime());
  const loadForeignBookings = async () =>
    (await pool.query<ForeignBooking>(
      'SELECT id, status, hold_expiry_processed_at, hold_reminder_sent_at FROM venue_bookings WHERE id = ANY($1::uuid[]) ORDER BY id',
      [foreignBookings.map((row) => row.id)],
    )).rows;

  async function restoreForeignRows() {
    if (!foreignBookings.length) return { restoredBookings: 0, removedNotices: 0 };
    const ids = foreignBookings.map((row) => row.id);
    const restore = async (silenceHistory: boolean) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Restoring a status would otherwise add a history entry for an event this suite never touched.
        if (silenceHistory) await client.query('ALTER TABLE venue_bookings DISABLE TRIGGER venue_bookings_audit');
        const restored = await client.query(
          `UPDATE venue_bookings b
              SET status = s.status, hold_expiry_processed_at = s.processed, hold_reminder_sent_at = s.reminded
             FROM unnest($1::uuid[], $2::text[], $3::timestamptz[], $4::timestamptz[]) AS s(id, status, processed, reminded)
            WHERE b.id = s.id
              AND (b.status, b.hold_expiry_processed_at, b.hold_reminder_sent_at) IS DISTINCT FROM (s.status, s.processed, s.reminded)`,
          [ids, foreignBookings.map((r) => r.status), foreignBookings.map((r) => r.hold_expiry_processed_at), foreignBookings.map((r) => r.hold_reminder_sent_at)],
        );
        const removed = await client.query(
          'DELETE FROM notifications WHERE related_booking_id = ANY($1::uuid[]) AND id <> ALL($2::uuid[])',
          [ids, foreignNoticeIds],
        );
        if (silenceHistory) await client.query('ALTER TABLE venue_bookings ENABLE TRIGGER venue_bookings_audit');
        await client.query('COMMIT');
        return { restoredBookings: restored.rowCount ?? 0, removedNotices: removed.rowCount ?? 0 };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
    const hasHistoryTrigger = (await pool.query("SELECT 1 FROM pg_trigger WHERE tgname = 'venue_bookings_audit' AND tgrelid = 'venue_bookings'::regclass")).rowCount === 1;
    try {
      return await restore(hasHistoryTrigger);
    } catch (error) {
      if (!hasHistoryTrigger) throw error;
      return await restore(false); // not the table owner: restore anyway, accepting the history entry
    }
  }

  beforeAll(async () => {
    // The in-process timer must never fire during the suite: the tests drive the processors themselves.
    process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS = String(24 * HOUR);
    pool = new pg.Pool({ connectionString: databaseUrl });
    pool.on('error', (err) => { console.error('[pool-idle-error]', err.message); });
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
      '029_spm137_booking_decision_notification.sql',
      '032_spm132_tentative_hold_expiry_processing.sql',
      '033_fix_venue_trigger_bypass.sql',
      '036_spm134_hold_expiry_notifications.sql',
    ])
      await pool.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));

    foreignBookings = (await pool.query<ForeignBooking>(
      'SELECT id, status, hold_expiry_processed_at, hold_reminder_sent_at FROM venue_bookings ORDER BY id',
    )).rows;
    foreignNoticeIds = (await pool.query<{ id: string }>('SELECT id FROM notifications')).rows.map((row) => row.id);

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => testNow })
      .compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    repository = app.get(VenuesRepository);
  });

  afterAll(async () => {
    delete process.env.TENTATIVE_HOLD_EXPIRY_INTERVAL_MS;
    await app?.close();
    if (!pool) return;
    // Leave every row the suite did not create exactly as it found it, and prove it.
    const restored = await restoreForeignRows();
    const after = await loadForeignBookings();
    process.stderr.write(`[SPM-134 e2e] foreign venue_bookings checked: ${foreignBookings.length}; restored: ${restored.restoredBookings}; foreign notices removed: ${restored.removedNotices}\n`);
    expect(after).toHaveLength(foreignBookings.length);
    for (const before of foreignBookings) {
      const now = after.find((row) => row.id === before.id)!;
      expect([now.status, sameInstant(now.hold_expiry_processed_at, before.hold_expiry_processed_at), sameInstant(now.hold_reminder_sent_at, before.hold_reminder_sent_at)]).toEqual([before.status, true, true]);
    }
    const noticesNow = (await pool.query<{ id: string }>('SELECT id FROM notifications WHERE related_booking_id = ANY($1::uuid[])', [foreignBookings.map((row) => row.id)])).rows.map((row) => row.id);
    expect(noticesNow.every((id) => foreignNoticeIds.includes(id))).toBe(true);
    // Deleting the venues removes their bookings (and those bookings' notifications); the events remove the rest.
    if (venueIds.length) await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venueIds]);
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await pool.end();
  });

  // ---- fixtures ----------------------------------------------------------------------------------------------------

  async function login(email: string, password = 'password123') {
    const response = await request(baseUrl).post('/api/auth/login').send({ email, password }).expect(201);
    const cookie = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) =>
      value.startsWith('connectsphere_session='),
    );
    if (!cookie) throw new Error('Expected an authenticated test session cookie');
    return cookie.split(';', 1)[0];
  }

  async function createUser(role: 'COORDINATOR' | 'VENUE_STAFF' | 'ORGANISER' | 'COORDINATOR_LEAD', name = 'SPM-134 User'): Promise<TestUser> {
    const email = `spm134-${randomUUID()}@example.test`;
    const client = await pool.connect();
    let id!: string;
    try {
      const created = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
         VALUES ($1, $2, crypt('password123', gen_salt('bf', 4))) RETURNING id`,
        [email, name],
      );
      id = created.rows[0].id;
      userIds.push(id);
      await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [id, role]);
    } finally {
      client.release();
    }
    return { id, email, cookie: await login(email) };
  }

  async function createVenue(ownerId: string, name = `SPM-134 Hall ${randomUUID()}`) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO venues (id, owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, $3, 'SPM-134 Test Location', 100, 'Integration fixture', 0, 0)`,
      [id, ownerId, name],
    );
    venueIds.push(id);
    return { id, name };
  }

  async function createEvent(coordinatorId: string | null, name: string, organiserId = 'spm134-organiser') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, start_date_time, end_date_time,
         expected_attendance, coordinator_id, coordinator_name, submission_key, status)
       VALUES ($1, $4, 'SPM-134 Organiser', 'spm134@example.test', $2, 'Hold notification', '2030-09-01T06:00:00.000Z',
         '2030-09-01T07:00:00.000Z', 10, $3, 'SPM-134 Coordinator', $1, 'Planning')`,
      [id, name, coordinatorId, organiserId],
    );
    eventIds.push(id);
    return id;
  }

  /** One Venue Staff owner, one Coordinator and an assigned event; `addHold` seeds an approved hold at its own venue. */
  async function world(eventName = 'SPM-134 Gala') {
    const staff = await createUser('VENUE_STAFF', 'SPM-134 Staff');
    const coordinator = await createUser('COORDINATOR', 'SPM-134 Coordinator');
    const eventId = await createEvent(coordinator.id, eventName);
    const addHold = async (expires: Date, status: 'approved' | 'pending' = 'approved') => {
      const venue = await createVenue(staff.id);
      const row = await pool.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
         VALUES ($1, $2, '2030-09-01T06:00:00.000Z', '2030-09-01T07:00:00.000Z', $4, 'tentative_hold', $3) RETURNING id`,
        [venue.id, eventId, expires, status],
      );
      return { id: row.rows[0].id, venue };
    };
    return { staff, coordinator, eventId, eventName, addHold };
  }

  const release = (holdId: string, user: TestUser) =>
    request(baseUrl).post(`/api/venues/bookings/${holdId}/release-hold`).set('Cookie', user.cookie);
  const convert = (holdId: string, user: TestUser) =>
    request(baseUrl).post(`/api/venues/bookings/${holdId}/convert-hold`).set('Cookie', user.cookie);
  const feed = async (user: TestUser, cookie = user.cookie) =>
    (await request(baseUrl).get('/api/notifications').set('Cookie', cookie).expect(200)).body as FeedItem[];
  const noticesFor = async (user: TestUser, holdId: string) => (await feed(user)).filter((n) => n.relatedBookingId === holdId);
  const storedFor = async (holdId: string) =>
    (await pool.query<{ recipient_id: string; type: string; message: string; read: boolean; created_at: Date }>(
      'SELECT recipient_id, type, message, read, created_at FROM notifications WHERE related_booking_id = $1 ORDER BY created_at, type',
      [holdId],
    )).rows;
  const typesFor = async (holdId: string) => (await storedFor(holdId)).map((row) => row.type).sort();
  const hold = async (holdId: string) =>
    (await pool.query<{ status: string; request_kind: string; hold_reminder_sent_at: Date | null; hold_expiry_processed_at: Date | null }>(
      'SELECT status, request_kind, hold_reminder_sent_at, hold_expiry_processed_at FROM venue_bookings WHERE id = $1',
      [holdId],
    )).rows[0];
  const at = (instant: Date) => { testNow = instant; };
  const runReminders = () => repository.processTentativeHoldReminders();
  const runExpiry = () => repository.processExpiredTentativeHolds();

  // ---- AC1 ---------------------------------------------------------------------------------------------------------

  /**
   * HOLD-EXP-NOTIF-01-G (SPM-134 AC1): a hold that expires within 48 hours gets one reminder, in the assigned
   * Coordinator's feed only; a second run sends nothing more (the reminder is sent exactly once).
   * Kills: no reminder, a second reminder on a later tick, another Coordinator receiving it, a missing marker.
   */
  it('HOLD-EXP-NOTIF-01-G a due hold gives the assigned Coordinator one reminder, once, and no other Coordinator any', async () => {
    at(baseNow);
    const w = await world();
    const other = await createUser('COORDINATOR', 'SPM-134 Other Coordinator');
    const due = await w.addHold(new Date(baseNow.getTime() + 47 * HOUR));

    expect(await runReminders()).toContain(due.id);
    expect(await runReminders()).not.toContain(due.id);

    expect(await noticesFor(w.coordinator, due.id)).toMatchObject([{ type: REMINDER, relatedEventId: w.eventId, relatedBookingId: due.id, read: false }]);
    expect(await noticesFor(other, due.id)).toEqual([]);
    expect((await storedFor(due.id)).map((row) => [row.recipient_id, row.type])).toEqual([[w.coordinator.id, REMINDER]]);
    expect((await hold(due.id)).hold_reminder_sent_at).toEqual(baseNow);
  });

  /**
   * HOLD-EXP-NOTIF-01-BND-1 (SPM-134 AC1, boundary): the reminder is sent at the first run where now is at least 48 hours
   * before the expiry: not 1 ms earlier, yes exactly at 48 hours. A hold more than 48 hours away is not reminded.
   * Kills: a window of 47 or 49 hours, < instead of <=, reminding every hold regardless of distance.
   */
  it('HOLD-EXP-NOTIF-01-BND-1 sends the reminder exactly at 48 hours before expiry and not 1 ms earlier', async () => {
    const w = await world();
    const expiry = new Date('2030-07-10T12:00:00.000Z');
    const target = await w.addHold(expiry);

    at(new Date(expiry.getTime() - 48 * HOUR - 1));
    expect(await runReminders()).not.toContain(target.id);
    expect(await storedFor(target.id)).toEqual([]);

    at(new Date(expiry.getTime() - 48 * HOUR));
    expect(await runReminders()).toContain(target.id);
    const [reminder] = await storedFor(target.id);
    expect(reminder.type).toBe(REMINDER);
    expect(reminder.created_at).toEqual(new Date(expiry.getTime() - 48 * HOUR));
  });

  /**
   * HOLD-EXP-NOTIF-01-CONC-1 (SPM-134 AC1, concurrency): two overlapping reminder runs send one reminder: exactly one run
   * returns the hold and one notice is stored.
   * Kills: a select-then-insert reminder without an atomic marker.
   */
  it('HOLD-EXP-NOTIF-01-CONC-1 two overlapping reminder runs send one reminder', async () => {
    at(baseNow);
    const w = await world();
    const due = await w.addHold(new Date(baseNow.getTime() + 40 * HOUR));

    const results = await Promise.all([runReminders(), runReminders(), runReminders()]);

    expect(results.filter((ids) => ids.includes(due.id))).toHaveLength(1);
    expect(await typesFor(due.id)).toEqual([REMINDER]);
  });

  /**
   * HOLD-EXP-NOTIF-01-SEC-1 (SPM-134 AC1, security): the event's Organiser and a Coordinator of another event do not see
   * the reminder and cannot mark it read.
   * Kills: addressing the notice to the Organiser, listing it for every Coordinator, an unscoped read call.
   */
  it('HOLD-EXP-NOTIF-01-SEC-1 the Organiser and another Coordinator neither see nor mark the reminder read', async () => {
    at(baseNow);
    const staff = await createUser('VENUE_STAFF');
    const coordinator = await createUser('COORDINATOR');
    const organiser = await createUser('ORGANISER');
    const other = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'SPM-134 Organiser event', organiser.id);
    const venue = await createVenue(staff.id);
    const row = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
       VALUES ($1, $2, '2030-09-01T06:00:00.000Z', '2030-09-01T07:00:00.000Z', 'approved', 'tentative_hold', $3) RETURNING id`,
      [venue.id, eventId, new Date(baseNow.getTime() + 30 * HOUR)],
    );
    const holdId = row.rows[0].id;
    await runReminders();
    const [notice] = await noticesFor(coordinator, holdId);

    expect((await feed(organiser)).filter((n) => n.relatedBookingId === holdId)).toEqual([]);
    expect((await feed(other)).filter((n) => n.relatedBookingId === holdId)).toEqual([]);
    await request(baseUrl).post(`/api/notifications/${notice.id}/read`).set('Cookie', organiser.cookie).expect(404);
    await request(baseUrl).post(`/api/notifications/${notice.id}/read`).set('Cookie', other.cookie).expect(404);
    expect((await storedFor(holdId))[0].read).toBe(false);
  });

  // ---- AC2 ---------------------------------------------------------------------------------------------------------

  /**
   * HOLD-EXP-NOTIF-02-D (SPM-134 AC2): when the hold has expired the processor changes it to expired and the assigned
   * Coordinator gets one expired notice; a second run adds nothing.
   * Kills: no notice, a repeat notice, the status change and notice not happening together.
   */
  it('HOLD-EXP-NOTIF-02-D an elapsed hold becomes expired with one expired notice for the Coordinator, once', async () => {
    at(baseNow);
    const w = await world();
    const elapsed = await w.addHold(new Date(baseNow.getTime() - 60_000));

    expect(await runExpiry()).toContain(elapsed.id);
    expect(await runExpiry()).not.toContain(elapsed.id);

    expect(await noticesFor(w.coordinator, elapsed.id)).toMatchObject([{ type: EXPIRED, relatedEventId: w.eventId, read: false }]);
    expect((await hold(elapsed.id)).status).toBe('expired');
    expect(await storedFor(elapsed.id)).toHaveLength(1);
    // AC4: the expired notice is stamped with the hold's expiry time, not the processing time.
    expect((await storedFor(elapsed.id))[0].created_at).toEqual(new Date(baseNow.getTime() - 60_000));
  });

  /**
   * HOLD-EXP-NOTIF-02-BND-1 (SPM-134 AC2, boundary): a hold expires exactly at its expiry instant (not 1 ms before), and
   * only then does it get an expired notice.
   * Kills: < instead of <= in the expiry test.
   */
  it('HOLD-EXP-NOTIF-02-BND-1 expires at exactly the expiry instant and not 1 ms earlier', async () => {
    const w = await world();
    const expiry = new Date('2030-08-10T12:00:00.000Z');
    const target = await w.addHold(expiry);

    at(new Date(expiry.getTime() - 1));
    expect(await runExpiry()).not.toContain(target.id);
    expect(await storedFor(target.id)).toEqual([]);
    expect((await hold(target.id)).status).toBe('approved');

    at(expiry);
    expect(await runExpiry()).toContain(target.id);
    expect(await typesFor(target.id)).toEqual([EXPIRED]);
  });

  /**
   * HOLD-EXP-NOTIF-02-CONC-1 (SPM-134 AC2, concurrency): overlapping expiry runs send one expired notice for the hold.
   * Kills: writing the notice outside the guarded status change.
   */
  it('HOLD-EXP-NOTIF-02-CONC-1 overlapping expiry runs send one expired notice', async () => {
    at(baseNow);
    const w = await world();
    const elapsed = await w.addHold(new Date(baseNow.getTime() - 5 * 60_000));

    const results = await Promise.all([runExpiry(), runExpiry(), runExpiry()]);

    expect(results.filter((ids) => ids.includes(elapsed.id))).toHaveLength(1);
    expect(await typesFor(elapsed.id)).toEqual([EXPIRED]);
  });

  /**
   * HOLD-EXP-NOTIF-02-INT-1 (SPM-134 AC2, atomicity): if the expired notice cannot be saved (a trigger forces the insert to
   * fail for this hold only), the hold is not expired either; once the failure is gone the next run expires it and sends
   * the notice.
   * Kills: expiring the hold in a separate transaction from its notice, so the notice is lost for good. Note: writing the
   * notice on the pool instead of the transaction client (mutant SPM134-BE-11) is behaviourally unobservable at DB level
   * (the forced failure rolls the transaction back either way); it is killed only by the unit call assertions in
   * HOLD-EXP-NOTIF-02-A and 02-C, not by this case.
   */
  it('HOLD-EXP-NOTIF-02-INT-1 does not expire the hold when its notice cannot be saved, and retries on the next run', async () => {
    at(baseNow);
    const w = await world();
    const elapsed = await w.addHold(new Date(baseNow.getTime() - 60_000));
    await pool.query(`CREATE OR REPLACE FUNCTION spm134_test_fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'spm134 forced notification failure'; END; $$`);
    await pool.query(
      `CREATE TRIGGER spm134_test_fail_notice BEFORE INSERT ON notifications FOR EACH ROW
         WHEN (NEW.related_booking_id = '${elapsed.id}'::uuid) EXECUTE FUNCTION spm134_test_fail_notice()`,
    );
    try {
      await expect(runExpiry()).rejects.toThrow('spm134 forced notification failure');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS spm134_test_fail_notice ON notifications');
      await pool.query('DROP FUNCTION IF EXISTS spm134_test_fail_notice()');
    }

    expect(await hold(elapsed.id)).toMatchObject({ status: 'approved', hold_expiry_processed_at: null });
    expect(await storedFor(elapsed.id)).toEqual([]);
    expect(await runExpiry()).toContain(elapsed.id);
    expect(await typesFor(elapsed.id)).toEqual([EXPIRED]);
  });

  // ---- AC3 ---------------------------------------------------------------------------------------------------------

  /**
   * HOLD-EXP-NOTIF-03-E (SPM-134 AC3): Venue Staff release an active hold; the assigned Coordinator gets one released
   * notice and the hold is released.
   * Kills: no notice on the release path, a repeat notice, the converted or expired type.
   */
  it('HOLD-EXP-NOTIF-03-E releasing an active hold gives the Coordinator one released notice', async () => {
    at(baseNow);
    const w = await world();
    const active = await w.addHold(new Date(baseNow.getTime() + 10 * 24 * HOUR));

    await release(active.id, w.staff).expect(201);

    expect(await noticesFor(w.coordinator, active.id)).toMatchObject([{ type: RELEASED, relatedEventId: w.eventId, read: false }]);
    expect((await hold(active.id)).status).toBe('released');
  });

  /**
   * HOLD-EXP-NOTIF-03-F (SPM-134 AC3): Venue Staff convert an active hold to a confirmed booking; the assigned
   * Coordinator gets one converted notice and the hold is now an ordinary approved booking.
   * Kills: no notice on the conversion path, the released type for a conversion.
   */
  it('HOLD-EXP-NOTIF-03-F converting an active hold gives the Coordinator one converted notice', async () => {
    at(baseNow);
    const w = await world();
    const active = await w.addHold(new Date(baseNow.getTime() + 10 * 24 * HOUR));

    await convert(active.id, w.staff).expect(201);

    expect(await noticesFor(w.coordinator, active.id)).toMatchObject([{ type: CONVERTED, relatedEventId: w.eventId, read: false }]);
    expect(await hold(active.id)).toMatchObject({ status: 'approved', request_kind: 'booking' });
  });

  /**
   * HOLD-EXP-NOTIF-03-STATE-1 (SPM-134 AC3, state): repeating a release, converting a released hold, releasing a converted
   * hold, or releasing an expired hold is refused with 409 and writes no further notice.
   * Kills: notifying before the state check, notifying on a refused repeat.
   */
  it('HOLD-EXP-NOTIF-03-STATE-1 a repeated or invalid release or conversion is refused and adds no notice', async () => {
    at(baseNow);
    const w = await world();
    const released = await w.addHold(new Date(baseNow.getTime() + 10 * 24 * HOUR));
    const converted = await w.addHold(new Date(baseNow.getTime() + 10 * 24 * HOUR));
    const expired = await w.addHold(new Date(baseNow.getTime() - HOUR));
    await release(released.id, w.staff).expect(201);
    await convert(converted.id, w.staff).expect(201);

    await release(released.id, w.staff).expect(409);
    await convert(released.id, w.staff).expect(409);
    await release(converted.id, w.staff).expect(409);
    await convert(converted.id, w.staff).expect(409);
    await release(expired.id, w.staff).expect(409);
    await convert(expired.id, w.staff).expect(409);

    expect(await typesFor(released.id)).toEqual([RELEASED]);
    expect(await typesFor(converted.id)).toEqual([CONVERTED]);
    expect(await storedFor(expired.id)).toEqual([]);
  });

  // ---- AC4 ---------------------------------------------------------------------------------------------------------

  /**
   * HOLD-EXP-NOTIF-04-C (SPM-134 AC4): the delivered texts are exactly the four sentences of the story, with the venue
   * name, the event name in quotes and the expiry in Singapore time (3 Jun 16:30 UTC is 4 Jun 00:30 SGT), and each is
   * stamped with the time of the reminder or change (the injected clock); the expired notice is stamped with the hold's
   * expiry time even though the processor ran a minute later.
   * Kills: other wording, the expiry in UTC, a timestamp from the database default, the processing time on an expired
   * notice, the expiry time on a reminder, released or converted notice.
   */
  it('HOLD-EXP-NOTIF-04-C the delivered texts and timestamps match the story', async () => {
    const w = await world('SPM-134 "Quoted" Gala');
    const expiry = new Date('2030-06-03T16:30:00.000Z');
    const sentAt = new Date('2030-06-02T00:00:00.000Z');
    const reminded = await w.addHold(expiry);
    const elapsed = await w.addHold(expiry);
    const toRelease = await w.addHold(expiry);
    const toConvert = await w.addHold(expiry);

    at(sentAt);
    await runReminders();
    await release(toRelease.id, w.staff).expect(201);
    await convert(toConvert.id, w.staff).expect(201);
    at(new Date('2030-06-03T16:31:00.000Z'));
    await runExpiry();

    const lead = (venue: string) => `Your tentative hold of ${venue} for "SPM-134 "Quoted" Gala"`;
    const messageOf = async (h: { id: string }, type: string) => (await storedFor(h.id)).find((row) => row.type === type)!;
    expect((await messageOf(reminded, REMINDER)).message).toBe(`${lead(reminded.venue.name)} expires on 4 Jun 2030, 00:30 SGT.`);
    expect((await messageOf(reminded, REMINDER)).created_at).toEqual(sentAt);
    expect((await messageOf(elapsed, EXPIRED)).message).toBe(`${lead(elapsed.venue.name)} expired on 4 Jun 2030, 00:30 SGT.`);
    expect((await messageOf(elapsed, EXPIRED)).created_at).toEqual(expiry);
    expect((await messageOf(toRelease, RELEASED)).message).toBe(`${lead(toRelease.venue.name)} has been released.`);
    expect((await messageOf(toRelease, RELEASED)).created_at).toEqual(sentAt);
    expect((await messageOf(toConvert, CONVERTED)).message).toBe(`${lead(toConvert.venue.name)} has been confirmed as a booking.`);
  });

  // ---- AC5 ---------------------------------------------------------------------------------------------------------

  /**
   * HOLD-EXP-NOTIF-05-A (SPM-134 AC5): a hold released before the reminder time is never reminded, even when the clock
   * later reaches 48 hours before its original expiry.
   * Kills: a reminder query that ignores the hold's status.
   */
  it('HOLD-EXP-NOTIF-05-A a hold released before the reminder time gets no reminder', async () => {
    at(baseNow);
    const w = await world();
    const expiry = new Date(baseNow.getTime() + 5 * 24 * HOUR);
    const target = await w.addHold(expiry);
    await release(target.id, w.staff).expect(201);

    at(new Date(expiry.getTime() - 47 * HOUR));
    expect(await runReminders()).not.toContain(target.id);

    expect(await typesFor(target.id)).toEqual([RELEASED]);
  });

  /**
   * HOLD-EXP-NOTIF-05-B (SPM-134 AC5): a hold converted before the reminder time is never reminded.
   * Kills: reminding a converted hold. Note: a converted hold has hold_expires_at NULL, so the reminder UPDATE's
   * request_kind guard (mutant SPM134-BE-06) is behaviourally unobservable at DB level; that guard is killed only by the
   * unit SQL assertion in HOLD-EXP-NOTIF-01-C, not by this case.
   */
  it('HOLD-EXP-NOTIF-05-B a hold converted before the reminder time gets no reminder', async () => {
    at(baseNow);
    const w = await world();
    const expiry = new Date(baseNow.getTime() + 5 * 24 * HOUR);
    const target = await w.addHold(expiry);
    await convert(target.id, w.staff).expect(201);

    at(new Date(expiry.getTime() - 47 * HOUR));
    expect(await runReminders()).not.toContain(target.id);

    expect(await typesFor(target.id)).toEqual([CONVERTED]);
  });

  /**
   * HOLD-EXP-NOTIF-05-C (SPM-134 AC5): a hold whose expiry has passed but is not yet processed gets no reminder (not even
   * at the exact expiry instant); processing it sends only the expired notice.
   * Kills: a reminder window that includes expiry times at or before now.
   */
  it('HOLD-EXP-NOTIF-05-C a hold already past its expiry gets no reminder, only the expired notice', async () => {
    const w = await world();
    const expiry = new Date('2030-08-20T12:00:00.000Z');
    const stale = await w.addHold(expiry);
    const atExpiry = await w.addHold(expiry);

    at(expiry);
    const reminded = await runReminders();
    expect(reminded).not.toContain(stale.id);
    expect(reminded).not.toContain(atExpiry.id);
    await runExpiry();

    expect(await typesFor(stale.id)).toEqual([EXPIRED]);
    expect(await typesFor(atExpiry.id)).toEqual([EXPIRED]);
  });

  /**
   * HOLD-EXP-NOTIF-05-D (SPM-134 AC5): a hold that was reminded and then released or converted never produces an expired
   * notice, even after its original expiry time has passed.
   * Kills: an expiry query that ignores the status or request kind.
   */
  it.each([
    ['released', RELEASED, release],
    ['converted', CONVERTED, convert],
  ])('HOLD-EXP-NOTIF-05-D a reminded hold that is %s never gets an expired notice', async (_label, type, act) => {
    const w = await world();
    const expiry = new Date('2030-09-20T12:00:00.000Z');
    const target = await w.addHold(expiry);
    at(new Date(expiry.getTime() - 47 * HOUR));
    await runReminders();
    at(new Date(expiry.getTime() - 46 * HOUR));
    await act(target.id, w.staff).expect(201);

    at(new Date(expiry.getTime() + 60_000));
    expect(await runExpiry()).not.toContain(target.id);

    expect(await typesFor(target.id)).toEqual([REMINDER, type].sort());
  });

  // ---- AC6 ---------------------------------------------------------------------------------------------------------

  /**
   * HOLD-EXP-NOTIF-06-G (SPM-134 AC6): each notice's hold opens from the Coordinator's own bookings list with its current
   * status and expiry: reminded (approved, with expiry), expired (expired, holdExpired true, with expiry), released
   * (released, expiry kept) and converted (an approved booking, no expiry).
   * Kills: a missing relatedBookingId, a released or expired hold missing from the list, an expired hold not flagged.
   */
  it('HOLD-EXP-NOTIF-06-G every notice links to a hold the Coordinator can open with its status and expiry', async () => {
    const w = await world();
    const expiry = new Date('2030-10-10T12:00:00.000Z');
    const reminded = await w.addHold(new Date(expiry.getTime() + 20 * 24 * HOUR));
    const elapsed = await w.addHold(expiry);
    const toRelease = await w.addHold(new Date(expiry.getTime() + 20 * 24 * HOUR));
    const toConvert = await w.addHold(new Date(expiry.getTime() + 20 * 24 * HOUR));
    at(new Date(expiry.getTime() + 20 * 24 * HOUR - 47 * HOUR));
    await runReminders();
    await release(toRelease.id, w.staff).expect(201);
    await convert(toConvert.id, w.staff).expect(201);
    at(new Date(expiry.getTime() + 60_000));
    await runExpiry();

    const notices = await feed(w.coordinator);
    const mine = (await request(baseUrl).get('/api/venues/bookings/mine').set('Cookie', w.coordinator.cookie).expect(200)).body as MineItem[];
    const typeOf = (id: string) => notices.filter((n) => n.relatedBookingId === id).map((n) => n.type).sort();
    const byId = (id: string) => mine.find((b) => b.id === id)!;

    expect(typeOf(reminded.id)).toEqual([REMINDER]);
    expect(typeOf(elapsed.id)).toEqual([EXPIRED]);
    expect(typeOf(toRelease.id)).toEqual([RELEASED, REMINDER].sort());
    expect(typeOf(toConvert.id)).toEqual([CONVERTED, REMINDER].sort());
    expect(byId(reminded.id)).toMatchObject({ status: 'approved', requestKind: 'tentative_hold', holdExpired: false });
    expect(byId(reminded.id).holdExpiresAt).toBe(new Date(expiry.getTime() + 20 * 24 * HOUR).toISOString());
    expect(byId(elapsed.id)).toMatchObject({ status: 'expired', requestKind: 'tentative_hold', holdExpired: true, holdExpiresAt: expiry.toISOString() });
    expect(byId(toRelease.id)).toMatchObject({ status: 'released', requestKind: 'tentative_hold' });
    expect(byId(toRelease.id).holdExpiresAt).toBeTruthy();
    expect(byId(toConvert.id)).toMatchObject({ status: 'approved', requestKind: 'booking' });
    expect(byId(toConvert.id).holdExpiresAt).toBeUndefined();
  });

  // ---- AC7 ---------------------------------------------------------------------------------------------------------

  /**
   * HOLD-EXP-NOTIF-07-A (SPM-134 AC7): a new hold notice is unread; once the Coordinator marks it read it stays read after
   * signing out and back in (a fresh session).
   * Kills: a notice created read, a read flag held in the session, mark-read not persisted.
   */
  it('HOLD-EXP-NOTIF-07-A starts unread and stays read after signing out and back in', async () => {
    at(baseNow);
    const w = await world();
    const due = await w.addHold(new Date(baseNow.getTime() + 20 * HOUR));
    await runReminders();
    const [unread] = await noticesFor(w.coordinator, due.id);
    expect(unread.read).toBe(false);

    await request(baseUrl).post(`/api/notifications/${unread.id}/read`).set('Cookie', w.coordinator.cookie).expect(201);
    const newCookie = await login(w.coordinator.email);

    const [afterLogin] = (await feed(w.coordinator, newCookie)).filter((n) => n.relatedBookingId === due.id);
    expect(afterLogin.read).toBe(true);
  });

  // ---- AC8 ---------------------------------------------------------------------------------------------------------

  /**
   * HOLD-EXP-NOTIF-08-A (SPM-134 AC8): an event with several tentative holds gets separate notifications for each: two
   * reminders, then one released and one expired, each linked to its own hold.
   * Kills: one notice per event, a notice reused for several holds, a missing hold.
   */
  it('HOLD-EXP-NOTIF-08-A gives an event with several holds separate notifications for each hold', async () => {
    const w = await world();
    const expiry = new Date('2030-11-10T12:00:00.000Z');
    const first = await w.addHold(expiry);
    const second = await w.addHold(expiry);
    at(new Date(expiry.getTime() - 40 * HOUR));
    await runReminders();
    await release(first.id, w.staff).expect(201);
    at(new Date(expiry.getTime() + 1000));
    await runExpiry();

    const notices = (await feed(w.coordinator)).filter((n) => n.relatedEventId === w.eventId);
    const byHold = (id: string) => notices.filter((n) => n.relatedBookingId === id).map((n) => n.type).sort();
    expect(notices).toHaveLength(4);
    expect(new Set(notices.map((n) => n.id)).size).toBe(4);
    expect(byHold(first.id)).toEqual([RELEASED, REMINDER].sort());
    expect(byHold(second.id)).toEqual([EXPIRED, REMINDER].sort());
  });

  // ---- AC9 ---------------------------------------------------------------------------------------------------------

  async function reassign(eventId: string, from: TestUser, to: TestUser) {
    const lead = await createUser('COORDINATOR_LEAD', 'SPM-134 Lead');
    await request(baseUrl)
      .post(`/api/lead/events/${eventId}/reassign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: to.id, currentCoordinatorId: from.id })
      .expect(201);
  }

  /**
   * HOLD-EXP-NOTIF-09-B (SPM-134 AC9): the event is reassigned before the reminder is sent; the new Coordinator receives
   * it and the previous one receives none.
   * Kills: addressing the notice to the Coordinator the hold was approved under, or remembering the first assignee.
   */
  it('HOLD-EXP-NOTIF-09-B sends the reminder to the Coordinator assigned when it is sent, not the previous one', async () => {
    at(baseNow);
    const w = await world();
    const b = await createUser('COORDINATOR', 'SPM-134 New Coordinator');
    const due = await w.addHold(new Date(baseNow.getTime() + 30 * HOUR));
    await reassign(w.eventId, w.coordinator, b);

    await runReminders();

    expect(await noticesFor(b, due.id)).toMatchObject([{ type: REMINDER }]);
    expect(await noticesFor(w.coordinator, due.id)).toEqual([]);
    expect((await storedFor(due.id)).map((row) => row.recipient_id)).toEqual([b.id]);
  });

  /**
   * HOLD-EXP-NOTIF-09-D (SPM-134 AC9, SC-SPM134-02, confirmed by the story owner chaw678 on 4 Nov 2026): when the event is reassigned after the reminder, the previous
   * Coordinator's unread hold notice for it is marked read (its link would open a hold that is no longer theirs), the
   * new Coordinator gets nothing for the earlier reminder, and the later expired notice goes to the new Coordinator only.
   * Kills: leaving the old notice unread, re-sending the old reminder to the new Coordinator, notifying the old one later.
   */
  it("HOLD-EXP-NOTIF-09-D a reassignment clears the previous Coordinator's unread hold notice and later notices go to the new one", async () => {
    const w = await world();
    const b = await createUser('COORDINATOR', 'SPM-134 New Coordinator');
    const expiry = new Date('2031-01-10T12:00:00.000Z');
    const target = await w.addHold(expiry);
    at(new Date(expiry.getTime() - 47 * HOUR));
    await runReminders();
    expect((await noticesFor(w.coordinator, target.id))[0].read).toBe(false);

    await reassign(w.eventId, w.coordinator, b);
    at(new Date(expiry.getTime() + 1000));
    await runExpiry();

    expect(await noticesFor(w.coordinator, target.id)).toMatchObject([{ type: REMINDER, read: true }]);
    expect(await noticesFor(b, target.id)).toMatchObject([{ type: EXPIRED, read: false }]);
  });

  /**
   * HOLD-EXP-NOTIF-09-E (SPM-134 AC9, SC-SPM134-05, decided by the story owner chaw678 on 4 Nov 2026): if the event has no
   * Coordinator when the reminder is due, the reminder is consumed and nobody is notified; it is not re-sent when a
   * Coordinator is assigned later.
   * Kills: leaving the reminder marker unset when there is no recipient, so the reminder arrives late for a later assignee.
   */
  it('HOLD-EXP-NOTIF-09-E a reminder that finds no Coordinator is consumed and not re-sent when one is assigned later', async () => {
    at(baseNow);
    const staff = await createUser('VENUE_STAFF');
    const later = await createUser('COORDINATOR');
    const eventId = await createEvent(null, 'SPM-134 No Coordinator event');
    const venue = await createVenue(staff.id);
    const row = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
       VALUES ($1, $2, '2030-09-01T06:00:00.000Z', '2030-09-01T07:00:00.000Z', 'approved', 'tentative_hold', $3) RETURNING id`,
      [venue.id, eventId, new Date(baseNow.getTime() + 30 * HOUR)],
    );
    const holdId = row.rows[0].id;

    expect(await runReminders()).toContain(holdId);
    expect(await storedFor(holdId)).toEqual([]);
    expect((await hold(holdId)).hold_reminder_sent_at).toEqual(baseNow);

    await pool.query('UPDATE events SET coordinator_id = $1 WHERE id = $2', [later.id, eventId]);
    expect(await runReminders()).not.toContain(holdId);

    expect(await storedFor(holdId)).toEqual([]);
    expect((await feed(later)).filter((n) => n.relatedBookingId === holdId)).toEqual([]);
  });

  // ---- AC10 --------------------------------------------------------------------------------------------------------

  /**
   * HOLD-EXP-NOTIF-10-B (SPM-134 AC10): for a cancelled event no reminder or expired notice is sent and no reminder marker
   * is set, and a release or conversion by Venue Staff sends no notice either.
   * Kills: ignoring the event's status in the reminder, expiry or lifecycle paths.
   */
  it('HOLD-EXP-NOTIF-10-B sends no hold notification for a cancelled event', async () => {
    at(baseNow);
    const w = await world();
    const due = await w.addHold(new Date(baseNow.getTime() + 30 * HOUR));
    const elapsed = await w.addHold(new Date(baseNow.getTime() - HOUR));
    const toRelease = await w.addHold(new Date(baseNow.getTime() + 10 * 24 * HOUR));
    const toConvert = await w.addHold(new Date(baseNow.getTime() + 10 * 24 * HOUR));
    await pool.query("UPDATE events SET status = 'Cancelled' WHERE id = $1", [w.eventId]);

    expect(await runReminders()).not.toContain(due.id);
    await runExpiry();
    await release(toRelease.id, w.staff).expect(201);
    await convert(toConvert.id, w.staff).expect(201);

    for (const id of [due.id, elapsed.id, toRelease.id, toConvert.id]) expect(await storedFor(id)).toEqual([]);
    expect((await hold(due.id)).hold_reminder_sent_at).toBeNull();
  });

  /**
   * HOLD-EXP-NOTIF-10-C (SPM-134 AC10): cancelling an event releases its holds (SPM-136) without a "released" notice.
   * Kills: sending the Venue Staff release notice from the cancellation path.
   */
  it('HOLD-EXP-NOTIF-10-C releasing the holds of a cancelled event sends no released notice', async () => {
    at(baseNow);
    const w = await world();
    const active = await w.addHold(new Date(baseNow.getTime() + 10 * 24 * HOUR));
    await pool.query("UPDATE events SET status = 'Cancelled' WHERE id = $1", [w.eventId]);
    const client = await pool.connect();
    try {
      await venueBookingReleaser.release(w.eventId, client as never, baseNow);
    } finally {
      client.release();
    }

    expect((await hold(active.id)).status).toBe('released');
    expect(await storedFor(active.id)).toEqual([]);
    expect((await feed(w.coordinator)).filter((n) => n.relatedBookingId === active.id)).toEqual([]);
  });
  // ---- AC11 --------------------------------------------------------------------------------------------------------

  /** The stored reminder rows of a hold (never deleted, only marked read). */
  const remindersOf = async (holdId: string) => (await storedFor(holdId)).filter((row) => row.type === REMINDER);

  /**
   * HOLD-EXP-NOTIF-11-E (SPM-134 AC11): when Venue Staff convert a reminded hold, the Coordinator's unread reminder for it
   * is marked read, stays in the history (feed and table) and the converted notice is still unread.
   * Kills: no mark-read on conversion, deleting the reminder, marking the converted notice read.
   */
  it('HOLD-EXP-NOTIF-11-E converting a reminded hold marks its reminder read and keeps it', async () => {
    at(baseNow);
    const w = await world();
    const target = await w.addHold(new Date(baseNow.getTime() + 30 * HOUR));
    await runReminders();
    expect((await remindersOf(target.id))[0].read).toBe(false);

    await convert(target.id, w.staff).expect(201);

    expect(await remindersOf(target.id)).toMatchObject([{ read: true }]);
    const notices = await noticesFor(w.coordinator, target.id);
    expect(notices.map((n) => [n.type, n.read]).sort()).toEqual([[CONVERTED, false], [REMINDER, true]].sort());
  });

  /**
   * HOLD-EXP-NOTIF-11-F (SPM-134 AC11): when Venue Staff release a reminded hold, the unread reminder is marked read,
   * kept, and the released notice is unread.
   * Kills: no mark-read on release, deleting the reminder.
   */
  it('HOLD-EXP-NOTIF-11-F releasing a reminded hold marks its reminder read and keeps it', async () => {
    at(baseNow);
    const w = await world();
    const target = await w.addHold(new Date(baseNow.getTime() + 30 * HOUR));
    await runReminders();

    await release(target.id, w.staff).expect(201);

    expect(await remindersOf(target.id)).toMatchObject([{ read: true }]);
    const notices = await noticesFor(w.coordinator, target.id);
    expect(notices.map((n) => [n.type, n.read]).sort()).toEqual([[RELEASED, false], [REMINDER, true]].sort());
  });

  /**
   * HOLD-EXP-NOTIF-11-G (SPM-134 AC11, isolation): only the reminder of the released hold changes. An already read reminder
   * stays read (and is not duplicated), another notice type of the same hold (an SPM-165 approval notice) stays unread, and
   * the reminder of another hold of the same event stays unread.
   * Kills: a mark-read filter missing the notice type (SPM134-BE-17) or the booking (SPM134-BE-18). The unread condition
   * (SPM134-BE-19) is behaviourally unobservable at DB level (setting an already read row to read changes nothing); it is
   * killed only by the unit SQL assertions in HOLD-EXP-NOTIF-11-A and 11-B, not by this case.
   */
  it('HOLD-EXP-NOTIF-11-G leaves other notice types, other holds and an already read reminder untouched', async () => {
    at(baseNow);
    const w = await world();
    const target = await w.addHold(new Date(baseNow.getTime() + 30 * HOUR));
    const other = await w.addHold(new Date(baseNow.getTime() + 31 * HOUR));
    await runReminders();
    await pool.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_booking_id)
       VALUES ($1, $2, 'tentative_hold_approved', 'SPM-134 isolation notice', $3, $4)`,
      [randomUUID(), w.coordinator.id, w.eventId, target.id],
    );
    const [mine] = await noticesFor(w.coordinator, target.id).then((rows) => rows.filter((n) => n.type === REMINDER));
    await request(baseUrl).post(`/api/notifications/${mine.id}/read`).set('Cookie', w.coordinator.cookie).expect(201);

    await release(target.id, w.staff).expect(201);

    const targetRows = (await storedFor(target.id)).map((row) => [row.type, row.read]).sort();
    expect(targetRows).toEqual([[REMINDER, true], [RELEASED, false], ['tentative_hold_approved', false]].sort());
    expect(await remindersOf(other.id)).toMatchObject([{ read: false }]);
  });

  /**
   * HOLD-EXP-NOTIF-11-H (SPM-134 AC11): a refused release or conversion (foreign Venue Staff 404, hold already expired by
   * time 409, hold already released 409) marks the reminder read in none of the cases.
   * Kills: marking read before the checks.
   */
  it('HOLD-EXP-NOTIF-11-H a refused release or conversion leaves the reminder unread', async () => {
    const w = await world();
    const foreign = await createUser('VENUE_STAFF');
    const expiry = new Date('2031-03-10T12:00:00.000Z');
    const stale = await w.addHold(expiry);
    const done = await w.addHold(new Date(expiry.getTime() + HOUR));
    at(new Date(expiry.getTime() - 47 * HOUR));
    await runReminders();
    await release(done.id, w.staff).expect(201);
    await pool.query("UPDATE notifications SET read = false WHERE related_booking_id = $1 AND type = $2", [done.id, REMINDER]);

    await release(stale.id, foreign).expect(404);
    await convert(stale.id, foreign).expect(404);
    at(new Date(expiry.getTime() + 60_000));
    await release(stale.id, w.staff).expect(409);
    await convert(stale.id, w.staff).expect(409);
    await release(done.id, w.staff).expect(409);
    await convert(done.id, w.staff).expect(409);

    expect(await remindersOf(stale.id)).toMatchObject([{ read: false }]);
    expect(await remindersOf(done.id)).toMatchObject([{ read: false }]);
  });
});
