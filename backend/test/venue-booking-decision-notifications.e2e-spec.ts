/*
 * SPM-137 integration coverage (venue booking decision notification, Coordinator) through the real Nest HTTP pipeline,
 * session middleware and PostgreSQL: Venue Staff approve or reject a booking and the event's Coordinator receives one
 * notification in the bell feed. Every user signs in through the real login route.
 * Test cases: VENUE-BOOK-NOTIF-01-C, 01-D, 01-H, 01-SEC-1, 02-D, 02-E, 03-E, 03-F, 04-D, 04-E, 05-B, 06-B, 06-C, 07-F,
 * 07-G, 07-H.
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

const databaseUrl = process.env.DATABASE_URL;
// The injected clock: every decision in this suite is made at this instant.
const fixedNow = new Date('2030-01-10T12:00:00.000Z');
if (!databaseUrl && process.env.CI)
  throw new Error('SPM-137 venue booking notification PostgreSQL tests must run in CI: set DATABASE_URL.');

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

describe.skipIf(!databaseUrl)('SPM-137 venue booking decision notifications HTTP and PostgreSQL', () => {
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
    ])
      await pool.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    // Only the schema half of migration 022 (the init copy has no backfill), as in the other venue suites.
    await pool.query(
      await readFile(new URL('../../database/postgresql/init/022_spm55_booking_special_request.sql', import.meta.url), 'utf8'),
    );

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => fixedNow })
      .compile();
    app = module.createNestApplication();
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

  async function createUser(role: 'COORDINATOR' | 'VENUE_STAFF' | 'ORGANISER' | 'COORDINATOR_LEAD', name = 'SPM-137 User'): Promise<TestUser> {
    const email = `spm137-${randomUUID()}@example.test`;
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

  async function createVenue(ownerId: string, name = `SPM-137 Hall ${randomUUID()}`) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO venues (id, owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, $3, 'SPM-137 Test Location', 100, 'Integration fixture', 0, 0)`,
      [id, ownerId, name],
    );
    venueIds.push(id);
    return { id, name };
  }

  async function createEvent(coordinatorId: string, name: string, organiserId = 'spm137-organiser', start = '2030-01-12T06:00:00.000Z', end = '2030-01-12T07:00:00.000Z') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose, start_date_time, end_date_time,
         expected_attendance, coordinator_id, coordinator_name, submission_key, status)
       VALUES ($1, $5, 'SPM-137 Organiser', 'spm137@example.test', $2, 'Venue booking notification', $3, $4, 10, $6, 'SPM-137 Coordinator', $1, 'Planning')`,
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

  /** One Venue Staff owner, one Coordinator, a venue, an assigned event and one pending booking for it. */
  async function world(eventName = 'SPM-137 Gala') {
    const staff = await createUser('VENUE_STAFF', 'SPM-137 Staff');
    const coordinator = await createUser('COORDINATOR', 'SPM-137 Coordinator');
    const venue = await createVenue(staff.id);
    const eventId = await createEvent(coordinator.id, eventName);
    const bookingId = await addPending(venue.id, eventId);
    return { staff, coordinator, venue, eventId, bookingId, eventName };
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

  /**
   * VENUE-BOOK-NOTIF-01-C (SPM-137 AC1): Venue Staff approve a booking; the assigned Coordinator's feed holds exactly
   * one venue_booking_approved notice for it, another Coordinator's feed holds none, and only one row is stored.
   * Kills: no notice, a duplicate, broadcasting to every Coordinator, or addressing the staff member.
   */
  it('VENUE-BOOK-NOTIF-01-C an approval gives the assigned Coordinator one notification and no other Coordinator any', async () => {
    // Arrange: a pending booking and a second Coordinator with no connection to the event.
    const w = await world();
    const bystander = await createUser('COORDINATOR');

    // Act: the venue's staff approve it.
    await approve(w.bookingId, w.staff).expect(201);

    // Assert: one notice for the assigned Coordinator, none for the bystander, one stored row addressed to the assignee.
    expect(await noticesFor(w.coordinator, w.bookingId)).toMatchObject([{ type: 'venue_booking_approved', relatedEventId: w.eventId }]);
    expect(await noticesFor(bystander, w.bookingId)).toEqual([]);
    expect((await storedFor(w.bookingId)).map((row) => row.recipient_id)).toEqual([w.coordinator.id]);
  });

  /**
   * VENUE-BOOK-NOTIF-01-D (SPM-137 AC1): a rejection gives the assigned Coordinator one venue_booking_rejected notice.
   * Kills: the rejection path writing nothing or the approved type.
   */
  it('VENUE-BOOK-NOTIF-01-D a rejection gives the assigned Coordinator one rejected notification', async () => {
    const w = await world();
    const bystander = await createUser('COORDINATOR');

    await reject(w.bookingId, w.staff).expect(201);

    expect(await noticesFor(w.coordinator, w.bookingId)).toMatchObject([{ type: 'venue_booking_rejected', relatedEventId: w.eventId }]);
    expect(await noticesFor(bystander, w.bookingId)).toEqual([]);
    expect((await storedFor(w.bookingId)).map((row) => row.recipient_id)).toEqual([w.coordinator.id]);
  });

  /**
   * VENUE-BOOK-NOTIF-01-H (SPM-137 AC1, out of scope SPM-165): approving and rejecting tentative hold requests stores
   * no notification, while the decisions themselves are saved.
   * Kills: notifying for a hold request.
   */
  it('VENUE-BOOK-NOTIF-01-H a tentative hold decision creates no notification', async () => {
    // Arrange: two pending hold requests (far enough from the event start to be approvable).
    const staff = await createUser('VENUE_STAFF');
    const coordinator = await createUser('COORDINATOR');
    const venue = await createVenue(staff.id);
    const start = '2030-03-01T06:00:00.000Z';
    const end = '2030-03-01T07:00:00.000Z';
    const eventId = await createEvent(coordinator.id, 'SPM-137 Hold event', 'spm137-organiser', start, end);
    const toApprove = await addPending(venue.id, eventId, start, end, 'tentative_hold');
    const otherEvent = await createEvent(coordinator.id, 'SPM-137 Hold event 2', 'spm137-organiser', '2030-03-05T06:00:00.000Z', '2030-03-05T07:00:00.000Z');
    const toReject = await addPending(venue.id, otherEvent, '2030-03-05T06:00:00.000Z', '2030-03-05T07:00:00.000Z', 'tentative_hold');

    // Act: approve one, reject the other.
    await approve(toApprove, staff).expect(201);
    await reject(toReject, staff).expect(201);

    // Assert: both decisions saved, no notification stored or in the Coordinator's feed.
    const statuses = await pool.query<{ id: string; status: string }>('SELECT id, status FROM venue_bookings WHERE id = ANY($1::uuid[])', [[toApprove, toReject]]);
    expect(Object.fromEntries(statuses.rows.map((r) => [r.id, r.status]))).toEqual({ [toApprove]: 'approved', [toReject]: 'rejected' });
    expect(await storedFor(toApprove)).toEqual([]);
    expect(await storedFor(toReject)).toEqual([]);
    expect((await feed(coordinator)).filter((n) => n.type.startsWith('venue_booking_'))).toEqual([]);
  });

  /**
   * VENUE-BOOK-NOTIF-01-SEC-1 (SPM-137 AC1, security): the event's Organiser does not receive the notification and
   * cannot read or mark it read; the Venue Staff member who decided has no notification feed entry for it either.
   * Kills: adding the booking types to the Organiser's allow-list, or addressing the notice to the Organiser.
   */
  it('VENUE-BOOK-NOTIF-01-SEC-1 the Organiser of the event receives nothing and cannot mark the notice read', async () => {
    // Arrange: an event whose Organiser is a real signed-in account.
    const staff = await createUser('VENUE_STAFF');
    const coordinator = await createUser('COORDINATOR');
    const organiser = await createUser('ORGANISER');
    const venue = await createVenue(staff.id);
    const eventId = await createEvent(coordinator.id, 'SPM-137 Organiser event', organiser.id);
    const bookingId = await addPending(venue.id, eventId);

    // Act: approve.
    await approve(bookingId, staff).expect(201);

    // Assert: nothing in the Organiser's feed; their attempt to mark the Coordinator's notice read is a 404, and it stays unread.
    expect((await feed(organiser)).filter((n) => n.relatedBookingId === bookingId)).toEqual([]);
    const [stored] = await storedFor(bookingId);
    const notice = (await noticesFor(coordinator, bookingId))[0];
    await request(baseUrl).post(`/api/notifications/${notice.id}/read`).set('Cookie', organiser.cookie).expect(404);
    expect(stored.read).toBe(false);
    expect((await storedFor(bookingId))[0].read).toBe(false);
    // The staff member has no Coordinator or Organiser role, so the feed itself is refused.
    await request(baseUrl).get('/api/notifications').set('Cookie', staff.cookie).expect(403);
  });

  // ---- AC2 ---------------------------------------------------------------------------------------------------------

  /**
   * VENUE-BOOK-NOTIF-02-D (SPM-137 AC2): through the real API the approved message is exactly `Your booking of <venue
   * name> for "<event name>" has been approved.`, and its timestamp is the decision time (the injected clock).
   * Kills: other wording, the booking reference in the text, the database default time instead of the decision time.
   */
  it('VENUE-BOOK-NOTIF-02-D the delivered approval text names the venue and the event and is stamped with the decision time', async () => {
    const w = await world('Spring "Showcase"');

    await approve(w.bookingId, w.staff).expect(201);

    const [notice] = await noticesFor(w.coordinator, w.bookingId);
    expect(notice.message).toBe(`Your booking of ${w.venue.name} for "Spring "Showcase"" has been approved.`);
    expect(notice.createdAt).toBe(fixedNow.toISOString());
    expect(notice.message).not.toMatch(/VB-/);
  });

  /**
   * VENUE-BOOK-NOTIF-02-E (SPM-137 AC2): the rejected message is exactly `... has been rejected.` and the rejection
   * reason is not in it (the reason is on the booking the notice links to).
   * Kills: the reason or reference appended to the message.
   */
  it('VENUE-BOOK-NOTIF-02-E the delivered rejection text has no reason or reference', async () => {
    const w = await world();

    await reject(w.bookingId, w.staff, 'Double-booked with the faculty dinner').expect(201);

    const [notice] = await noticesFor(w.coordinator, w.bookingId);
    expect(notice.message).toBe(`Your booking of ${w.venue.name} for "${w.eventName}" has been rejected.`);
    expect(notice.message).not.toMatch(/faculty|VB-/);
    expect(notice.createdAt).toBe(fixedNow.toISOString());
  });

  // ---- AC3 ---------------------------------------------------------------------------------------------------------

  /**
   * VENUE-BOOK-NOTIF-03-E (SPM-137 AC3): the notice carries the id of its booking, and that booking is in the
   * Coordinator's own bookings list with its decided status and (for a rejection) the rejection reason, so the link
   * target can be shown.
   * Kills: a missing or wrong relatedBookingId, a booking missing from the Coordinator's list.
   */
  it('VENUE-BOOK-NOTIF-03-E the notice links to a booking the Coordinator can open, with its status and rejection reason', async () => {
    // Arrange: two bookings of one event, one approved and one rejected.
    const w = await world();
    const rejectedBooking = await addPending(w.venue.id, w.eventId, '2030-01-13T06:00:00.000Z', '2030-01-13T07:00:00.000Z');
    await approve(w.bookingId, w.staff).expect(201);
    await reject(rejectedBooking, w.staff, 'Clashes with maintenance').expect(201);

    // Act: the Coordinator reads the feed and their bookings list.
    const notices = await feed(w.coordinator);
    const mine = (await request(baseUrl).get('/api/venues/bookings/mine').set('Cookie', w.coordinator.cookie).expect(200)).body as Array<{
      id: string;
      status: string;
      rejectionReason?: string;
    }>;

    // Assert: each notice's booking id resolves to a listed booking with the right status.
    const byBooking = Object.fromEntries(notices.map((n) => [n.relatedBookingId, n.type]));
    expect(byBooking).toEqual({ [w.bookingId]: 'venue_booking_approved', [rejectedBooking]: 'venue_booking_rejected' });
    expect(mine.find((b) => b.id === w.bookingId)).toMatchObject({ status: 'approved' });
    expect(mine.find((b) => b.id === rejectedBooking)).toMatchObject({ status: 'rejected', rejectionReason: 'Clashes with maintenance' });
  });

  /**
   * VENUE-BOOK-NOTIF-03-F (SUPPORTING, AC3): the migration can be applied again without error, the new column is
   * nullable (older notices have no booking), and deleting a booking deletes its notice.
   * Kills: a non-idempotent migration, a NOT NULL column, a missing cascade that would block clean-up.
   */
  it('VENUE-BOOK-NOTIF-03-F the booking link is optional, the migration is repeatable and a deleted booking removes its notice', async () => {
    // Arrange: a decided booking with its notice.
    const w = await world();
    await approve(w.bookingId, w.staff).expect(201);

    // Act: apply the migration again; add an older-style notice with no booking.
    await pool.query(await readFile(new URL('../migrations/029_spm137_booking_decision_notification.sql', import.meta.url), 'utf8'));
    await pool.query(`INSERT INTO notifications (id, recipient_id, type, message, related_event_id) VALUES ($1, $2, 'coordinator_assignment', 'older notice', $3)`, [
      randomUUID(),
      w.coordinator.id,
      w.eventId,
    ]);
    await pool.query('DELETE FROM venue_bookings WHERE id = $1', [w.bookingId]);

    // Assert: the booking's notice went with it; the older notice is untouched.
    expect(await storedFor(w.bookingId)).toEqual([]);
    const older = await pool.query("SELECT 1 FROM notifications WHERE related_event_id = $1 AND message = 'older notice'", [w.eventId]);
    expect(older.rowCount).toBe(1);
  });

  // ---- AC4 ---------------------------------------------------------------------------------------------------------

  /**
   * VENUE-BOOK-NOTIF-04-D (SPM-137 AC4): a new notice is unread; once the Coordinator marks it read it stays read after
   * signing out and back in (a fresh session).
   * Kills: a notice created read, a read flag held in the session, mark-read not persisted.
   */
  it('VENUE-BOOK-NOTIF-04-D starts unread and stays read after signing out and back in', async () => {
    const w = await world();
    await approve(w.bookingId, w.staff).expect(201);

    // Starts unread.
    const [unread] = await noticesFor(w.coordinator, w.bookingId);
    expect(unread.read).toBe(false);

    // Mark read, then sign in again with a new session.
    await request(baseUrl).post(`/api/notifications/${unread.id}/read`).set('Cookie', w.coordinator.cookie).expect(201);
    const newCookie = await login(w.coordinator.email);
    const [afterLogin] = (await feed(w.coordinator, newCookie)).filter((n) => n.relatedBookingId === w.bookingId);
    expect(afterLogin.read).toBe(true);
    expect((await storedFor(w.bookingId))[0].read).toBe(true);
  });

  /**
   * VENUE-BOOK-NOTIF-04-E (SPM-137 AC4, isolation): another Coordinator cannot mark this Coordinator's notice read; the
   * call is a 404 and the notice stays unread.
   * Kills: the read call not being scoped to the recipient.
   */
  it('VENUE-BOOK-NOTIF-04-E another Coordinator cannot mark the notice read', async () => {
    const w = await world();
    const other = await createUser('COORDINATOR');
    await reject(w.bookingId, w.staff).expect(201);
    const [notice] = await noticesFor(w.coordinator, w.bookingId);

    await request(baseUrl).post(`/api/notifications/${notice.id}/read`).set('Cookie', other.cookie).expect(404);

    expect((await storedFor(w.bookingId))[0].read).toBe(false);
  });

  // ---- AC5 ---------------------------------------------------------------------------------------------------------

  /**
   * VENUE-BOOK-NOTIF-05-B (SPM-137 AC5): an event with three bookings gets three notifications, one per decision, each
   * linked to its own booking (two approved, one rejected).
   * Kills: one notice per event, a notice reused for several bookings, a missing decision.
   */
  it('VENUE-BOOK-NOTIF-05-B gives an event with several bookings one notification for each decision', async () => {
    // Arrange: three pending bookings of one event at three venues owned by the same staff member.
    const staff = await createUser('VENUE_STAFF');
    const coordinator = await createUser('COORDINATOR');
    const eventId = await createEvent(coordinator.id, 'SPM-137 Multi-venue event');
    const venues = [await createVenue(staff.id), await createVenue(staff.id), await createVenue(staff.id)];
    const bookings = [] as string[];
    for (const venue of venues) bookings.push(await addPending(venue.id, eventId));

    // Act: approve two, reject one.
    await approve(bookings[0], staff).expect(201);
    await reject(bookings[1], staff).expect(201);
    await approve(bookings[2], staff).expect(201);

    // Assert: three notices, each for its own booking, with the matching type.
    const notices = (await feed(coordinator)).filter((n) => n.relatedEventId === eventId);
    expect(notices).toHaveLength(3);
    expect(Object.fromEntries(notices.map((n) => [n.relatedBookingId, n.type]))).toEqual({
      [bookings[0]]: 'venue_booking_approved',
      [bookings[1]]: 'venue_booking_rejected',
      [bookings[2]]: 'venue_booking_approved',
    });
    expect(new Set(notices.map((n) => n.id)).size).toBe(3);
  });

  // ---- AC6 ---------------------------------------------------------------------------------------------------------

  /** Reassigns the event through the Lead's real API route. */
  async function reassign(eventId: string, from: TestUser, to: TestUser) {
    const lead = await createUser('COORDINATOR_LEAD', 'SPM-137 Lead');
    await request(baseUrl)
      .post(`/api/lead/events/${eventId}/reassign`)
      .set('Cookie', lead.cookie)
      .send({ coordinatorId: to.id, currentCoordinatorId: from.id })
      .expect(201);
  }

  /**
   * VENUE-BOOK-NOTIF-06-B (SPM-137 AC6): the event is reassigned (through the Lead's API) before the decision; the new
   * Coordinator receives the notice and the previous one receives none.
   * Kills: addressing the notice to the Coordinator who submitted the request or to the first assignee.
   */
  it('VENUE-BOOK-NOTIF-06-B sends the notification to the Coordinator assigned at decision time, not the previous one', async () => {
    // Arrange: a booking submitted under coordinator A, then the event is reassigned to B.
    const w = await world();
    const b = await createUser('COORDINATOR', 'SPM-137 New Coordinator');
    await reassign(w.eventId, w.coordinator, b);

    // Act: the decision is made after the reassignment.
    await approve(w.bookingId, w.staff).expect(201);

    // Assert: B has the notice, A has none.
    expect(await noticesFor(b, w.bookingId)).toMatchObject([{ type: 'venue_booking_approved' }]);
    expect(await noticesFor(w.coordinator, w.bookingId)).toEqual([]);
    expect((await storedFor(w.bookingId)).map((row) => row.recipient_id)).toEqual([b.id]);
  });

  /**
   * VENUE-BOOK-NOTIF-06-C (SPM-137 AC6, SC-SPM137-04): when the event is reassigned, the previous Coordinator's unread
   * decision notices for that event are marked read and leave their unread feed; the new Coordinator gets nothing for
   * the earlier decision. Notices for the previous Coordinator's other events, and another user's notice for the same
   * event, stay unread. The previous Coordinator's bookings list no longer holds the booking.
   * Kills: leaving the old notices unread, clearing every notice of the recipient, clearing another user's notice,
   * moving or copying earlier notices to the new Coordinator.
   */
  it('VENUE-BOOK-NOTIF-06-C marks the previous Coordinator\'s unread decision notices for the event read after a reassignment', async () => {
    // Arrange: two decisions on the reassigned event (one approved, one rejected) and one decision on another event of
    // the same Coordinator, plus a decision notice for the reassigned event addressed to a different user.
    const w = await world();
    const b = await createUser('COORDINATOR', 'SPM-137 New Coordinator');
    const bystander = await createUser('COORDINATOR', 'SPM-137 Bystander');
    const secondBooking = await addPending(w.venue.id, w.eventId, '2030-01-13T06:00:00.000Z', '2030-01-13T07:00:00.000Z');
    const otherEventId = await createEvent(w.coordinator.id, 'SPM-137 Other event');
    const otherBooking = await addPending(w.venue.id, otherEventId, '2030-01-14T06:00:00.000Z', '2030-01-14T07:00:00.000Z');
    await approve(w.bookingId, w.staff).expect(201);
    await reject(secondBooking, w.staff).expect(201);
    await approve(otherBooking, w.staff).expect(201);
    await pool.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_booking_id)
       VALUES ($1, $2, 'venue_booking_approved', 'SPM-137 bystander notice', $3, $4)`,
      [randomUUID(), bystander.id, w.eventId, w.bookingId],
    );
    expect((await feed(w.coordinator)).filter((n) => n.relatedEventId === w.eventId && !n.read)).toHaveLength(2);

    // Act: reassign afterwards.
    await reassign(w.eventId, w.coordinator, b);

    // Assert: both of A's notices for the reassigned event are read and gone from the unread feed.
    const onEvent = (await feed(w.coordinator)).filter((n) => n.relatedEventId === w.eventId && (n.type === 'venue_booking_approved' || n.type === 'venue_booking_rejected'));
    expect(onEvent.map((n) => n.type).sort()).toEqual(['venue_booking_approved', 'venue_booking_rejected']);
    expect(onEvent.every((n) => n.read)).toBe(true);
    expect((await feed(w.coordinator)).filter((n) => n.relatedEventId === w.eventId && !n.read && (n.type === 'venue_booking_approved' || n.type === 'venue_booking_rejected'))).toEqual([]);
    // Isolation: A's notice for the other event is still unread; the other user's notice for this event is untouched.
    expect(await noticesFor(w.coordinator, otherBooking)).toMatchObject([{ type: 'venue_booking_approved', read: false }]);
    expect(await noticesFor(bystander, w.bookingId)).toMatchObject([{ type: 'venue_booking_approved', read: false }]);
    // The new Coordinator gets nothing for earlier decisions, and A no longer sees the booking in their list.
    expect(await noticesFor(b, w.bookingId)).toEqual([]);
    expect(await noticesFor(b, secondBooking)).toEqual([]);
    const aBookings = (await request(baseUrl).get('/api/venues/bookings/mine').set('Cookie', w.coordinator.cookie).expect(200)).body as Array<{ id: string }>;
    expect(aBookings.some((booking) => booking.id === w.bookingId)).toBe(false);
  });

  // ---- AC7 ---------------------------------------------------------------------------------------------------------

  /**
   * VENUE-BOOK-NOTIF-07-F (SPM-137 AC7): decisions that are refused never create a notification: a staff member who
   * does not own the venue (404), a Coordinator calling the route (403), a booking that is already decided (409), an
   * approval that conflicts with another booking (409), a blank rejection reason (400) and an unknown booking (404).
   * Kills: writing the notification before the checks, or on a refused path.
   */
  it('VENUE-BOOK-NOTIF-07-F creates no notification for a refused or conflicting decision', async () => {
    // Arrange: a pending booking, a second staff member, and a booking that overlaps an already approved one.
    const w = await world();
    const foreignStaff = await createUser('VENUE_STAFF');
    const rival = await createEvent(w.coordinator.id, 'SPM-137 Rival event');
    const overlapping = await createEvent(w.coordinator.id, 'SPM-137 Overlapping event');
    const rivalBooking = await addPending(w.venue.id, rival, '2030-02-01T06:00:00.000Z', '2030-02-01T07:00:00.000Z');
    // The rival is approved first: a pending request that overlaps would itself block the approval.
    await approve(rivalBooking, w.staff).expect(201);
    const conflicted = await addPending(w.venue.id, overlapping, '2030-02-01T06:30:00.000Z', '2030-02-01T07:30:00.000Z');
    const before = (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE related_booking_id = ANY($1::uuid[])', [[w.bookingId, conflicted]])).rows[0].n;

    // Act + Assert: each refusal has its status.
    await approve(w.bookingId, foreignStaff).expect(404);
    await reject(w.bookingId, foreignStaff).expect(404);
    await approve(w.bookingId, w.coordinator).expect(403);
    await reject(w.bookingId, w.staff, '   ').expect(400);
    await approve(randomUUID(), w.staff).expect(404);
    const conflict = await approve(conflicted, w.staff).expect(409);
    expect(conflict.body).toMatchObject({ code: 'BOOKING_SLOT_CONFLICT' });
    await approve(rivalBooking, w.staff).expect(409);
    await reject(rivalBooking, w.staff).expect(409);

    // The refusals stored nothing for these bookings; the one approved booking has exactly its one notice.
    const after = (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE related_booking_id = ANY($1::uuid[])', [[w.bookingId, conflicted]])).rows[0].n;
    expect([before, after]).toEqual([0, 0]);
    expect(await storedFor(rivalBooking)).toHaveLength(1);
    const statuses = await pool.query<{ id: string; status: string }>('SELECT id, status FROM venue_bookings WHERE id = ANY($1::uuid[])', [[w.bookingId, conflicted]]);
    expect(statuses.rows.map((r) => r.status)).toEqual(['pending', 'pending']);
  });

  /**
   * DOCUMENTED BOUNDED EXCEPTION to the no-sleep rule (DX-SPM137-02): polls pg_stat_activity until `count` requests
   * are blocked on a FOR UPDATE statement, up to 200 x 50 ms (about 10 s), and throws if they never appear, so a
   * missing row lock fails loudly. The lock is released only after the waiters are observed.
   */
  async function waitForLockWaiters(count: number) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const result = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::integer AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'`,
      );
      if (result.rows[0].n >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`expected ${count} requests blocked on the venue row lock`);
  }

  /**
   * VENUE-BOOK-NOTIF-07-G (SPM-137 AC7, concurrency): an approval and a rejection of the same booking race while the
   * venue row lock is held from another connection. One wins (201), one is refused (409), and exactly one notification
   * exists, matching the decision that was saved.
   * Kills: notifying for the losing decision, a missing venue/booking lock, a notice that disagrees with the status.
   */
  it('VENUE-BOOK-NOTIF-07-G notifies only for the decision that won when an approval and a rejection race', async () => {
    // Arrange: one pending booking.
    const w = await world();

    // Act: hold the venue row lock from a separate connection, send both decisions, and wait until both are blocked on it.
    const holder = await pool.connect();
    let held = true;
    const releaseHolder = async () => {
      if (!held) return;
      held = false;
      await holder.query('ROLLBACK');
      holder.release();
    };
    let responses: request.Response[];
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM venues WHERE id = $1 FOR UPDATE', [w.venue.id]);
      const pending = Promise.all([approve(w.bookingId, w.staff), reject(w.bookingId, w.staff)]);
      await waitForLockWaiters(2);
      await releaseHolder();
      responses = await pending;
    } finally {
      await releaseHolder();
    }

    // Assert: one 201 and one 409; exactly one stored notice, of the type that matches the saved status.
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const status = (await pool.query<{ status: string }>('SELECT status FROM venue_bookings WHERE id = $1', [w.bookingId])).rows[0].status;
    const stored = await storedFor(w.bookingId);
    expect(stored).toHaveLength(1);
    expect(stored[0].type).toBe(status === 'approved' ? 'venue_booking_approved' : 'venue_booking_rejected');
    expect(stored[0].recipient_id).toBe(w.coordinator.id);
  });

  /**
   * VENUE-BOOK-NOTIF-07-H (SPM-137 AC7, atomicity): if the notification cannot be saved (a trigger forces the insert to
   * fail for this booking only), the decision is not saved either: the request returns an error, the booking is still
   * pending and no audit row or notice exists.
   * Kills: writing the notification outside the decision's transaction, or swallowing its failure.
   */
  it('VENUE-BOOK-NOTIF-07-H does not save the decision when its notification cannot be saved', async () => {
    // Arrange: a pending booking and a trigger that fails any notification insert for this booking.
    const w = await world();
    await pool.query(`CREATE OR REPLACE FUNCTION spm137_test_fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'spm137 forced notification failure'; END; $$`);
    await pool.query(
      `CREATE TRIGGER spm137_test_fail_notice BEFORE INSERT ON notifications FOR EACH ROW
         WHEN (NEW.related_booking_id = '${w.bookingId}'::uuid) EXECUTE FUNCTION spm137_test_fail_notice()`,
    );
    try {
      // Act: approve and reject both hit the failing insert.
      const approved = await approve(w.bookingId, w.staff);
      const rejected = await reject(w.bookingId, w.staff);
      expect([approved.status, rejected.status]).toEqual([500, 500]);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS spm137_test_fail_notice ON notifications');
      await pool.query('DROP FUNCTION IF EXISTS spm137_test_fail_notice()');
    }

    // Assert: nothing was saved.
    expect((await pool.query<{ status: string }>('SELECT status FROM venue_bookings WHERE id = $1', [w.bookingId])).rows[0].status).toBe('pending');
    expect((await pool.query('SELECT 1 FROM booking_review_log WHERE booking_id = $1', [w.bookingId])).rowCount).toBe(0);
    expect(await storedFor(w.bookingId)).toEqual([]);
    // And the decision works once the failure is gone (the booking was never stuck).
    await approve(w.bookingId, w.staff).expect(201);
    expect(await storedFor(w.bookingId)).toHaveLength(1);
  });
});
