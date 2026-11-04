import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';

/*
 * SPM-157 Audit History of Important Actions. Real Nest pipeline, real PostgreSQL.
 * Needs TEST_DATABASE_URL (or DATABASE_URL) with database/postgresql/init 001 to 031 applied; the suite
 * re-applies migrations/019 (booking lifecycle) and applies migrations/034_spm157_event_audit_log.sql itself (idempotent).
 *
 * Test cases: AUDIT-HISTORY-01-A to AUDIT-HISTORY-11-A (Confluence, SPM-157 Audit History of Important Actions Test
 * Cases).
 * Oracles are the SPM-157 AC text (revised 2 Nov 2026) and the Confluence expected results: the entry
 * wording, the author names (the fixture users' display names, 'System', 'Not recorded') and the order.
 *
 * Changes made through the API carry the signed-in user (AuthenticationMiddleware → DatabaseService →
 * app.actor_id). Changes whose own story's API is covered elsewhere are made here with SQL inside
 * `asUser`, which sets app.actor_id exactly as DatabaseService does; the triggers under test are the same.
 */

const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database && process.env.CI)
  throw new Error('SPM-157 tests must run in CI: set TEST_DATABASE_URL or DATABASE_URL.');

const PASSWORD = 'password123';
const MIGRATION = new URL('../migrations/034_spm157_event_audit_log.sql', import.meta.url);

interface Entry {
  id: string;
  section: string;
  action: string;
  summary: string;
  subject?: string;
  changes: { field: string; label: string; from: unknown; to: unknown }[];
  reason?: string;
  actor: { kind: string; name: string };
  occurredAt: string;
}

interface User {
  uid: string;
  name: string;
  cookie: string;
}

