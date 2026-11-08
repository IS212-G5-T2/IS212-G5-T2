/*
 * SPM-165 integration coverage (tentative hold decision notification, Coordinator) through the real Nest HTTP pipeline,
 * session middleware and PostgreSQL: Venue Staff approve or reject a tentative hold request and the event's Coordinator
 * receives one notification in the bell feed. Every user signs in through the real login route.
 * Test cases: VENUE-HOLD-NOTIF-01-C, 01-D, 01-H, 01-SEC-1, 02-D, 02-E, 03-H, 03-J, 04-A, 04-C, 05-B, 06-B, 06-C, 07-E, 07-F.
 * Needs DATABASE_URL with database/postgresql/init 001 to 024 (the venue migrations and 029 are applied here).
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

const databaseUrl = process.env.DATABASE_URL;
// The injected clock: every decision in this suite is made at this instant.
const fixedNow = new Date('2030-01-10T12:00:00.000Z');
if (!databaseUrl && process.env.CI)
  throw new Error('SPM-165 tentative hold notification PostgreSQL tests must run in CI: set DATABASE_URL.');

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

describe.skipIf(!databaseUrl)('SPM-165 tentative hold decision notifications HTTP and PostgreSQL', () => {
  let app: INestApplication;
  // The app listens once on a fixed loopback port. supertest otherwise opens a fresh wildcard-bound ephemeral port
  // per request and talks to 127.0.0.1, where another process on this machine (a second test run, a dev server)
  // can hold the same port on a more specific address and answer the request itself (a stray 404 or 401).
  let baseUrl: string;
  let pool: pg.Pool;
  const venueIds: string[] = [];
  const eventIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
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
    ])
      await pool.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    // venue_bookings.special_request comes from init/001_schema.sql; migration 022's backfill is not replayed, as in the other venue suites.

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => fixedNow })
      .compile();
    app = module.createNestApplication({ logger: ['warn', 'log'] });
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
    if (!pool) return;
    // Deleting the venues removes their bookings (and those bookings' notifications); the events remove the rest.
    if (venueIds.length) await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [venueIds]);
    if (eventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [eventIds]);
    if (userIds.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
    await pool.end();
  });

  // ---- fixtures ----------------------------------------------------------------------------------------------------

  /** Signs in through the real login route and returns the session cookie. */
  async function login(email: string, password = 'password123') {
    const response = await request(baseUrl).post('/api/auth/login').send({ email, password }).expect(201);
    const cookie = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) =>
      value.startsWith('connectsphere_session='),
    );
    if (!cookie) throw new Error('Expected an authenticated test session cookie');
    return cookie.split(';', 1)[0];
  }

  async function createUser(role: 'COORDINATOR' | 'VENUE_STAFF' | 'ORGANISER' | 'COORDINATOR_LEAD', name = 'SPM-165 User'): Promise<TestUser> {
    const email = `spm165-${randomUUID()}@example.test`;
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

  async function createVenue(ownerId: string, name = `SPM-165 Hall ${randomUUID()}`) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO venues (id, owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, $3, 'SPM-165 Test Location', 100, 'Integration fixture', 0, 0)`,
      [id, ownerId, name],
    );
    venueIds.push(id);
    return { id, name };
  }

  async function createEvent(coordinatorId: string, name: string, organiserId = 'spm165-organiser', start = '2030-01-12T06:00:00.000Z', end = '2030-01-12T07:00:00.000Z') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, start_date_time, end_date_time,
         expected_attendance, coordinator_id, coordinator_name, submission_key, status)
       VALUES ($1, $5, 'SPM-165 Organiser', 'spm165@example.test', $2, 'Venue booking notification', $3, $4, 10, $6, 'SPM-165 Coordinator', $1, 'Planning')`,
      [id, name, new Date(start), new Date(end), organiserId, coordinatorId],
    );
    eventIds.push(id);
    return id;
  }

  /** A pending request at the venue with its request row, as the approval re-check expects. */
  async function addPending(venueId: string, eventId: string, start = '2030-01-12T06:00:00.000Z', end = '2030-01-12T07:00:00.000Z', kind: 'booking' | 'tentative_hold' = 'booking') {
    const row = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind)
       VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING id`,
      [venueId, eventId, new Date(start), new Date(end), kind],
    );
    await pool.query('INSERT INTO venue_booking_requests (event_id, venue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, venueId]);
    return row.rows[0].id;
  }

  // Holds need an event more than 336 hours after the (fixed) decision time to be approvable (SPM-159).
  const HOLD_START = '2030-03-01T06:00:00.000Z';
  const HOLD_END = '2030-03-01T07:00:00.000Z';

  /** One Venue Staff owner, one Coordinator, a venue, an assigned event and one pending tentative hold request. */
  async function world(eventName = 'SPM-165 Gala') {
    const staff = await createUser('VENUE_STAFF', 'SPM-165 Staff');
    const coordinator = await createUser('COORDINATOR', 'SPM-165 Coordinator');
    const venue = await createVenue(staff.id);
    const eventId = await createEvent(coordinator.id, eventName, 'spm165-organiser', HOLD_START, HOLD_END);
    const holdId = await addPending(venue.id, eventId, HOLD_START, HOLD_END, 'tentative_hold');
    return { staff, coordinator, venue, eventId, holdId, eventName };
  }

  const approve = (bookingId: string, user: TestUser) =>
    request(baseUrl).post(`/api/venues/bookings/${bookingId}/approve`).set('Cookie', user.cookie);
  const reject = (bookingId: string, user: TestUser, reason = 'Clashes with maintenance') =>
    request(baseUrl).post(`/api/venues/bookings/${bookingId}/reject`).set('Cookie', user.cookie).send({ reason });
  const feed = async (user: TestUser, cookie = user.cookie) =>
    (await request(baseUrl).get('/api/notifications').set('Cookie', cookie).expect(200)).body as FeedItem[];
  /** The booking decision notices the user's feed holds for one booking. */
  const noticesFor = async (user: TestUser, bookingId: string) => (await feed(user)).filter((n) => n.relatedBookingId === bookingId);
  /** Every stored notification for a booking, whoever it is addressed to. */
  const storedFor = async (bookingId: string) =>
    (await pool.query<{ recipient_id: string; type: string; message: string; read: boolean; created_at: Date }>(
      'SELECT recipient_id, type, message, read, created_at FROM notifications WHERE related_booking_id = $1',
      [bookingId],
    )).rows;

  // ---- AC1 ---------------------------------------------------------------------------------------------------------

  // Traceability: Jira 165 AC1 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-01-C (SPM-165 AC1): Venue Staff approve a tentative hold; the assigned Coordinator's feed holds
   * exactly one tentative_hold_approved notice for it, and no other Coordinator receives anything.
   * Kills: no notification, a second notification, the booking decision type, another Coordinator receiving it.
   */
  it('VENUE-HOLD-NOTIF-01-C a hold approval gives the assigned Coordinator one notification and no other Coordinator any', async () => {
    const w = await world();
    const other = await createUser('COORDINATOR', 'SPM-165 Other Coordinator');

    await approve(w.holdId, w.staff).expect(201);

    expect(await noticesFor(w.coordinator, w.holdId)).toMatchObject([{ type: 'tentative_hold_approved', relatedEventId: w.eventId, relatedBookingId: w.holdId }]);
    expect(await noticesFor(other, w.holdId)).toEqual([]);
    const stored = await storedFor(w.holdId);
    expect(stored.map((row) => [row.recipient_id, row.type])).toEqual([[w.coordinator.id, 'tentative_hold_approved']]);
  });

  // Traceability: Jira 165 AC1 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-01-D (SPM-165 AC1): a hold rejection gives the assigned Coordinator one tentative_hold_rejected notice.
   * Kills: no notification on the rejection path, the approved or booking decision type.
   */
  it('VENUE-HOLD-NOTIF-01-D a hold rejection gives the assigned Coordinator one rejected notification', async () => {
    const w = await world();

    await reject(w.holdId, w.staff).expect(201);

    expect(await noticesFor(w.coordinator, w.holdId)).toMatchObject([{ type: 'tentative_hold_rejected', relatedEventId: w.eventId }]);
    expect(await storedFor(w.holdId)).toHaveLength(1);
  });

  // Traceability: Jira 165 AC1 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-01-H (SPM-165 AC1, out of scope SPM-137): an ordinary venue booking decision on the same event still
   * writes only the booking decision type, and a hold decision never writes one.
   * Kills: choosing the notice type by something other than the request kind.
   */
  it('VENUE-HOLD-NOTIF-01-H a booking request and a hold request of one event get their own notification types', async () => {
    const w = await world();
    const otherVenue = await createVenue(w.staff.id);
    const bookingId = await addPending(otherVenue.id, w.eventId, HOLD_START, HOLD_END, 'booking');

    await approve(w.holdId, w.staff).expect(201);
    await approve(bookingId, w.staff).expect(201);

    expect((await storedFor(w.holdId)).map((row) => row.type)).toEqual(['tentative_hold_approved']);
    expect((await storedFor(bookingId)).map((row) => row.type)).toEqual(['venue_booking_approved']);
  });

  // Traceability: Jira 165 AC1 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-01-SEC-1 (SPM-165 AC1, security): the event's Organiser does not receive the notification and
   * cannot mark it read.
   * Kills: adding the hold types to the Organiser's allow-list, or addressing the notice to the Organiser.
   */
  it('VENUE-HOLD-NOTIF-01-SEC-1 the Organiser of the event receives nothing and cannot mark the notice read', async () => {
    const staff = await createUser('VENUE_STAFF');
    const coordinator = await createUser('COORDINATOR');
    const organiser = await createUser('ORGANISER');
    const venue = await createVenue(staff.id);
    const eventId = await createEvent(coordinator.id, 'SPM-165 Organiser event', organiser.id, HOLD_START, HOLD_END);
    const holdId = await addPending(venue.id, eventId, HOLD_START, HOLD_END, 'tentative_hold');

    await approve(holdId, staff).expect(201);

    expect((await feed(organiser)).filter((n) => n.relatedBookingId === holdId)).toEqual([]);
    const notice = (await noticesFor(coordinator, holdId))[0];
    await request(baseUrl).post(`/api/notifications/${notice.id}/read`).set('Cookie', organiser.cookie).expect(404);
    expect((await storedFor(holdId))[0].read).toBe(false);
  });

  // ---- AC2 ---------------------------------------------------------------------------------------------------------

  // Traceability: Jira 165 AC2 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-02-D (SPM-165 AC2): through the real API the approved message is exactly `Your tentative hold of
   * <venue name> for "<event name>" has been approved.`, stamped with the decision time (the injected clock).
   * Kills: other wording, the booking wording, the database default time instead of the decision time.
   */
  it('VENUE-HOLD-NOTIF-02-D the delivered approval text names the venue and the event and is stamped with the decision time', async () => {
    const w = await world('SPM-165 "Quoted" Gala');

    await approve(w.holdId, w.staff).expect(201);

    const [notice] = await noticesFor(w.coordinator, w.holdId);
    expect(notice.message).toBe(`Your tentative hold of ${w.venue.name} for "SPM-165 "Quoted" Gala" has been approved.`);
    expect(new Date(notice.createdAt).toISOString()).toBe(fixedNow.toISOString());
  });

  // Traceability: Jira 165 AC2 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-02-E (SPM-165 AC2): the rejected message is exactly `... has been rejected.`; the rejection reason is not in it.
   * Kills: the reason appended to the text, the approved wording on a rejection.
   */
  it('VENUE-HOLD-NOTIF-02-E the delivered rejection text has no reason or reference', async () => {
    const w = await world();

    await reject(w.holdId, w.staff, 'Clashes with maintenance').expect(201);

    const [notice] = await noticesFor(w.coordinator, w.holdId);
    expect(notice.message).toBe(`Your tentative hold of ${w.venue.name} for "${w.eventName}" has been rejected.`);
    expect(notice.message).not.toMatch(/maintenance|VB-/);
  });

  // ---- AC3 ---------------------------------------------------------------------------------------------------------

  // Traceability: Jira 165 AC3 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-03-H (SPM-165 AC3): each notice carries the id of its hold, and that hold is in the Coordinator's
   * own bookings list as a tentative hold with its decided status, the hold expiry when approved and the rejection
   * reason when rejected, so the link target can be shown.
   * Kills: a missing or wrong relatedBookingId, a hold missing from the list, no expiry on an approved hold.
   */
  it('VENUE-HOLD-NOTIF-03-H the notice links to a hold the Coordinator can open, with its status, expiry and rejection reason', async () => {
    const w = await world();
    const rejectedHold = await addPending(w.venue.id, w.eventId, '2030-03-02T06:00:00.000Z', '2030-03-02T07:00:00.000Z', 'tentative_hold');
    await approve(w.holdId, w.staff).expect(201);
    await reject(rejectedHold, w.staff, 'Clashes with maintenance').expect(201);

    const notices = await feed(w.coordinator);
    const mine = (await request(baseUrl).get('/api/venues/bookings/mine').set('Cookie', w.coordinator.cookie).expect(200)).body as Array<{
      id: string;
      status: string;
      requestKind: string;
      holdExpiresAt?: string;
      rejectionReason?: string;
    }>;

    expect(Object.fromEntries(notices.map((n) => [n.relatedBookingId, n.type]))).toEqual({
      [w.holdId]: 'tentative_hold_approved',
      [rejectedHold]: 'tentative_hold_rejected',
    });
    const approved = mine.find((b) => b.id === w.holdId)!;
    expect(approved).toMatchObject({ status: 'approved', requestKind: 'tentative_hold' });
    expect(approved.holdExpiresAt).toBeTruthy();
    expect(mine.find((b) => b.id === rejectedHold)).toMatchObject({ status: 'rejected', requestKind: 'tentative_hold', rejectionReason: 'Clashes with maintenance' });
  });

  // Traceability: Jira 165 AC3 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-03-J (SPM-165 AC3 with SPM-132): after the hold decision, converting, releasing or expiring a hold
   * (SPM-132) writes no further SPM-165 decision notice (SPM-134 adds its own lifecycle notice); the original notice's booking still opens from the Coordinator's list with
   * the current status and type (converted: a booking with no hold expiry; released; expired with holdExpired true).
   * Kills: a hold lifecycle action writing an SPM-165 notice, a converted hold still reported as a hold, an expired hold
   * not reported as expired, the notice's booking dropping out of the Coordinator's list.
   */
  it('VENUE-HOLD-NOTIF-03-J convert, release and expiry of an approved hold write no further decision notice and keep the link openable', async () => {
    const w = await world();
    const releasable = await addPending(w.venue.id, w.eventId, '2030-03-02T06:00:00.000Z', '2030-03-02T07:00:00.000Z', 'tentative_hold');
    const expiring = await addPending(w.venue.id, w.eventId, '2030-03-03T06:00:00.000Z', '2030-03-03T07:00:00.000Z', 'tentative_hold');
    for (const id of [w.holdId, releasable, expiring]) await approve(id, w.staff).expect(201);
    expect((await feed(w.coordinator)).length).toBe(3);

    await request(baseUrl).post(`/api/venues/bookings/${w.holdId}/convert-hold`).set('Cookie', w.staff.cookie).expect(201);
    await request(baseUrl).post(`/api/venues/bookings/${releasable}/release-hold`).set('Cookie', w.staff.cookie).expect(201);
    // The scheduler's own method, one instant after the 14-day hold lapses.
    const lapse = new Date(fixedNow.getTime() + 15 * 24 * 60 * 60 * 1000);
    expect(await app.get(VenuesRepository).processExpiredTentativeHolds(lapse)).toContain(expiring);

    // Changed 4 Nov 2026 (SPM-134): convert, release and expiry now each add their own lifecycle notice. The SPM-165
    // decision notice stays exactly one per hold; the extra row is the SPM-134 notice, typed by what happened.
    const notices = await feed(w.coordinator);
    expect(notices.filter((n) => n.type === 'tentative_hold_approved')).toHaveLength(3);
    expect((await storedFor(w.holdId)).map((row) => row.type).sort()).toEqual(['tentative_hold_approved', 'tentative_hold_converted']);
    expect((await storedFor(releasable)).map((row) => row.type).sort()).toEqual(['tentative_hold_approved', 'tentative_hold_released']);
    expect((await storedFor(expiring)).map((row) => row.type).sort()).toEqual(['tentative_hold_approved', 'tentative_hold_expired']);

    const mine = (await request(baseUrl).get('/api/venues/bookings/mine').set('Cookie', w.coordinator.cookie).expect(200)).body as Array<{
      id: string; status: string; requestKind: string; holdExpiresAt?: string; holdExpired: boolean;
    }>;
    expect(mine.find((b) => b.id === w.holdId)).toMatchObject({ status: 'approved', requestKind: 'booking', holdExpired: false });
    expect(mine.find((b) => b.id === w.holdId)!.holdExpiresAt).toBeUndefined();
    expect(mine.find((b) => b.id === releasable)).toMatchObject({ status: 'released', requestKind: 'tentative_hold' });
    expect(mine.find((b) => b.id === expiring)).toMatchObject({ status: 'expired', requestKind: 'tentative_hold', holdExpired: true });
  });

  // ---- AC4 ---------------------------------------------------------------------------------------------------------

  // Traceability: Jira 165 AC4 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-04-A (SPM-165 AC4): a new notice is unread; once the Coordinator marks it read it stays read after
   * signing out and back in (a fresh session).
   * Kills: a notice created read, a read flag held in the session, mark-read not persisted.
   */
  it('VENUE-HOLD-NOTIF-04-A starts unread and stays read after signing out and back in', async () => {
    const w = await world();
    await approve(w.holdId, w.staff).expect(201);
    const [unread] = await noticesFor(w.coordinator, w.holdId);
    expect(unread.read).toBe(false);

    await request(baseUrl).post(`/api/notifications/${unread.id}/read`).set('Cookie', w.coordinator.cookie).expect(201);
    const newCookie = await login(w.coordinator.email);

    const [afterLogin] = (await feed(w.coordinator, newCookie)).filter((n) => n.relatedBookingId === w.holdId);
    expect(afterLogin.read).toBe(true);
    expect((await storedFor(w.holdId))[0].read).toBe(true);
  });

  // Traceability: Jira 165 AC4 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-04-C (SPM-165 AC4, isolation): another Coordinator cannot mark this Coordinator's hold notice read.
   * Kills: the read call not being scoped to the recipient.
   */
  it('VENUE-HOLD-NOTIF-04-C another Coordinator cannot mark the hold notice read', async () => {
    const w = await world();
    const other = await createUser('COORDINATOR');
    await reject(w.holdId, w.staff).expect(201);
    const [notice] = await noticesFor(w.coordinator, w.holdId);

    await request(baseUrl).post(`/api/notifications/${notice.id}/read`).set('Cookie', other.cookie).expect(404);

    expect((await storedFor(w.holdId))[0].read).toBe(false);
  });

  // ---- AC5 ---------------------------------------------------------------------------------------------------------

  // Traceability: Jira 165 AC5 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-05-B (SPM-165 AC5): an event with three tentative hold requests gets three notifications, one per
   * decision, each linked to its own hold.
   * Kills: one notice per event, a notice reused for several holds, a missing decision.
   */
  it('VENUE-HOLD-NOTIF-05-B gives an event with several holds one notification for each decision', async () => {
    const staff = await createUser('VENUE_STAFF');
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'SPM-165 Multi-hold event', 'spm165-organiser', HOLD_START, HOLD_END);
    const holds = [] as string[];
    for (let i = 0; i < 3; i += 1) holds.push(await addPending((await createVenue(staff.id)).id, eventId, HOLD_START, HOLD_END, 'tentative_hold'));

    await approve(holds[0], staff).expect(201);
    await reject(holds[1], staff).expect(201);
    await approve(holds[2], staff).expect(201);

    const notices = (await feed(coordinator)).filter((n) => n.relatedEventId === eventId);
    expect(notices).toHaveLength(3);
    expect(Object.fromEntries(notices.map((n) => [n.relatedBookingId, n.type]))).toEqual({
      [holds[0]]: 'tentative_hold_approved',
      [holds[1]]: 'tentative_hold_rejected',
      [holds[2]]: 'tentative_hold_approved',
    });
    expect(new Set(notices.map((n) => n.id)).size).toBe(3);
  });

  // ---- AC6 ---------------------------------------------------------------------------------------------------------

  /** Reassigns the event through the Lead's real API route. */
  async function reassign(eventId: string, from: TestUser, to: TestUser) {
    const lead = await createUser('COORDINATOR_LEAD', 'SPM-165 Lead');
    await request(baseUrl)
      .post(`/api/lead/events/${eventId}/reassign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: to.id, currentCoordinatorId: from.id })
      .expect(201);
  }

  // Traceability: Jira 165 AC6 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-06-B (SPM-165 AC6): the event is reassigned before the decision; the new Coordinator receives the
   * notice and the previous one receives none.
   * Kills: addressing the notice to the Coordinator who submitted the hold or to the first assignee.
   */
  it('VENUE-HOLD-NOTIF-06-B sends the hold notification to the Coordinator assigned at decision time, not the previous one', async () => {
    const w = await world();
    const b = await createUser('COORDINATOR', 'SPM-165 New Coordinator');
    await reassign(w.eventId, w.coordinator, b);

    await approve(w.holdId, w.staff).expect(201);

    expect(await noticesFor(b, w.holdId)).toMatchObject([{ type: 'tentative_hold_approved' }]);
    expect(await noticesFor(w.coordinator, w.holdId)).toEqual([]);
    expect((await storedFor(w.holdId)).map((row) => row.recipient_id)).toEqual([b.id]);
  });

  // Traceability: Jira 165 AC6 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-06-C (SPM-165 AC6): when the event is reassigned after the decisions, the previous Coordinator's
   * unread hold notices for it are marked read; their notice for another event and another user's notice stay unread;
   * the new Coordinator gets nothing for the earlier decisions.
   * Kills: leaving the old notices unread, clearing every notice of the recipient, clearing another user's notice.
   */
  it("VENUE-HOLD-NOTIF-06-C marks the previous Coordinator's unread hold notices for the event read after a reassignment", async () => {
    const w = await world();
    const b = await createUser('COORDINATOR', 'SPM-165 New Coordinator');
    const bystander = await createUser('COORDINATOR', 'SPM-165 Bystander');
    const secondHold = await addPending(w.venue.id, w.eventId, '2030-03-02T06:00:00.000Z', '2030-03-02T07:00:00.000Z', 'tentative_hold');
    const otherEventId = await createEvent(w.coordinator.id, 'SPM-165 Other event', 'spm165-organiser', '2030-03-10T06:00:00.000Z', '2030-03-10T07:00:00.000Z');
    const otherHold = await addPending(w.venue.id, otherEventId, '2030-03-10T06:00:00.000Z', '2030-03-10T07:00:00.000Z', 'tentative_hold');
    await approve(w.holdId, w.staff).expect(201);
    await reject(secondHold, w.staff).expect(201);
    await approve(otherHold, w.staff).expect(201);
    await pool.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_booking_id)
       VALUES ($1, $2, 'tentative_hold_approved', 'SPM-165 bystander notice', $3, $4)`,
      [randomUUID(), bystander.id, w.eventId, w.holdId],
    );
    const isHold = (n: FeedItem) => n.type === 'tentative_hold_approved' || n.type === 'tentative_hold_rejected';
    expect((await feed(w.coordinator)).filter((n) => n.relatedEventId === w.eventId && !n.read)).toHaveLength(2);

    await reassign(w.eventId, w.coordinator, b);

    const onEvent = (await feed(w.coordinator)).filter((n) => n.relatedEventId === w.eventId && isHold(n));
    expect(onEvent.map((n) => n.type).sort()).toEqual(['tentative_hold_approved', 'tentative_hold_rejected']);
    expect(onEvent.every((n) => n.read)).toBe(true);
    expect(await noticesFor(w.coordinator, otherHold)).toMatchObject([{ type: 'tentative_hold_approved', read: false }]);
    expect(await noticesFor(bystander, w.holdId)).toMatchObject([{ type: 'tentative_hold_approved', read: false }]);
    expect(await noticesFor(b, w.holdId)).toEqual([]);
    expect(await noticesFor(b, secondHold)).toEqual([]);
  });

  // ---- AC7 ---------------------------------------------------------------------------------------------------------

  // Traceability: Jira 165 AC7 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-07-E (SPM-165 AC7): decisions that are refused never create a notification: a staff member who does
   * not own the venue (404), a Coordinator calling the route (403), a hold already decided (409), a hold approval that
   * conflicts with another booking (409), a blank rejection reason (400) and an unknown hold (404).
   * Kills: writing the notification before the checks, or on a refused path.
   */
  it('VENUE-HOLD-NOTIF-07-E creates no notification for a refused or conflicting hold decision', async () => {
    const w = await world();
    const foreignStaff = await createUser('VENUE_STAFF');
    const rival = await createEvent(w.coordinator.id, 'SPM-165 Rival event', 'spm165-organiser', '2030-04-01T06:00:00.000Z', '2030-04-01T07:00:00.000Z');
    const overlapping = await createEvent(w.coordinator.id, 'SPM-165 Overlapping event', 'spm165-organiser', '2030-04-01T06:30:00.000Z', '2030-04-01T07:30:00.000Z');
    const rivalHold = await addPending(w.venue.id, rival, '2030-04-01T06:00:00.000Z', '2030-04-01T07:00:00.000Z', 'tentative_hold');
    await approve(rivalHold, w.staff).expect(201);
    const conflicted = await addPending(w.venue.id, overlapping, '2030-04-01T06:30:00.000Z', '2030-04-01T07:30:00.000Z', 'tentative_hold');

    await approve(w.holdId, foreignStaff).expect(404);
    await reject(w.holdId, foreignStaff).expect(404);
    await approve(w.holdId, w.coordinator).expect(403);
    await reject(w.holdId, w.staff, '   ').expect(400);
    await approve(randomUUID(), w.staff).expect(404);
    await approve(conflicted, w.staff).expect(409);
    await approve(rivalHold, w.staff).expect(409);
    await reject(rivalHold, w.staff).expect(409);

    expect(await storedFor(w.holdId)).toEqual([]);
    expect(await storedFor(conflicted)).toEqual([]);
    expect(await storedFor(rivalHold)).toHaveLength(1);
    const statuses = await pool.query<{ status: string }>('SELECT status FROM venue_bookings WHERE id = ANY($1::uuid[])', [[w.holdId, conflicted]]);
    expect(statuses.rows.map((r) => r.status)).toEqual(['pending', 'pending']);
  });

  // Traceability: Jira 165 AC7 (matrix 40140804)
  /**
   * VENUE-HOLD-NOTIF-07-F (SPM-165 AC7, atomicity): if the notification cannot be saved (a trigger forces the insert to
   * fail for this hold only), the decision is not saved either: the request errors, the hold stays pending and no audit
   * row or notice exists; once the failure is gone the same hold can be decided.
   * Kills: writing the notification outside the decision's transaction, or swallowing its failure.
   */
  it('VENUE-HOLD-NOTIF-07-F does not save the hold decision when its notification cannot be saved', async () => {
    const w = await world();
    await pool.query(`CREATE OR REPLACE FUNCTION spm165_test_fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'spm165 forced notification failure'; END; $$`);
    await pool.query(
      `CREATE TRIGGER spm165_test_fail_notice BEFORE INSERT ON notifications FOR EACH ROW
         WHEN (NEW.related_booking_id = '${w.holdId}'::uuid) EXECUTE FUNCTION spm165_test_fail_notice()`,
    );
    try {
      const approved = await approve(w.holdId, w.staff);
      const rejected = await reject(w.holdId, w.staff);
      expect([approved.status, rejected.status]).toEqual([500, 500]);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS spm165_test_fail_notice ON notifications');
      await pool.query('DROP FUNCTION IF EXISTS spm165_test_fail_notice()');
    }

    expect((await pool.query<{ status: string }>('SELECT status FROM venue_bookings WHERE id = $1', [w.holdId])).rows[0].status).toBe('pending');
    expect((await pool.query('SELECT 1 FROM booking_review_log WHERE booking_id = $1', [w.holdId])).rowCount).toBe(0);
    expect(await storedFor(w.holdId)).toEqual([]);
    await approve(w.holdId, w.staff).expect(201);
    expect(await storedFor(w.holdId)).toHaveLength(1);
  });
});