describe.skipIf(!database)('SPM-157 Audit History of Important Actions (e2e)', () => {
  let pool: pg.Pool;
  const apps: INestApplication<App>[] = [];
  let createdEventIds: string[] = [];
  let createdUserIds: string[] = [];
  let createdVenueIds: string[] = [];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: database });
    await pool.query(await readFile(new URL('../migrations/001_event_drafts.sql', import.meta.url), 'utf8'));
    // events-cancel and events-cancelled-guard re-apply migration 011, which drops the 'cancelled' booking status;
    // restore the SPM-54 booking lifecycle before relying on it (idempotent).
    await pool.query(await readFile(new URL('../migrations/019_spm54_venue_booking_lifecycle.sql', import.meta.url), 'utf8'));
    await pool.query(await readFile(MIGRATION, 'utf8'));
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(async () => {
    while (apps.length) await apps.pop()?.close();
    if (createdEventIds.length) await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [createdEventIds]);
    if (createdVenueIds.length) await pool.query('DELETE FROM venues WHERE id = ANY($1::uuid[])', [createdVenueIds]);
    if (createdUserIds.length) {
      await pool.query('DELETE FROM booking_review_log WHERE actor_user_id = ANY($1::uuid[])', [createdUserIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [createdUserIds]);
    }
    createdEventIds = [];
    createdUserIds = [];
    createdVenueIds = [];
  });

  async function startApp(now?: Date): Promise<INestApplication<App>> {
    let builder = Test.createTestingModule({ imports: [AppModule] });
    if (now) builder = builder.overrideProvider(CLOCK).useValue({ now: () => now });
    const moduleFixture = await builder.compile();
    const app = moduleFixture.createNestApplication<INestApplication<App>>();
    await app.init();
    apps.push(app);
    return app;
  }

  async function createUser(app: INestApplication<App>, role: string, name: string): Promise<User> {
    const email = `spm157-${randomUUID()}@example.com`;
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 4))) RETURNING id`,
      [email, name, PASSWORD],
    );
    const uid = created.rows[0].id;
    createdUserIds.push(uid);
    await pool.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2', [uid, role]);
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: PASSWORD }).expect(201);
    const cookie = (response.headers['set-cookie'] as unknown as string[] | undefined)
      ?.find((value) => value.startsWith('connectsphere_session='));
    if (!cookie) throw new Error('Expected a session cookie');
    return { uid, name, cookie: cookie.split(';', 1)[0] };
  }

  /** Runs `work` in one transaction as `user`, the way DatabaseService does for a signed-in request. */
  async function asUser<T>(user: { uid: string } | null, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (user) await client.query("SELECT set_config('app.actor_id', $1, true)", [user.uid]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function seedEvent(options: { organiser: User; coordinator?: User; status?: string; name?: string }): Promise<string> {
    const id = randomUUID();
    createdEventIds.push(id);
    await pool.query(
      `INSERT INTO events (id, organiser_id, organiser_name, organiser_email, event_name, purpose,
                           start_date_time, end_date_time, expected_attendance, status, submission_key)
       VALUES ($1, $2, $3, 'organiser@example.test', $4, 'Audit history testing',
               '2027-03-01T10:00:00Z', '2027-03-01T12:00:00Z', 80, 'Submitted', $1)`,
      [id, options.organiser.uid, options.organiser.name, options.name ?? 'SPM-157 Event'],
    );
    if (options.coordinator) {
      await pool.query('UPDATE events SET coordinator_id = $2, coordinator_name = $3 WHERE id = $1',
        [id, options.coordinator.uid, options.coordinator.name]);
    }
    if (options.status && options.status !== 'Submitted') {
      await pool.query('UPDATE events SET status = $2 WHERE id = $1', [id, options.status]);
    }
    return id;
  }

  async function seedVenue(owner: User, name: string): Promise<string> {
    const created = await pool.query<{ id: string }>(
      `INSERT INTO venues (owner_user_id, name, location, capacity, operating_information, setup_time_minutes, turnaround_time_minutes)
       VALUES ($1, $2, 'SPM-157 Location', 200, 'Fixture', 0, 0) RETURNING id`,
      [owner.uid, name],
    );
    createdVenueIds.push(created.rows[0].id);
    return created.rows[0].id;
  }

  async function history(app: INestApplication<App>, user: User | null, eventId: string, expected = 200) {
    const call = request(app.getHttpServer()).get(`/api/events/${eventId}/history`);
    if (user) call.set('Cookie', user.cookie);
    return call.expect(expected);
  }

  const brief = (entries: Entry[]) => entries.map((entry) => [entry.summary, entry.actor.name]);

  // AUDIT-HISTORY-01-A, AUDIT-HISTORY-01-B, AUDIT-HISTORY-05-C, AUDIT-HISTORY-06-A, AUDIT-HISTORY-07-A,
  // AUDIT-HISTORY-09-A: actions taken through the API carry the signed-in user, and the
  // Coordinator the event is reassigned to sees everything from before the reassignment; the previous one is refused.
  it('AUDIT-HISTORY-01-B / 07-A records assignment, approval and reassignment through the API with their authors', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const lead = await createUser(app, 'COORDINATOR_LEAD', 'SPM157 Lead');
    const first = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator One');
    const second = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator Two');
    const eventId = await seedEvent({ organiser });

    await request(app.getHttpServer()).post(`/api/lead/queue/${eventId}/assign`).set('Cookie', lead.cookie)
      .send({ coordinatorId: first.uid }).expect(201);
    await request(app.getHttpServer()).post(`/api/events/${eventId}/approve`).set('Cookie', first.cookie).expect(201);
    await request(app.getHttpServer()).post(`/api/lead/events/${eventId}/reassign`).set('Cookie', lead.cookie)
      .send({ coordinatorId: second.uid, currentCoordinatorId: first.uid }).expect(201);

    const response = await history(app, second, eventId);
    expect(response.body).toMatchObject({ eventId, eventName: 'SPM-157 Event', eventStatus: 'Approved', viewer: 'coordinator' });
    const entries = response.body.sections.event as Entry[];
    expect(brief(entries)).toEqual([
      ['Event request submitted', 'SPM157 Organiser'],
      ['Coordinator assigned', 'SPM157 Lead'],
      ['Event request approved', 'SPM157 Coordinator One'],
      ['Event reassigned to another coordinator', 'SPM157 Lead'],
    ]);
    expect(entries[1].changes).toEqual([{ field: 'coordinator', label: 'Coordinator', from: null, to: 'SPM157 Coordinator One' }]);
    expect(entries[2].changes).toEqual([{ field: 'status', label: 'Status', from: 'Submitted', to: 'Approved' }]);
    expect(entries[3].changes).toEqual([
      { field: 'coordinator', label: 'Coordinator', from: 'SPM157 Coordinator One', to: 'SPM157 Coordinator Two' },
    ]);
    const times = entries.map((entry) => Date.parse(entry.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));

    // AC9 with SPM-47 AC6: the previous Coordinator no longer has access.
    const refused = await history(app, first, eventId, 403);
    expect(refused.body.message).toBe('You can only view the history of events assigned to you or that you own.');
  });

  // AUDIT-HISTORY-01-A, AUDIT-HISTORY-05-A: a rejection decision shows the old and new status, the coordinator and
  // the reason.
  it('AUDIT-HISTORY-01-A records a rejection with its reason', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator });

    await request(app.getHttpServer()).post(`/api/events/${eventId}/reject`).set('Cookie', coordinator.cookie)
      .send({ reason: 'The venue cannot host this event size.' }).expect(201);

    const entries = (await history(app, organiser, eventId)).body.sections.event as Entry[];
    expect(entries.at(-1)).toMatchObject({
      summary: 'Event request rejected',
      changes: [{ field: 'status', label: 'Status', from: 'Submitted', to: 'Rejected' }],
      reason: 'The venue cannot host this event size.',
      actor: { kind: 'user', name: 'SPM157 Coordinator' },
    });
  });

  // AUDIT-HISTORY-01-C, AUDIT-HISTORY-01-D, AUDIT-HISTORY-01-E, AUDIT-HISTORY-06-A: the histories other stories keep
  // are part of the event history, in time order.
  it('AUDIT-HISTORY-01-C / 01-D / 01-E reads flagged changes, change requests and cancellation requests in order', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Planning' });
    const t = (minutes: number) => new Date(Date.UTC(2030, 0, 1, 0, minutes)).toISOString();

    await pool.query(
      `INSERT INTO event_flagged_changes (id, event_id, kind, field, original_value, proposed_value, status,
                                          proposed_by, proposed_by_id, created_at, resolved_by, resolved_by_id, resolved_at)
       VALUES ($1, $2, 'booking_conflict', 'expectedAttendance', '80', '150', 'Rejected', $3, $4, $5, $3, $4, $6),
              ($7, $2, 'direct_update', 'name', '"SPM-157 Event"', '"Renamed Event"', 'Applied', $3, $4, $8, $3, $4, $8)`,
      [randomUUID(), eventId, coordinator.name, coordinator.uid, t(10), t(20), randomUUID(), t(30)],
    );
    const changeRequestId = randomUUID();
    await pool.query(
      `INSERT INTO event_change_requests (id, event_id, requested_by_id, requested_by, changes, reason, status,
                                          decision_reason, decided_by, decided_by_id, decided_at, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'More guests confirmed', 'Denied', 'No larger room', $6, $7, $9, $8)`,
      [changeRequestId, eventId, organiser.uid, organiser.name,
        JSON.stringify([{ field: 'expectedAttendance', originalValue: 80, proposedValue: 150 }]),
        coordinator.name, coordinator.uid, t(40), t(50)],
    );
    await pool.query(
      `INSERT INTO event_change_request_audit (id, change_request_id, event_id, outcome, changes, requested_by_id,
                                               requested_by, decided_by_id, decided_by, reason, decided_at)
       VALUES ($1, $2, $3, 'Denied', $4::jsonb, $5, $6, $7, $8, 'No larger room', $9)`,
      [randomUUID(), changeRequestId, eventId,
        JSON.stringify([{ field: 'expectedAttendance', originalValue: 80, proposedValue: 150 }]),
        organiser.uid, organiser.name, coordinator.uid, coordinator.name, t(50)],
    );
    await pool.query(
      `INSERT INTO event_cancellation_requests (id, event_id, requested_by_id, requested_by, reason, status,
                                                requested_at, decided_by_id, decided_by, decided_at)
       VALUES ($1, $2, $3, $4, 'Speaker unavailable', 'declined', $5, $6, $7, $8)`,
      [randomUUID(), eventId, organiser.uid, organiser.name, t(60), coordinator.uid, coordinator.name, t(70)],
    );

    const entries = (await history(app, coordinator, eventId)).body.sections.event as Entry[];
    const later = entries.filter((entry) => entry.occurredAt >= t(0));
    expect(brief(later)).toEqual([
      ['Change flagged for review', 'SPM157 Coordinator'],
      ['Flagged change rejected', 'SPM157 Coordinator'],
      ['Event information updated', 'SPM157 Coordinator'],
      ['Change request submitted', 'SPM157 Organiser'],
      ['Change request denied', 'SPM157 Coordinator'],
      ['Cancellation requested', 'SPM157 Organiser'],
      ['Cancellation request declined', 'SPM157 Coordinator'],
    ]);
    expect(later[0].changes).toEqual([{ field: 'expectedAttendance', label: 'Expected attendance', from: 80, to: 150 }]);
    expect(later[2].changes).toEqual([{ field: 'name', label: 'Event name', from: 'SPM-157 Event', to: 'Renamed Event' }]);
    expect(later[3].reason).toBe('More guests confirmed');
    expect(later[4].reason).toBe('No larger room');
    expect(later[5].reason).toBe('Speaker unavailable');
  });

  // AUDIT-HISTORY-01-F, AUDIT-HISTORY-05-B: safety check request, the Safety Officer's outcome with every feedback
  // item as the
  // reason, and the reset caused by an event change shown as the system's with its reason.
  it('AUDIT-HISTORY-01-F records the safety check request, outcome and reset', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const officer = await createUser(app, 'SAFETY_OFFICER', 'SPM157 Safety Officer');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Planning' });

    await asUser(coordinator, (client) => client.query(
      `INSERT INTO event_safety_checks (event_id, status, requested_at, requested_by) VALUES ($1, 'pending', now(), $2)`,
      [eventId, coordinator.uid]));
    await asUser(officer, async (client) => {
      await client.query(
        `UPDATE event_safety_checks SET status = 'changes_needed', approver_name = $2, feedback = 'Add stewards', decided_at = now()
          WHERE event_id = $1`, [eventId, officer.name]);
      await client.query(
        `INSERT INTO safety_check_feedback_items (event_id, feedback_text) VALUES ($1, 'Add stewards'), ($1, 'Mark the fire exits')`,
        [eventId]);
    });
    await asUser(coordinator, (client) => client.query('UPDATE events SET expected_attendance = 90 WHERE id = $1', [eventId]));

    const entries = (await history(app, coordinator, eventId)).body.sections.event as Entry[];
    const safety = entries.filter((entry) => entry.action.startsWith('safety'));
    expect(safety.map((entry) => [entry.summary, entry.actor.name])).toEqual([
      ['Safety check requested', 'SPM157 Coordinator'],
      ['Safety Officer requested changes', 'SPM157 Safety Officer'],
      ['Safety check reset', 'System'],
    ]);
    expect(safety[0].reason).toBeUndefined();
    // Every feedback item is the reason, one per line, in the order the Safety Officer's items are listed
    // elsewhere (requested_at, id — src/events/status/safety-check.source.ts).
    expect(safety[1].reason?.split('\n').sort()).toEqual(['Add stewards', 'Mark the fire exits']);
    expect(safety[2].reason).toBe('Event details were updated');
    expect(safety[1].changes).toEqual([
      { field: 'safetyCheck', label: 'Safety check', from: 'Awaiting Safety Check', to: 'Changes Requested' },
    ]);
  });

  // AUDIT-HISTORY-02-A, AUDIT-HISTORY-02-B, AUDIT-HISTORY-02-C, AUDIT-HISTORY-05-B: venue bookings and holds; a hold
  // cancelled because the event time changed is the system's.
  it('AUDIT-HISTORY-02-A / 02-B / 02-C records the venue booking and tentative hold lifecycle', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const staff = await createUser(app, 'VENUE_STAFF', 'SPM157 Venue Staff');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Planning' });
    const hall = await seedVenue(staff, 'SPM157 Hall');
    const room = await seedVenue(staff, 'SPM157 Room');

    const insertBooking = (venueId: string, kind: string) => asUser(coordinator, async (client) => (await client.query<{ id: string }>(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind)
       VALUES ($1, $2, '2027-03-01T10:00:00Z', '2027-03-01T12:00:00Z', 'pending', $3) RETURNING id`,
      [venueId, eventId, kind])).rows[0].id);
    const booking = await insertBooking(hall, 'booking');
    await asUser(staff, (client) => client.query("UPDATE venue_bookings SET status = 'approved' WHERE id = $1", [booking]));
    // SPM-130: a change that needs the venue re-approved sends the booking back to Pending.
    await asUser(coordinator, (client) => client.query("UPDATE venue_bookings SET status = 'pending' WHERE id = $1", [booking]));
    const rejected = await insertBooking(room, 'booking');
    await asUser(staff, (client) => client.query(
      "UPDATE venue_bookings SET status = 'rejected', rejection_reason = 'Room closed for repairs' WHERE id = $1", [rejected]));
    await asUser(coordinator, (client) => client.query("UPDATE venue_bookings SET status = 'cancelled' WHERE id = $1", [booking]));

    const hold = await insertBooking(room, 'tentative_hold');
    await asUser(staff, (client) => client.query(
      "UPDATE venue_bookings SET status = 'approved', hold_expires_at = '2027-02-01T02:00:00Z' WHERE id = $1", [hold]));
    await asUser(staff, (client) => client.query("UPDATE venue_bookings SET request_kind = 'booking' WHERE id = $1", [hold]));
    await asUser(coordinator, (client) => client.query("UPDATE venue_bookings SET status = 'released', released_at = now() WHERE id = $1", [hold]));

    const pendingHold = await insertBooking(hall, 'tentative_hold');
    // SPM-159: changing the event time cancels pending holds (database trigger) — an automatic change.
    await asUser(coordinator, (client) => client.query(
      "UPDATE events SET start_date_time = '2027-03-02T10:00:00Z', end_date_time = '2027-03-02T12:00:00Z' WHERE id = $1", [eventId]));
    const removable = await insertBooking(hall, 'booking');
    await asUser(coordinator, (client) => client.query('DELETE FROM venue_bookings WHERE id = $1', [removable]));

    const entries = (await history(app, coordinator, eventId)).body.sections.venueBookings as Entry[];
    expect(entries.map((entry) => [entry.summary, entry.subject, entry.actor.name])).toEqual([
      ['Venue booking requested', 'SPM157 Hall', 'SPM157 Coordinator'],
      ['Venue booking approved', 'SPM157 Hall', 'SPM157 Venue Staff'],
      ['Venue booking returned for review', 'SPM157 Hall', 'SPM157 Coordinator'],
      ['Venue booking requested', 'SPM157 Room', 'SPM157 Coordinator'],
      ['Venue booking rejected', 'SPM157 Room', 'SPM157 Venue Staff'],
      ['Venue booking cancelled', 'SPM157 Hall', 'SPM157 Coordinator'],
      ['Tentative hold requested', 'SPM157 Room', 'SPM157 Coordinator'],
      ['Tentative hold placed', 'SPM157 Room', 'SPM157 Venue Staff'],
      ['Tentative hold converted to a booking', 'SPM157 Room', 'SPM157 Venue Staff'],
      ['Venue booking released', 'SPM157 Room', 'SPM157 Coordinator'],
      ['Tentative hold requested', 'SPM157 Hall', 'SPM157 Coordinator'],
      ['Tentative hold cancelled', 'SPM157 Hall', 'System'],
      ['Venue booking requested', 'SPM157 Hall', 'SPM157 Coordinator'],
      ['Venue request removed', 'SPM157 Hall', 'SPM157 Coordinator'],
    ]);
    expect(entries[0].changes).toEqual([
      { field: 'status', label: 'Status', from: null, to: 'Pending' },
      { field: 'start', label: 'Start', from: null, to: '2027-03-01T10:00:00.000Z' },
      { field: 'end', label: 'End', from: null, to: '2027-03-01T12:00:00.000Z' },
    ]);
    expect(entries[2].changes).toEqual([{ field: 'status', label: 'Status', from: 'Approved', to: 'Pending' }]);
    expect(entries[4].reason).toBe('Room closed for repairs');
    expect(entries[7].changes).toEqual([
      { field: 'status', label: 'Status', from: 'Pending', to: 'Approved' },
      { field: 'holdExpiresAt', label: 'Hold expires', from: null, to: '2027-02-01T02:00:00.000Z' },
    ]);
    expect(entries[8].changes).toEqual([{ field: 'requestKind', label: 'Request type', from: 'Tentative hold', to: 'Booking' }]);
    expect(pendingHold).toBeTruthy();
  });

  // AUDIT-HISTORY-02-D: an approved hold is expired from its expiry instant (SPM-159 rule), shown as the system's, and
  // stays one entry after the SPM-132 expiry processor stores it as 'expired'.
  it('AUDIT-HISTORY-02-D shows a hold as expired by the system exactly from its expiry time', async () => {
    const expiry = new Date('2027-02-01T02:00:00.000Z');
    const before = await startApp(new Date(expiry.getTime() - 1));
    const organiser = await createUser(before, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(before, 'COORDINATOR', 'SPM157 Coordinator');
    const staff = await createUser(before, 'VENUE_STAFF', 'SPM157 Venue Staff');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Planning' });
    const venue = await seedVenue(staff, 'SPM157 Hall');
    await pool.query(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, request_kind, hold_expires_at)
       VALUES ($1, $2, '2027-03-01T10:00:00Z', '2027-03-01T12:00:00Z', 'approved', 'tentative_hold', $3)`,
      [venue, eventId, expiry],
    );

    const notYet = (await history(before, coordinator, eventId)).body.sections.venueBookings as Entry[];
    expect(notYet.map((entry) => entry.summary)).not.toContain('Tentative hold expired');

    const at = await startApp(expiry);
    const expired = (await history(at, coordinator, eventId)).body.sections.venueBookings as Entry[];
    expect(expired.at(-1)).toMatchObject({
      summary: 'Tentative hold expired',
      subject: 'SPM157 Hall',
      actor: { kind: 'system', name: 'System' },
      occurredAt: '2027-02-01T02:00:00.000Z',
    });

    // SPM-132: the expiry processor later stores the hold as 'expired' (no signed-in user). The history still shows the
    // expiry once, at the expiry time, and the processing adds no entry of its own.
    const processedAt = new Date(expiry.getTime() + 60_000);
    await asUser(null, (client) => client.query(
      `UPDATE venue_bookings SET status = 'expired', hold_expiry_processed_at = $2
        WHERE event_id = $1 AND request_kind = 'tentative_hold' AND status = 'approved'`, [eventId, processedAt]));
    const later = await startApp(processedAt);
    const processed = (await history(later, coordinator, eventId)).body.sections.venueBookings as Entry[];
    expect(processed).toEqual(expired);
  });

  // AUDIT-HISTORY-03-A, AUDIT-HISTORY-03-B, AUDIT-HISTORY-03-C: equipment request (recorded with its items when
  // saved), decisions and release.
  it('AUDIT-HISTORY-03-A / 03-B / 03-C records the equipment request lifecycle', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const tech = await createUser(app, 'TECH_SUPPORT', 'SPM157 Technical Support');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Planning' });

    const requestId = await asUser(coordinator, async (client) => {
      const created = await client.query<{ id: string }>(
        'INSERT INTO equipment_requests (event_id, requested_by) VALUES ($1, $2) RETURNING id', [eventId, coordinator.uid]);
      await client.query(
        `INSERT INTO equipment_request_items (request_id, equipment_name, equipment_type, quantity, item_order)
         VALUES ($1, 'Wireless microphone', 'Audio', 2, 0), ($1, 'Projector', 'Visual', 1, 1)`, [created.rows[0].id]);
      return created.rows[0].id;
    });
    await asUser(tech, (client) => client.query("UPDATE equipment_requests SET status = 'Reserved' WHERE id = $1", [requestId]));
    await asUser(coordinator, (client) => client.query("UPDATE equipment_requests SET status = 'Pending Review' WHERE id = $1", [requestId]));
    await asUser(tech, (client) => client.query(
      "UPDATE equipment_requests SET status = 'Cannot Provide', decision_reason = 'Projector out for repair' WHERE id = $1", [requestId]));
    const reservation = await pool.query<{ id: string }>(
      `INSERT INTO equipment_reservations (event_id, equipment_name, quantity, status) VALUES ($1, 'Wireless microphone', 2, 'Reserved') RETURNING id`,
      [eventId]);
    await asUser(coordinator, (client) => client.query(
      "UPDATE equipment_reservations SET status = 'Released', released_at = now() WHERE id = $1", [reservation.rows[0].id]));

    const entries = (await history(app, coordinator, eventId)).body.sections.equipment as Entry[];
    expect(entries.map((entry) => [entry.summary, entry.subject, entry.actor.name, entry.reason ?? null])).toEqual([
      ['Equipment requested', '2 x Wireless microphone, 1 x Projector', 'SPM157 Coordinator', null],
      ['Equipment request marked Reserved', '2 x Wireless microphone, 1 x Projector', 'SPM157 Technical Support', null],
      ['Equipment request returned for review', '2 x Wireless microphone, 1 x Projector', 'SPM157 Coordinator', null],
      ['Equipment request marked Cannot Provide', '2 x Wireless microphone, 1 x Projector', 'SPM157 Technical Support', 'Projector out for repair'],
      ['Equipment released', '2 x Wireless microphone', 'SPM157 Coordinator', null],
    ]);
    expect(entries[1].changes).toEqual([{ field: 'status', label: 'Status', from: 'Pending Review', to: 'Reserved' }]);
  });

  // AUDIT-HISTORY-04-A, AUDIT-HISTORY-04-B, AUDIT-HISTORY-04-C, AUDIT-HISTORY-05-B, AUDIT-HISTORY-08-A:
  // registrations; promotion and removal are the system's; the owning
  // Organiser sees event and registration history only.
  it('AUDIT-HISTORY-04-A / 04-B / 04-C / 08-A records registrations and waiting list changes', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const ann = await createUser(app, 'ATTENDEE', 'SPM157 Ann');
    const ben = await createUser(app, 'ATTENDEE', 'SPM157 Ben');
    const cat = await createUser(app, 'ATTENDEE', 'SPM157 Cat');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Confirmed' });

    const register = (user: User, status: string) => asUser(user, async (client) => (await client.query<{ id: string }>(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, joined_at, waitlist_seq)
       VALUES ($1, $2, $3, $4, 'attendee@example.test',
               CASE WHEN $3 = 'Waitlisted' THEN now() END,
               CASE WHEN $3 = 'Waitlisted' THEN nextval('event_registrations_waitlist_seq') END) RETURNING id`,
      [eventId, user.uid, status, user.name])).rows[0].id);
    const annId = await register(ann, 'Registered');
    const benId = await register(ben, 'Waitlisted');
    const catId = await register(cat, 'Waitlisted');
    // Ann withdraws; in the same request the first waiting entry is promoted (SPM-138 D8).
    await asUser(ann, async (client) => {
      await client.query("UPDATE event_registrations SET status = 'Withdrawn', withdrawn_at = now() WHERE id = $1", [annId]);
      await client.query("UPDATE event_registrations SET status = 'Registered', registered_at = now() WHERE id = $1", [benId]);
    });
    // Registration closes: the remaining waiting entry is removed (settleLocked), here inside Ben's request.
    await asUser(ben, (client) => client.query("UPDATE event_registrations SET status = 'Removed', removed_at = now() WHERE id = $1", [catId]));
    await asUser(coordinator, (client) => client.query(
      "UPDATE event_registrations SET status = 'Cancelled', cancellation_reason = 'Event cancelled by the coordinator' WHERE id = $1", [benId]));

    const coordinatorView = (await history(app, coordinator, eventId)).body;
    const entries = coordinatorView.sections.registrations as Entry[];
    expect(entries.map((entry) => [entry.summary, entry.subject, entry.actor.name, entry.reason ?? null])).toEqual([
      ['Registered', 'SPM157 Ann', 'SPM157 Ann', null],
      ['Joined the waiting list', 'SPM157 Ben', 'SPM157 Ben', null],
      ['Joined the waiting list', 'SPM157 Cat', 'SPM157 Cat', null],
      ['Registration withdrawn', 'SPM157 Ann', 'SPM157 Ann', null],
      ['Promoted from the waiting list', 'SPM157 Ben', 'System', null],
      ['Removed from the waiting list', 'SPM157 Cat', 'System', null],
      ['Registration cancelled', 'SPM157 Ben', 'SPM157 Coordinator', 'Event cancelled by the coordinator'],
    ]);
    expect(entries[4].changes).toEqual([{ field: 'status', label: 'Status', from: 'Waitlisted', to: 'Registered' }]);

    const organiserView = (await history(app, organiser, eventId)).body;
    expect(organiserView.viewer).toBe('organiser');
    expect(Object.keys(organiserView.sections).sort()).toEqual(['event', 'registrations']);
    expect(organiserView.sections.registrations).toEqual(entries);
  });

  // AUDIT-HISTORY-04-A: leaving the waiting list, and registering again on the reused row (SPM-61 D16), are their own entries.
  it('AUDIT-HISTORY-04-A records leaving the waiting list and registering again on the same row', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const ann = await createUser(app, 'ATTENDEE', 'SPM157 Ann');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Confirmed' });
    const rowId = await asUser(ann, async (client) => (await client.query<{ id: string }>(
      `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, joined_at, waitlist_seq)
       VALUES ($1, $2, 'Waitlisted', $3, 'a@example.test', now(), nextval('event_registrations_waitlist_seq')) RETURNING id`,
      [eventId, ann.uid, ann.name])).rows[0].id);
    await asUser(ann, (client) => client.query("UPDATE event_registrations SET status = 'Withdrawn', withdrawn_at = now() WHERE id = $1", [rowId]));
    await asUser(ann, (client) => client.query("UPDATE event_registrations SET status = 'Registered', registered_at = now() WHERE id = $1", [rowId]));
    // Withdrawing is always the attendee's own action, even when the write carries no signed-in user.
    await asUser(null, (client) => client.query("UPDATE event_registrations SET status = 'Withdrawn', withdrawn_at = now() WHERE id = $1", [rowId]));

    const entries = (await history(app, coordinator, eventId)).body.sections.registrations as Entry[];
    expect(entries.map((entry) => [entry.summary, entry.actor.name])).toEqual([
      ['Joined the waiting list', 'SPM157 Ann'],
      ['Left the waiting list', 'SPM157 Ann'],
      ['Registered', 'SPM157 Ann'],
      ['Registration withdrawn', 'SPM157 Ann'],
    ]);
    expect(entries[2].changes).toEqual([{ field: 'status', label: 'Status', from: 'Withdrawn', to: 'Registered' }]);
  });

  // AUDIT-HISTORY-01-H: clarification requests, the organiser's reply and the resolution (SPM-39).
  it('AUDIT-HISTORY-01-H records a clarification request, its reply and its resolution', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator });
    // Through the SPM-39 API, so the authors come from the sessions.
    const server = app.getHttpServer();
    const asked = await request(server).post(`/api/events/${eventId}/clarifications`).set('Cookie', coordinator.cookie)
      .send({ message: 'How many wheelchair users are expected?' });
    expect(asked.status).toBeLessThan(300);
    const question = (await pool.query<{ id: string }>(
      "SELECT id FROM event_comments WHERE event_id = $1 AND type = 'clarification'", [eventId])).rows[0].id;
    const replied = await request(server).post(`/api/events/${eventId}/clarifications/${question}/reply`)
      .set('Cookie', organiser.cookie).send({ message: 'About five.' });
    expect(replied.status).toBeLessThan(300);
    const resolved = await request(server).post(`/api/events/${eventId}/clarifications/${question}/resolve`)
      .set('Cookie', coordinator.cookie).send({});
    expect(resolved.status).toBeLessThan(300);

    for (const viewer of [coordinator, organiser]) {
      const entries = ((await history(app, viewer, eventId)).body.sections.event as Entry[])
        .filter((entry) => entry.action.startsWith('clarification'));
      expect(entries.map((entry) => [entry.summary, entry.actor.name, entry.subject ?? null])).toEqual([
        ['Clarification requested', 'SPM157 Coordinator', null],
        ['Clarification answered', 'SPM157 Organiser', 'How many wheelchair users are expected?'],
        ['Clarification resolved', 'SPM157 Coordinator', 'How many wheelchair users are expected?'],
      ]);
      expect(entries[0].changes).toEqual([
        { field: 'message', label: 'Message', from: null, to: 'How many wheelchair users are expected?' },
      ]);
    }
  });

  // AUDIT-HISTORY-01-I: the coordinator's response to each Safety Officer feedback item (SPM-131).
  it('AUDIT-HISTORY-01-I records the coordinator marking a safety feedback item resolved and reopening it', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Planning' });
    const item = await pool.query<{ id: string }>(
      "INSERT INTO safety_check_feedback_items (event_id, feedback_text) VALUES ($1, 'Add stewards') RETURNING id", [eventId]);
    await asUser(coordinator, (client) => client.query(
      'UPDATE safety_check_feedback_items SET resolved_by_coordinator_at = now() WHERE id = $1', [item.rows[0].id]));
    await asUser(coordinator, (client) => client.query(
      'UPDATE safety_check_feedback_items SET resolved_by_coordinator_at = NULL WHERE id = $1', [item.rows[0].id]));

    const entries = ((await history(app, coordinator, eventId)).body.sections.event as Entry[])
      .filter((entry) => entry.action.startsWith('safety_feedback'));
    expect(entries.map((entry) => [entry.summary, entry.subject, entry.actor.name])).toEqual([
      ['Safety feedback item marked resolved', 'Add stewards', 'SPM157 Coordinator'],
      ['Safety feedback item reopened', 'Add stewards', 'SPM157 Coordinator'],
    ]);
  });

  // AUDIT-HISTORY-01-J: the completion record of a Completed event (SPM-153), saved twice.
  it('AUDIT-HISTORY-01-J records the completion record with its attendance, notes and issues', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Confirmed' });
    await pool.query("UPDATE events SET status = 'Completed' WHERE id = $1", [eventId]);
    const save = (attendance: number, notes: string, issues: string[]) => asUser(coordinator, async (client) => {
      await client.query(
        `INSERT INTO completion_records (event_id, attendance_count, operational_notes, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (event_id) DO UPDATE SET attendance_count = $2, operational_notes = $3, updated_by = $4, updated_at = now()`,
        [eventId, attendance, notes, coordinator.uid]);
      await client.query('DELETE FROM completion_record_issues WHERE event_id = $1', [eventId]);
      for (const [index, description] of issues.entries())
        await client.query('INSERT INTO completion_record_issues (event_id, position, description) VALUES ($1, $2, $3)',
          [eventId, index + 1, description]);
    });
    await save(70, 'Ran smoothly', ['Projector flickered']);
    await save(72, 'Ran smoothly', ['Projector flickered']);

    const entries = ((await history(app, organiser, eventId)).body.sections.event as Entry[])
      .filter((entry) => entry.action === 'completion_record_saved');
    expect(entries.map((entry) => entry.actor.name)).toEqual(['SPM157 Coordinator', 'SPM157 Coordinator']);
    expect(entries[0].changes).toEqual([
      { field: 'attendanceCount', label: 'Attendance', from: null, to: 70 },
      { field: 'operationalNotes', label: 'Operational notes', from: null, to: 'Ran smoothly' },
      { field: 'issues', label: 'Issues', from: null, to: ['Projector flickered'] },
    ]);
    // An unchanged note and unchanged issues are not repeated.
    expect(entries[1].changes).toEqual([{ field: 'attendanceCount', label: 'Attendance', from: 70, to: 72 }]);
  });

  // AUDIT-HISTORY-02-E: a venue change that affects the booking, from the Coordinator's SPM-125 notice.
  it('AUDIT-HISTORY-02-E records a venue change that affects the booking, with the notice text', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const staff = await createUser(app, 'VENUE_STAFF', 'SPM157 Venue Staff');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Planning' });
    const venue = await seedVenue(staff, 'SPM157 Hall');
    const booking = await pool.query<{ id: string }>(
      `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status)
       VALUES ($1, $2, '2027-03-01T10:00:00Z', '2027-03-01T12:00:00Z', 'approved') RETURNING id`, [venue, eventId]);
    const message = 'SPM157 Hall is unavailable from 1 Mar 2027, 9:00 am to 1 Mar 2027, 11:00 pm. Reason: Flooding.';
    await asUser(staff, (client) => client.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id, related_booking_id)
       VALUES ($1, $2, 'venue_unavailable_impact', $3, $4, $5)`,
      [randomUUID(), coordinator.uid, message, eventId, booking.rows[0].id]));
    // Notices of other kinds are not history.
    await asUser(staff, (client) => client.query(
      `INSERT INTO notifications (id, recipient_id, type, message, related_event_id) VALUES ($1, $2, 'approval', 'x', $3)`,
      [randomUUID(), organiser.uid, eventId]));

    const entries = (await history(app, coordinator, eventId)).body.sections.venueBookings as Entry[];
    expect(entries.at(-1)).toMatchObject({
      summary: 'Venue marked unavailable during the booking',
      subject: 'SPM157 Hall',
      reason: message,
      actor: { kind: 'user', name: 'SPM157 Venue Staff' },
    });
    expect(entries.filter((entry) => entry.action.startsWith('venue_'))).toHaveLength(1);
  });

  // AUDIT-HISTORY-03-D: an edit of a Pending Review request's items is recorded with the items before and after (SPM-57).
  it('AUDIT-HISTORY-03-D records an edit of the requested items', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Planning' });
    const requestId = await asUser(coordinator, async (client) => {
      const created = await client.query<{ id: string }>(
        'INSERT INTO equipment_requests (event_id, requested_by) VALUES ($1, $2) RETURNING id', [eventId, coordinator.uid]);
      await client.query(
        "INSERT INTO equipment_request_items (request_id, equipment_name, equipment_type, quantity) VALUES ($1, 'Projector', 'Visual', 1)",
        [created.rows[0].id]);
      return created.rows[0].id;
    });
    // The SPM-57 edit: items replaced, then the request set back to Pending Review (already Pending Review here).
    await asUser(coordinator, async (client) => {
      await client.query('DELETE FROM equipment_request_items WHERE request_id = $1', [requestId]);
      await client.query(
        "INSERT INTO equipment_request_items (request_id, equipment_name, equipment_type, quantity) VALUES ($1, 'Projector', 'Visual', 2)",
        [requestId]);
      await client.query("UPDATE equipment_requests SET status = 'Pending Review', updated_at = now() WHERE id = $1", [requestId]);
    });

    const entries = (await history(app, coordinator, eventId)).body.sections.equipment as Entry[];
    expect(entries.map((entry) => [entry.summary, entry.subject, entry.actor.name])).toEqual([
      ['Equipment requested', '1 x Projector', 'SPM157 Coordinator'],
      ['Equipment request updated', '2 x Projector', 'SPM157 Coordinator'],
    ]);
    expect(entries[1].changes).toEqual([{ field: 'items', label: 'Items', from: '1 x Projector', to: '2 x Projector' }]);
  });

  // AUDIT-HISTORY-04-D: the registration period and capacity (SPM-139), visible to the coordinator and the owner.
  it('AUDIT-HISTORY-04-D records registration settings changes with old and new values', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Confirmed' });
    await asUser(coordinator, (client) => client.query(
      `UPDATE events SET registration_enabled = true, registration_opens_at = '2027-01-01T01:00:00Z',
                         registration_closes_at = '2027-02-01T01:00:00Z', registration_limit = 80 WHERE id = $1`, [eventId]));
    await asUser(coordinator, (client) => client.query('UPDATE events SET registration_limit = 90 WHERE id = $1', [eventId]));

    for (const viewer of [coordinator, organiser]) {
      const entries = ((await history(app, viewer, eventId)).body.sections.registrations as Entry[])
        .filter((entry) => entry.action === 'registration_settings_changed');
      expect(entries.map((entry) => [entry.summary, entry.actor.name])).toEqual([
        ['Registration settings changed', 'SPM157 Coordinator'],
        ['Registration settings changed', 'SPM157 Coordinator'],
      ]);
      expect(entries[0].changes).toEqual([
        { field: 'registrationEnabled', label: 'Registration open', from: false, to: true },
        { field: 'registrationOpensAt', label: 'Registration opens', from: null, to: '2027-01-01T01:00:00.000Z' },
        { field: 'registrationClosesAt', label: 'Registration closes', from: null, to: '2027-02-01T01:00:00.000Z' },
        { field: 'registrationLimit', label: 'Capacity', from: 1, to: 80 },
      ]);
      expect(entries[1].changes).toEqual([{ field: 'registrationLimit', label: 'Capacity', from: 80, to: 90 }]);
    }
  });

  // AUDIT-HISTORY-05-D: a change made outside a signed-in request is the system's.
  it('AUDIT-HISTORY-05-D records a change with no signed-in user as made by the system', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Confirmed' });
    await asUser(null, (client) => client.query("UPDATE events SET status = 'Completed' WHERE id = $1", [eventId]));

    const entries = (await history(app, coordinator, eventId)).body.sections.event as Entry[];
    expect(entries.at(-1)).toMatchObject({
      summary: 'Event completed',
      changes: [{ field: 'status', label: 'Status', from: 'Confirmed', to: 'Completed' }],
      actor: { kind: 'system', name: 'System' },
    });
  });

  // AUDIT-HISTORY-06-B: the history stays readable after the event is Completed or Cancelled.
  it.each(['Completed', 'Cancelled'])('AUDIT-HISTORY-06-B keeps the history of a %s event readable', async (status) => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Confirmed' });
    await asUser(coordinator, (client) => client.query('UPDATE events SET status = $2 WHERE id = $1', [eventId, status]));

    for (const viewer of [coordinator, organiser]) {
      const body = (await history(app, viewer, eventId)).body;
      expect(body.eventStatus).toBe(status);
      expect((body.sections.event as Entry[]).at(-1)).toMatchObject({
        summary: `Event ${status.toLowerCase()}`,
        changes: [{ field: 'status', label: 'Status', from: 'Confirmed', to: status }],
        actor: { name: 'SPM157 Coordinator' },
      });
    }
  });

  // AUDIT-HISTORY-09-A, AUDIT-HISTORY-09-B: nobody else can read the history.
  it('AUDIT-HISTORY-09-A / 09-B refuses everyone but the assigned coordinator and the owner', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator });
    for (const [role, name] of [
      ['COORDINATOR', 'SPM157 Other Coordinator'],
      ['ORGANISER', 'SPM157 Other Organiser'],
      ['ATTENDEE', 'SPM157 Attendee'],
      ['VENUE_STAFF', 'SPM157 Venue Staff'],
      ['TECH_SUPPORT', 'SPM157 Technical Support'],
      ['COORDINATOR_LEAD', 'SPM157 Lead'],
      ['SAFETY_OFFICER', 'SPM157 Safety Officer'],
    ]) {
      const other = await createUser(app, role, name);
      const refused = await history(app, other, eventId, 403);
      expect(refused.body).toMatchObject({ code: 'FORBIDDEN' });
    }
    await history(app, coordinator, randomUUID(), 404);
    await history(app, coordinator, 'not-a-uuid', 404);
    await history(app, null, eventId, 401);
  });

  // AUDIT-HISTORY-10-A, AUDIT-HISTORY-10-B: entries cannot be changed through the API or in the database.
  it('AUDIT-HISTORY-10-A / 10-B keeps entries unchangeable', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const eventId = await seedEvent({ organiser, coordinator });
    const before = (await history(app, coordinator, eventId)).body.sections.event as Entry[];
    const entryId = before[0].id;

    for (const method of ['put', 'patch', 'delete'] as const) {
      for (const path of [`/api/events/${eventId}/history`, `/api/events/${eventId}/history/${entryId}`]) {
        const response = await request(app.getHttpServer())[method](path).set('Cookie', coordinator.cookie)
          .send({ reason: 'edited' }).expect(405);
        expect(response.headers.allow).toBe('GET');
        expect(response.body.message).toBe('The event history cannot be changed.');
      }
    }
    await expect(pool.query("UPDATE event_audit_log SET reason = 'edited' WHERE event_id = $1", [eventId]))
      .rejects.toThrow('event_audit_log is append-only');
    await expect(pool.query('DELETE FROM event_audit_log WHERE event_id = $1', [eventId]))
      .rejects.toThrow('event_audit_log is append-only');
    expect((await history(app, coordinator, eventId)).body.sections.event).toEqual(before);
  });

  // AUDIT-HISTORY-11-A: at release, earlier records are loaded; an earlier entry without a recorded author says so.
  it('AUDIT-HISTORY-11-A loads earlier records once, naming an author only where one was recorded', async () => {
    const app = await startApp();
    const organiser = await createUser(app, 'ORGANISER', 'SPM157 Organiser');
    const coordinator = await createUser(app, 'COORDINATOR', 'SPM157 Coordinator');
    const staff = await createUser(app, 'VENUE_STAFF', 'SPM157 Venue Staff');
    const attendee = await createUser(app, 'ATTENDEE', 'SPM157 Ann');
    const eventId = await seedEvent({ organiser, coordinator, status: 'Planning' });
    const venue = await seedVenue(staff, 'SPM157 Hall');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Earlier records, as other stories wrote them before SPM-157.
      await client.query(
        `INSERT INTO event_status_history (id, event_id, from_status, to_status, actor_id, created_at)
         VALUES ($1, $2, 'Approved', 'Planning', $3, '2026-10-01T01:00:00Z')`, [randomUUID(), eventId, coordinator.uid]);
      const booking = await client.query<{ id: string }>(
        `INSERT INTO venue_bookings (venue_id, event_id, start_at, end_at, status, created_at)
         VALUES ($1, $2, '2027-03-01T10:00:00Z', '2027-03-01T12:00:00Z', 'approved', '2026-10-02T01:00:00Z') RETURNING id`,
        [venue, eventId]);
      await client.query(
        `INSERT INTO booking_review_log (booking_id, actor_user_id, action, created_at) VALUES ($1, $2, 'approved', '2026-10-03T01:00:00Z')`,
        [booking.rows[0].id, staff.uid]);
      await client.query(
        `INSERT INTO event_registrations (event_id, attendee_id, status, full_name, email, created_at, registered_at, withdrawn_at)
         VALUES ($1, $2, 'Withdrawn', $3, 'a@example.test', '2026-10-04T01:00:00Z', '2026-10-04T01:00:00Z', '2026-10-05T01:00:00Z')`,
        [eventId, attendee.uid, attendee.name]);
      // An empty log, as at release; then the release migration.
      await client.query('ALTER TABLE event_audit_log DISABLE TRIGGER event_audit_log_append_only');
      await client.query('DELETE FROM event_audit_log');
      await client.query('ALTER TABLE event_audit_log ENABLE TRIGGER event_audit_log_append_only');
      await client.query(await readFile(MIGRATION, 'utf8'));
      const loaded = await client.query<{ section: string; action: string; actor_kind: string; actor_name: string | null }>(
        `SELECT section, action, actor_kind, actor_name FROM event_audit_log WHERE event_id = $1 ORDER BY occurred_at, id`, [eventId]);
      expect(loaded.rows.map((row) => [row.section, row.action, row.actor_kind, row.actor_name])).toEqual([
        ['event', 'status_changed', 'user', 'SPM157 Coordinator'],
        ['venue_booking', 'booking_requested', 'unrecorded', null],
        ['venue_booking', 'booking_approved', 'user', 'SPM157 Venue Staff'],
        ['registration', 'registered', 'user', 'SPM157 Ann'],
        ['registration', 'registration_withdrawn', 'user', 'SPM157 Ann'],
        // The event row itself was created now, after the earlier records above.
        ['event', 'submitted', 'user', 'SPM157 Organiser'],
      ]);
      // Re-running the migration loads nothing twice.
      const count = async () => Number((await client.query('SELECT count(*) FROM event_audit_log')).rows[0].count);
      const total = await count();
      await client.query(await readFile(MIGRATION, 'utf8'));
      expect(await count()).toBe(total);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    expect(app).toBeTruthy();
  });
});
